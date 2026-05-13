import type { Choreography, DancerShape } from "../types/choreography";
import { createId, getDefaultPosition } from "./geometry";

const STORAGE_KEY = "formun.choreographies.v1";

export const dancerColors = [
  "bg-primary",
  "bg-accent",
  "bg-success",
  "bg-warning",
  "bg-danger",
  "bg-muted-foreground",
];

const nowIso = () => new Date().toISOString();

export const createDemoChoreography = (): Choreography => {
  const id = createId();
  const dancers = Array.from({ length: 8 }, (_, index) => {
    const shape: DancerShape = index % 3 === 0 ? "triangle" : index % 2 === 0 ? "square" : "circle";
    return {
    id: createId(),
    name: `Dancer ${index + 1}`,
    label: String(index + 1),
    color: dancerColors[index % dancerColors.length],
    shape,
    sortOrder: index,
    };
  });
  const positions = Object.fromEntries(
    dancers.map((dancer, index) => [dancer.id, getDefaultPosition(index, dancers.length, 80, 60)]),
  );
  const nextPositions = Object.fromEntries(
    dancers.map((dancer, index) => {
      const base = getDefaultPosition(dancers.length - index - 1, dancers.length, 80, 60);
      return [dancer.id, { ...base, rotation: index % 2 === 0 ? 45 : 0 }];
    }),
  );
  return {
    id,
    name: "Demo Formation",
    description: "Sample choreography for first run",
    tags: ["demo"],
    stage: {
      width: 80,
      height: 60,
      gridSize: 5,
      backgroundOpacity: 0.35,
    },
    music: {
      name: "Untitled track",
      durationSeconds: 180,
    },
    dancers,
    formations: [
      {
        id: createId(),
        name: "Opening",
        timestampSeconds: 0,
        durationSeconds: 16,
        comments: "Start clean, hold center line.",
        positions,
        sortOrder: 0,
      },
      {
        id: createId(),
        name: "First Shift",
        timestampSeconds: 16,
        durationSeconds: 20,
        comments: "Watch crossings in middle.",
        positions: nextPositions,
        sortOrder: 1,
      },
    ],
    props: [
      {
        id: createId(),
        name: "Platform",
        shape: "rectangle",
        x: 42,
        y: 26,
        width: 16,
        height: 8,
        rotation: 0,
        color: "bg-muted",
        opacity: 0.7,
        locked: false,
      },
    ],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
};

export const loadChoreographies = (): Choreography[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const demo = createDemoChoreography();
      saveChoreographies([demo]);
      return [demo];
    }
    const parsed = JSON.parse(raw) as Choreography[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveChoreographies = (items: Choreography[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
};

export const touchChoreography = (choreography: Choreography): Choreography => ({
  ...choreography,
  updatedAt: nowIso(),
});

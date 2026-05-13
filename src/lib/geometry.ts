import type { Choreography, DancerPosition, Formation } from "../types/choreography";

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const snap = (value: number, gridSize: number) => {
  if (!gridSize) return value;
  return Math.round(value / gridSize) * gridSize;
};

export const formatTimestamp = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
};

export const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const getSortedFormations = (choreography: Choreography) =>
  [...choreography.formations].sort((a, b) => a.sortOrder - b.sortOrder);

export const getSortedDancers = (choreography: Choreography) =>
  [...choreography.dancers].sort((a, b) => a.sortOrder - b.sortOrder);

export const getDefaultPosition = (index: number, total: number, stageWidth: number, stageHeight: number): DancerPosition => {
  const columns = Math.ceil(Math.sqrt(total || 1));
  const row = Math.floor(index / columns);
  const column = index % columns;
  const x = ((column + 1) / (columns + 1)) * stageWidth;
  const y = ((row + 1) / (Math.ceil((total || 1) / columns) + 1)) * stageHeight;
  return { x, y, rotation: 0, path: { type: "straight" } };
};

export const getPreviousFormation = (formations: Formation[], activeFormationId: string) => {
  const sorted = [...formations].sort((a, b) => a.sortOrder - b.sortOrder);
  const index = sorted.findIndex((formation) => formation.id === activeFormationId);
  if (index <= 0) return undefined;
  return sorted[index - 1];
};

const orientation = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
  const value = (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
  if (Math.abs(value) < 0.0001) return 0;
  return value > 0 ? 1 : 2;
};

export const segmentsIntersect = (
  a1: DancerPosition,
  a2: DancerPosition,
  b1: DancerPosition,
  b2: DancerPosition,
) => {
  const o1 = orientation(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y);
  const o2 = orientation(a1.x, a1.y, a2.x, a2.y, b2.x, b2.y);
  const o3 = orientation(b1.x, b1.y, b2.x, b2.y, a1.x, a1.y);
  const o4 = orientation(b1.x, b1.y, b2.x, b2.y, a2.x, a2.y);
  return o1 !== o2 && o3 !== o4;
};

export const detectTrafficConflicts = (current: Formation, previous?: Formation) => {
  if (!previous) return [];
  const dancerIds = Object.keys(current.positions).filter((id) => previous.positions[id]);
  const conflicts: Array<[string, string]> = [];
  for (let i = 0; i < dancerIds.length; i += 1) {
    for (let j = i + 1; j < dancerIds.length; j += 1) {
      const first = dancerIds[i];
      const second = dancerIds[j];
      if (
        segmentsIntersect(
          previous.positions[first],
          current.positions[first],
          previous.positions[second],
          current.positions[second],
        )
      ) {
        conflicts.push([first, second]);
      }
    }
  }
  return conflicts;
};

export type DancerShape = "circle" | "square" | "triangle";
export type PropShape = "rectangle" | "circle";

export interface StageConfig {
  width: number;
  height: number;
  gridSize: number;
  backgroundDataUrl?: string;
  backgroundOpacity: number;
}

export interface MusicConfig {
  name: string;
  durationSeconds?: number;
}

export interface Dancer {
  id: string;
  name: string;
  label: string;
  color: string;
  shape: DancerShape;
  sortOrder: number;
}

export interface PathConfig {
  type: "straight" | "curve";
  controlX?: number;
  controlY?: number;
}

export interface DancerPosition {
  x: number;
  y: number;
  rotation: number;
  color?: string;
  path?: PathConfig;
}

export interface Formation {
  id: string;
  name: string;
  timestampSeconds: number;
  durationSeconds?: number;
  comments?: string;
  positions: Record<string, DancerPosition>;
  sortOrder: number;
}

export interface StageProp {
  id: string;
  formationId?: string;
  name?: string;
  shape: PropShape;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  opacity: number;
  locked: boolean;
}

export interface Choreography {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  performanceDate?: string;
  stage: StageConfig;
  music?: MusicConfig;
  dancers: Dancer[];
  formations: Formation[];
  props: StageProp[];
  createdAt: string;
  updatedAt: string;
}

export interface DragState {
  type: "dancer" | "prop" | "path-control";
  id: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

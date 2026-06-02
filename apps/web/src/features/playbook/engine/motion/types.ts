export type MotionStyle = "primary" | "secondary" | "accent" | "muted";

export type MotionTextStyle = "title" | "label" | "caption";

export type MotionObject =
  | {
      id: string;
      type: "point";
      x: number;
      y: number;
      r?: number;
      label?: string;
      style?: MotionStyle;
    }
  | {
      id: string;
      type: "segment";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      label?: string;
      arrow?: boolean;
      style?: MotionStyle;
    }
  | {
      id: string;
      type: "polygon";
      points: Array<[number, number]>;
      label?: string;
      style?: MotionStyle;
    }
  | {
      id: string;
      type: "text";
      x: number;
      y: number;
      text: string;
      style?: MotionTextStyle;
    };

export type MotionTrackProperty =
  | "opacity"
  | "x"
  | "y"
  | "scale"
  | "rotate"
  | "drawProgress"
  | "highlight";

export type MotionEasing = "linear" | "easeOut" | "easeInOut" | "spring";

export interface MotionTrack {
  target: string;
  property: MotionTrackProperty;
  keyframes: Array<{
    t: number;
    value: number;
  }>;
  easing?: MotionEasing;
}

export interface CameraTrack {
  keyframes: Array<{
    t: number;
    x: number;
    y: number;
    zoom: number;
  }>;
  easing?: Exclude<MotionEasing, "spring">;
}

export interface MotionSceneSnapshot {
  kind: "motion_scene";
  viewport: {
    width: number;
    height: number;
    world: {
      xMin: number;
      xMax: number;
      yMin: number;
      yMax: number;
    };
  };
  objects: MotionObject[];
  tracks: MotionTrack[];
  camera?: CameraTrack;
}

export interface ResolvedMotionObjectState {
  opacity: number;
  x: number;
  y: number;
  scale: number;
  rotate: number;
  drawProgress: number;
  highlight: number;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

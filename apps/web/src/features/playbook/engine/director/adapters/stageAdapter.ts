import { stageTransformForBeat } from "../stageTransform";
import type { DirectorAdapter } from "./types";

export const StageDirectorAdapter: DirectorAdapter = {
  supports: () => true,
  build: ({ beat, localProgress }) => ({
    adapter: "stage",
    reason: beat ? `stage:${beat.camera_motion}` : "no beat",
    stageTransform: stageTransformForBeat(beat, localProgress),
    mathScene: null,
  }),
};

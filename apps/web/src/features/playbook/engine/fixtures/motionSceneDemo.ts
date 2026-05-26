import { PLAYBOOK_DEFAULTS } from "../../../../shared/config/constants";
import type { PlaybookScript } from "../types";

export const motionSceneDemo = {
  fps: PLAYBOOK_DEFAULTS.FPS,
  total_frames: PLAYBOOK_DEFAULTS.STEP_FRAMES * 3,
  domain: "math",
  title: "勾股定理局部构造",
  summary: "用对象身份、属性轨道和运镜演示稳定画面中的局部运动。",
  parameter_controls: [],
  steps: [
    {
      step_id: "motion-scene-demo",
      end_frame: PLAYBOOK_DEFAULTS.STEP_FRAMES * 3,
      title: "对象持续存在，只有被讲到的对象运动",
      voiceover_text: "先构造直角三角形，再让正方形和公式按讲解节奏出现，镜头只跟随当前焦点。",
      tokens: [],
      snapshot: {
        kind: "motion_scene",
        viewport: {
          width: PLAYBOOK_DEFAULTS.COMPOSITION_WIDTH,
          height: PLAYBOOK_DEFAULTS.COMPOSITION_HEIGHT,
          world: {
            xMin: 0,
            xMax: PLAYBOOK_DEFAULTS.COMPOSITION_WIDTH,
            yMin: 0,
            yMax: PLAYBOOK_DEFAULTS.COMPOSITION_HEIGHT,
          },
        },
        objects: [
          {
            id: "triangle",
            type: "polygon",
            points: [
              [220, 380],
              [580, 380],
              [220, 140],
            ],
            label: "直角三角形",
            style: "primary",
          },
          {
            id: "right_angle",
            type: "segment",
            x1: 220,
            y1: 380,
            x2: 260,
            y2: 380,
            style: "accent",
          },
          {
            id: "height_edge",
            type: "segment",
            x1: 220,
            y1: 380,
            x2: 220,
            y2: 140,
            label: "b",
            style: "secondary",
          },
          {
            id: "base_edge",
            type: "segment",
            x1: 220,
            y1: 380,
            x2: 580,
            y2: 380,
            label: "a",
            style: "secondary",
          },
          {
            id: "square_a",
            type: "polygon",
            points: [
              [220, 380],
              [580, 380],
              [580, 500],
              [220, 500],
            ],
            label: "a²",
            style: "secondary",
          },
          {
            id: "formula",
            type: "text",
            x: 650,
            y: 120,
            text: "a² + b² = c²",
            style: "title",
          },
        ],
        tracks: [
          {
            target: "base_edge",
            property: "drawProgress",
            keyframes: [
              { t: 0, value: 0 },
              { t: 0.25, value: 1 },
            ],
            easing: "easeOut",
          },
          {
            target: "height_edge",
            property: "drawProgress",
            keyframes: [
              { t: 0.08, value: 0 },
              { t: 0.32, value: 1 },
            ],
            easing: "easeOut",
          },
          {
            target: "square_a",
            property: "opacity",
            keyframes: [
              { t: 0, value: 0 },
              { t: 0.25, value: 0 },
              { t: 0.45, value: 1 },
            ],
            easing: "easeInOut",
          },
          {
            target: "square_a",
            property: "scale",
            keyframes: [
              { t: 0.25, value: 0.92 },
              { t: 0.45, value: 1 },
            ],
            easing: "easeOut",
          },
          {
            target: "formula",
            property: "opacity",
            keyframes: [
              { t: 0, value: 0 },
              { t: 0.6, value: 0 },
              { t: 0.82, value: 1 },
            ],
            easing: "easeOut",
          },
          {
            target: "formula",
            property: "x",
            keyframes: [
              { t: 0.6, value: 24 },
              { t: 0.82, value: 0 },
            ],
            easing: "easeOut",
          },
          {
            target: "triangle",
            property: "highlight",
            keyframes: [
              { t: 0, value: 0.4 },
              { t: 0.35, value: 0 },
            ],
            easing: "easeOut",
          },
        ],
        camera: {
          keyframes: [
            { t: 0, x: 480, y: 270, zoom: 1 },
            { t: 0.35, x: 300, y: 320, zoom: 1.35 },
            { t: 0.7, x: 520, y: 260, zoom: 1 },
          ],
          easing: "easeInOut",
        },
      },
    },
  ],
} satisfies PlaybookScript;

import { PLAYBOOK_DEFAULTS } from "../../../../shared/config/constants";
import type { PlaybookScript } from "../types";

export const motionSceneDemo = {
  fps: PLAYBOOK_DEFAULTS.FPS,
  total_frames: PLAYBOOK_DEFAULTS.STEP_FRAMES,
  domain: "math",
  title: "勾股定理局部构造",
  summary: "用对象身份、属性轨道和运镜演示稳定画面中的局部运动。",
  parameter_controls: [],
  steps: [
    {
      step_id: "motion-scene-demo",
      end_frame: PLAYBOOK_DEFAULTS.STEP_FRAMES,
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
            id: "base_edge",
            type: "segment",
            x1: 280,
            y1: 320,
            x2: 460,
            y2: 320,
            style: "secondary",
          },
          {
            id: "height_edge",
            type: "segment",
            x1: 280,
            y1: 320,
            x2: 280,
            y2: 185,
            style: "secondary",
          },
          {
            id: "hypotenuse_edge",
            type: "segment",
            x1: 280,
            y1: 185,
            x2: 460,
            y2: 320,
            style: "primary",
          },
          {
            id: "triangle_fill",
            type: "polygon",
            points: [
              [280, 320],
              [460, 320],
              [280, 185],
            ],
            style: "primary",
          },
          {
            id: "right_angle_h",
            type: "segment",
            x1: 280,
            y1: 290,
            x2: 310,
            y2: 290,
            style: "accent",
          },
          {
            id: "right_angle_v",
            type: "segment",
            x1: 310,
            y1: 320,
            x2: 310,
            y2: 290,
            style: "accent",
          },
          {
            id: "square_a",
            type: "polygon",
            points: [
              [280, 320],
              [460, 320],
              [460, 500],
              [280, 500],
            ],
            label: "a²",
            style: "secondary",
          },
          {
            id: "label_a",
            type: "text",
            x: 364,
            y: 350,
            text: "a",
            style: "label",
          },
          {
            id: "label_b",
            type: "text",
            x: 246,
            y: 256,
            text: "b",
            style: "label",
          },
          {
            id: "label_c",
            type: "text",
            x: 382,
            y: 242,
            text: "c",
            style: "label",
          },
          {
            id: "formula",
            type: "text",
            x: 620,
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
              { t: 0.18, value: 1 },
            ],
            easing: "easeOut",
          },
          {
            target: "height_edge",
            property: "drawProgress",
            keyframes: [
              { t: 0.08, value: 0 },
              { t: 0.26, value: 1 },
            ],
            easing: "easeOut",
          },
          {
            target: "hypotenuse_edge",
            property: "drawProgress",
            keyframes: [
              { t: 0.18, value: 0 },
              { t: 0.36, value: 1 },
            ],
            easing: "easeOut",
          },
          {
            target: "triangle_fill",
            property: "opacity",
            keyframes: [
              { t: 0, value: 0 },
              { t: 0.32, value: 0 },
              { t: 0.45, value: 1 },
            ],
            easing: "easeInOut",
          },
          {
            target: "right_angle_h",
            property: "opacity",
            keyframes: [
              { t: 0, value: 0 },
              { t: 0.28, value: 0 },
              { t: 0.36, value: 1 },
            ],
            easing: "easeOut",
          },
          {
            target: "right_angle_v",
            property: "opacity",
            keyframes: [
              { t: 0, value: 0 },
              { t: 0.3, value: 0 },
              { t: 0.38, value: 1 },
            ],
            easing: "easeOut",
          },
          {
            target: "label_a",
            property: "opacity",
            keyframes: [
              { t: 0, value: 0 },
              { t: 0.2, value: 0 },
              { t: 0.32, value: 1 },
            ],
            easing: "easeOut",
          },
          {
            target: "label_b",
            property: "opacity",
            keyframes: [
              { t: 0, value: 0 },
              { t: 0.28, value: 0 },
              { t: 0.4, value: 1 },
            ],
            easing: "easeOut",
          },
          {
            target: "label_c",
            property: "opacity",
            keyframes: [
              { t: 0, value: 0 },
              { t: 0.36, value: 0 },
              { t: 0.48, value: 1 },
            ],
            easing: "easeOut",
          },
          {
            target: "square_a",
            property: "opacity",
            keyframes: [
              { t: 0, value: 0 },
              { t: 0.42, value: 0 },
              { t: 0.62, value: 1 },
            ],
            easing: "easeInOut",
          },
          {
            target: "square_a",
            property: "scale",
            keyframes: [
              { t: 0.42, value: 0.92 },
              { t: 0.62, value: 1 },
            ],
            easing: "easeOut",
          },
          {
            target: "formula",
            property: "opacity",
            keyframes: [
              { t: 0, value: 0 },
              { t: 0.68, value: 0 },
              { t: 0.86, value: 1 },
            ],
            easing: "easeOut",
          },
          {
            target: "formula",
            property: "x",
            keyframes: [
              { t: 0.68, value: 24 },
              { t: 0.86, value: 0 },
            ],
            easing: "easeOut",
          },
        ],
        camera: {
          keyframes: [
            { t: 0, x: 480, y: 270, zoom: 1 },
            { t: 0.38, x: 330, y: 300, zoom: 1.45 },
            { t: 0.72, x: 500, y: 280, zoom: 1 },
          ],
          easing: "easeInOut",
        },
      },
    },
  ],
} satisfies PlaybookScript;

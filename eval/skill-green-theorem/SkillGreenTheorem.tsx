import React from "react";
import {
  AbsoluteFill,
  Composition,
  Easing,
  interpolate,
  registerRoot,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const WIDTH = 960;
const HEIGHT = 540;
const FPS = 30;
const DURATION_FRAMES = 36 * FPS;

type Segment = {
  title: string;
  caption: string;
};

const SEGMENTS: Segment[] = [
  {
    title: "格林公式",
    caption: "它把闭合边界上的环流，换成区域内部旋度的总和。",
  },
  {
    title: "区域 D 与正向边界 ∂D",
    caption: "正向是逆时针，沿边界走时区域始终在左手边。",
  },
  {
    title: "向量场 F = (-y/2, x/2)",
    caption: "箭头在平面内形成稳定逆时针旋转，旋度处处为 1。",
  },
  {
    title: "左边：沿边界累加",
    caption: "线积分 ∮C P dx + Q dy 只沿边界 C 计算一圈总环流。",
  },
  {
    title: "右边：累加内部旋度",
    caption: "面积积分把每个小面积里的局部旋转密度加起来。",
  },
  {
    title: "边界环流 = 内部旋度总量",
    caption: "单位正方形中两边都等于 1，这就是格林公式的几何直觉。",
  },
];

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const ease = (value: number) =>
  Easing.bezier(0.16, 1, 0.3, 1)(clamp01(value));

const sceneProgress = (frame: number, sceneIndex: number, fps: number) => {
  const start = sceneIndex * 6 * fps;
  const end = start + 6 * fps;
  return ease((frame - start) / (end - start));
};

const fadeForScene = (frame: number, sceneIndex: number, fps: number) => {
  const start = sceneIndex * 6 * fps;
  const end = start + 6 * fps;
  const inPart = clamp01((frame - start) / (0.8 * fps));
  const outPart = clamp01((end - frame) / (0.8 * fps));
  return Math.min(ease(inPart), ease(outPart));
};

const activeSegmentIndex = (frame: number, fps: number) =>
  Math.min(SEGMENTS.length - 1, Math.floor(frame / (6 * fps)));

const world = {
  x0: -0.35,
  x1: 1.35,
  y0: -0.35,
  y1: 1.35,
  left: 324,
  top: 104,
  size: 286,
};

const toScreen = (x: number, y: number): [number, number] => {
  const sx = world.left + ((x - world.x0) / (world.x1 - world.x0)) * world.size;
  const sy = world.top + world.size - ((y - world.y0) / (world.y1 - world.y0)) * world.size;
  return [sx, sy];
};

const vectorPoints = [-0.2, 0, 0.25, 0.5, 0.75, 1, 1.2].flatMap((x) =>
  [-0.2, 0, 0.25, 0.5, 0.75, 1, 1.2].map((y) => ({ x, y })),
);

function Arrow({
  x,
  y,
  opacity,
  scale = 1,
}: {
  x: number;
  y: number;
  opacity: number;
  scale?: number;
}) {
  const [sx, sy] = toScreen(x, y);
  const vx = -0.5 * y;
  const vy = 0.5 * x;
  const len = Math.hypot(vx, vy) || 1;
  const dx = (vx / len) * 25 * scale;
  const dy = (-vy / len) * 25 * scale;
  return (
    <line
      x1={sx - dx * 0.5}
      y1={sy - dy * 0.5}
      x2={sx + dx * 0.5}
      y2={sy + dy * 0.5}
      stroke="#9b5cff"
      strokeWidth={2.1}
      opacity={opacity}
      markerEnd="url(#arrowHead)"
    />
  );
}

function FormulaCard({
  opacity,
  y,
  compact = false,
}: {
  opacity: number;
  y: number;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: compact ? 134 : 86,
        right: compact ? 134 : 86,
        top: y,
        opacity,
        padding: compact ? "24px 34px" : "32px 44px",
        border: "1px solid rgba(224, 230, 255, 0.22)",
        background: "rgba(18, 23, 34, 0.82)",
        borderRadius: 10,
        boxShadow: "0 18px 60px rgba(0,0,0,0.32)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "Times New Roman, STSong, serif",
          fontSize: compact ? 34 : 40,
          color: "#f3f7ff",
          lineHeight: 1.32,
        }}
      >
        <div>∮C P dx + Q dy</div>
        <div>= ∬D (∂Q/∂x - ∂P/∂y) dA</div>
      </div>
      <div
        style={{
          marginTop: 18,
          fontSize: 18,
          color: "#b9c4d6",
          letterSpacing: 0,
        }}
      >
        左边看边界，右边看区域内部
      </div>
    </div>
  );
}

function SceneSvg({ frame, fps }: { frame: number; fps: number }) {
  const regionReveal = Math.max(
    sceneProgress(frame, 1, fps),
    sceneProgress(frame, 2, fps),
    sceneProgress(frame, 3, fps),
    sceneProgress(frame, 4, fps),
    sceneProgress(frame, 5, fps),
  );
  const fieldReveal = Math.max(
    sceneProgress(frame, 2, fps),
    sceneProgress(frame, 4, fps),
    sceneProgress(frame, 5, fps),
  );
  const boundaryReveal = Math.max(
    sceneProgress(frame, 1, fps),
    sceneProgress(frame, 3, fps),
    sceneProgress(frame, 5, fps),
  );
  const areaReveal = sceneProgress(frame, 4, fps);
  const resultReveal = sceneProgress(frame, 5, fps);
  const [x0, y0] = toScreen(0, 0);
  const [x1, y1] = toScreen(1, 1);
  const squareX = x0;
  const squareY = y1;
  const squareSize = x1 - x0;
  const pathLength = 4 * squareSize;

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      style={{ position: "absolute", inset: 0 }}
    >
      <defs>
        <marker
          id="arrowHead"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#9b5cff" />
        </marker>
        <linearGradient id="regionFill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3bd6ff" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#ff7f50" stopOpacity="0.26" />
        </linearGradient>
      </defs>

      {[-0.25, 0, 0.5, 1, 1.25].map((v) => {
        const [gx] = toScreen(v, 0);
        const [, gy] = toScreen(0, v);
        return (
          <React.Fragment key={v}>
            <line x1={gx} x2={gx} y1={72} y2={404} stroke="#243041" strokeWidth={1} />
            <line x1={264} x2={660} y1={gy} y2={gy} stroke="#243041" strokeWidth={1} />
          </React.Fragment>
        );
      })}

      {vectorPoints.map((point, index) => (
        <Arrow
          key={`${point.x}-${point.y}`}
          x={point.x}
          y={point.y}
          opacity={fieldReveal * (0.38 + (index % 5) * 0.08)}
          scale={0.8 + 0.2 * fieldReveal}
        />
      ))}

      <rect
        x={squareX}
        y={squareY}
        width={squareSize}
        height={squareSize}
        fill="url(#regionFill)"
        opacity={0.12 + regionReveal * 0.72}
      />

      {Array.from({ length: 4 }).flatMap((_, ix) =>
        Array.from({ length: 4 }).map((__, iy) => (
          <rect
            key={`${ix}-${iy}`}
            x={squareX + (squareSize / 4) * ix}
            y={squareY + (squareSize / 4) * iy}
            width={squareSize / 4}
            height={squareSize / 4}
            fill="#ffb84d"
            opacity={areaReveal * (0.08 + 0.035 * (ix + iy))}
            stroke="#ffcf75"
            strokeOpacity={areaReveal * 0.45}
          />
        )),
      )}

      <path
        d={`M ${squareX} ${squareY + squareSize} L ${squareX + squareSize} ${
          squareY + squareSize
        } L ${squareX + squareSize} ${squareY} L ${squareX} ${squareY} Z`}
        fill="none"
        stroke="#4de8b0"
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={pathLength}
        strokeDashoffset={pathLength * (1 - boundaryReveal)}
        markerEnd="url(#arrowHead)"
      />

      <circle
        cx={squareX + squareSize * 0.5}
        cy={squareY + squareSize * 0.5}
        r={44 + resultReveal * 30}
        fill="none"
        stroke="#ff7f50"
        strokeWidth={3}
        strokeOpacity={resultReveal}
      />

      <text x={squareX + squareSize / 2} y={squareY + squareSize / 2 + 8} textAnchor="middle">
        <tspan fill="#f2f6ff" fontSize={30} fontFamily="Times New Roman, STSong, serif">
          D
        </tspan>
      </text>
      <text x={squareX + squareSize + 18} y={squareY - 12} fill="#d9e6ff" fontSize={18}>
        ∂D 正向
      </text>
    </svg>
  );
}

function SideLabels({ frame, fps }: { frame: number; fps: number }) {
  const left = fadeForScene(frame, 3, fps);
  const right = fadeForScene(frame, 4, fps);
  const result = fadeForScene(frame, 5, fps);
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 68,
          top: 158,
          width: 238,
          opacity: left,
          color: "#f4f7ff",
          fontSize: 28,
          lineHeight: 1.35,
          fontFamily: "Times New Roman, STSong, serif",
        }}
      >
        ∮<sub>C</sub> P dx + Q dy
        <div style={{ marginTop: 12, fontSize: 17, color: "#aebad0", fontFamily: "system-ui" }}>
          沿边界一圈累加
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: 66,
          top: 156,
          width: 252,
          opacity: right,
          color: "#f4f7ff",
          fontSize: 28,
          lineHeight: 1.35,
          fontFamily: "Times New Roman, STSong, serif",
        }}
      >
        ∬<sub>D</sub> curl F dA
        <div style={{ marginTop: 12, fontSize: 17, color: "#aebad0", fontFamily: "system-ui" }}>
          把内部小旋转加总
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 238,
          right: 238,
          top: 72,
          opacity: result,
          textAlign: "center",
          color: "#ffdf8a",
          fontSize: 34,
          fontFamily: "Times New Roman, STSong, serif",
        }}
      >
        ∮<sub>C</sub> P dx + Q dy = ∬<sub>D</sub> 1 dA = 1
      </div>
    </>
  );
}

function CaptionBar({ frame, fps }: { frame: number; fps: number }) {
  const index = activeSegmentIndex(frame, fps);
  const segment = SEGMENTS[index];
  const progress = frame / DURATION_FRAMES;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 84,
        background: "rgba(4, 7, 12, 0.92)",
        borderTop: "1px solid rgba(255,255,255,0.12)",
        display: "flex",
        alignItems: "center",
        padding: "0 34px",
        gap: 24,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          height: 4,
          width: `${progress * 100}%`,
          background: "#4de8b0",
        }}
      />
      <div style={{ color: "#f4f7ff", fontSize: 20, width: 238 }}>{segment.title}</div>
      <div style={{ color: "#c8d1e2", fontSize: 18, lineHeight: 1.5, flex: 1 }}>
        {segment.caption}
      </div>
      <div style={{ color: "#4de8b0", fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
        {index + 1} / {SEGMENTS.length}
      </div>
    </div>
  );
}

function SkillGreenTheoremVideo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const intro = fadeForScene(frame, 0, fps);
  const scene = Math.max(
    fadeForScene(frame, 1, fps),
    fadeForScene(frame, 2, fps),
    fadeForScene(frame, 3, fps),
    fadeForScene(frame, 4, fps),
    fadeForScene(frame, 5, fps),
  );

  return (
    <AbsoluteFill
      style={{
        background: "radial-gradient(circle at 50% 0%, #17202f 0%, #070a0f 52%, #030406 100%)",
        color: "#f3f7ff",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.18,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />
      <FormulaCard opacity={intro} y={92} />
      <div style={{ opacity: scene }}>
        <SceneSvg frame={frame} fps={fps} />
        <SideLabels frame={frame} fps={fps} />
      </div>
      <CaptionBar frame={frame} fps={fps} />
    </AbsoluteFill>
  );
}

function RemotionRoot() {
  return (
    <Composition
      id="GreenTheoremSkill"
      component={SkillGreenTheoremVideo}
      durationInFrames={DURATION_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
}

registerRoot(RemotionRoot);

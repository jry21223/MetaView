# Remotion 官方 Skills 速查（项目内常用片段）

来源：<https://github.com/remotion-dev/skills/tree/main/skills/remotion/rules>

只摘录本项目用到的几条硬约束 + 常用模式。完整列表见上游仓库。

---

## 1. timing.md — 优先 `interpolate` + `Easing.bezier`，不要 spring

> 来自 `rules/timing.md`

- 用 `interpolate(frame, [from, to], [a, b], { easing, extrapolateLeft: "clamp", extrapolateRight: "clamp" })` 驱动几乎所有动画
- spring 仅在确实需要物理感时使用（弹性回弹）；常规 UI 动画请用 bezier
- timing（节拍）与 mapping（值域映射）解耦：先算一个归一化 `progress ∈ [0,1]`，再各属性 interpolate

### 推荐曲线

| 用途 | bezier | 备注 |
|------|--------|------|
| UI 入场（强缓出） | `Easing.bezier(0.16, 1, 0.3, 1)` | 最常用 |
| 平衡缓动（in-out） | `Easing.bezier(0.45, 0, 0.55, 1)` | 长持续场景 |
| 轻微回弹 / pop | `Easing.bezier(0.34, 1.56, 0.64, 1)` | y > 1 制造过冲 |

```ts
import { interpolate, Easing } from "remotion";

const opacity = interpolate(frame, [0, 30], [0, 1], {
  easing: Easing.bezier(0.16, 1, 0.3, 1),
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
});
```

### 复合动画（共享一个 progress）

```ts
const progress = interpolate(frame, [start, start + dur], [0, 1], {
  easing: Easing.bezier(0.22, 1, 0.36, 1),
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
});
const x       = interpolate(progress, [0, 1], [100, 0]);
const opacity = interpolate(progress, [0, 1], [0, 1]);
```

---

## 2. 禁忌：CSS transition / Tailwind animate

> 来自 `SKILL.md`：

> CSS transitions or animations are FORBIDDEN — they will not render correctly.
> Tailwind animation class names are FORBIDDEN — they will not render correctly.

**项目里所有 `style={{ transition: "..." }}` 都要删掉，换成 `interpolate` 派生。**
（`@remotion/player` 的 Player 实时播放虽然能跑 CSS transition，但与 Remotion 渲染保持一致更安全；同一份代码将来可直接服务端渲染。）

---

## 3. voiceover.md + get-audio-duration.md — 音频长度同步

> 来自 `rules/voiceover.md` 与 `rules/get-audio-duration.md`

**Remotion 官方做法**：在 `calculateMetadata` 里用 Mediabunny `getAudioDuration` 拉伸 scene 时长，让视频长度精确匹配音频。

```ts
import { Input, ALL_FORMATS, UrlSource } from "mediabunny";
// (省略) 返回 input.computeDuration()
```

```ts
const calculateMetadata: CalculateMetadataFunction<Props> = async () => {
  const durations = await Promise.all(
    SCENE_AUDIO_FILES.map(f => getAudioDuration(staticFile(f)))
  );
  return {
    durationInFrames: Math.ceil(durations.reduce((a, d) => a + d * FPS, 0)),
  };
};
```

### 本项目当前选择

我们用 **浏览器实时 TTS**（SpeechSynthesis 或 OpenAI TTS 流），**没有预渲染 mp3**，所以无法预知时长 → `calculateMetadata` 路径不适用。改用 runtime 方案：

1. Player 在 `step.end_frame` 时 pause
2. 监听 `tts.speaking` 由 true → false
3. 触发 `play()`，进入下一步

**未来切换路径**（如果改成预生成 mp3）：把每个 step 的 voiceover 预渲染到 `public/voiceover/{run_id}/{step_id}.mp3`，在 `calculateMetadata` 里调 `getAudioDuration` 重写 `MetaStep.end_frame`，前端就无需 runtime 同步。

---

## 4. transitions.md — 不在本项目使用

`<TransitionSeries>` 用于 scene 间切换（fade/slide/wipe），shorten 时间轴。我们的 step 内动画（cell 位移、呼吸）在单组件里 `interpolate` 即可，无需 `@remotion/transitions`。

---

## 5. SKILL.md — 通用约定

- `useCurrentFrame()` + `interpolate()` 是动画起点
- `<Sequence from={...} durationInFrames={...}>` 控制何时出现/消失
- 资源放 `public/`，用 `staticFile()` 引用
- 动态视频：`<Video>` 来自 `@remotion/media`；动态音频：`<Audio>` 来自 `@remotion/media`

---

## 项目内对应位置

| 用到的 skill 内容 | 项目文件 |
|---|---|
| 禁 CSS transition、用 interpolate | `apps/web/src/features/playbook/engine/renderers/AlgorithmRenderer.tsx` |
| bezier 曲线（入场/回弹） | 同上 |
| 共享 progress 派生多属性 | 同上（cell 位移 + 弹入 + 呼吸） |
| TTS runtime 同步（替代 calculateMetadata） | `apps/web/src/features/playbook/engine/player/usePlaybookController.ts` + `useTTS.ts` |

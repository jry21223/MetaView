# Metaview 核心引擎架构与开发文档 (V1.0)

> 本文档是 Metaview 可视化引擎的开发规范、技术白皮书与项目基础 Wiki。

---

## 1. 项目概述 (Overview)

Metaview 是一个专注于跨学科（算法、数学、物理、生化等）的交互式教学可视化平台。

为了实现极致的播放控制、精准的状态回溯（时间漫游）以及跨渲染上下文（DOM / SVG / WebGL）的统一调度，本项目摒弃基于 iframe 的命令式 HTML 注入方案，全面采用 **基于 React + Remotion 的函数式帧渲染架构**。

**核心思想：** 动画不是被"执行"的，而是基于时间轴（Frame）和快照数据（Snapshot）通过纯函数"映射"出来的。

---

## 2. 技术栈标准 (Technology Stack)

| 层次 | 技术 | 用途 |
|------|------|------|
| 核心框架 | React 19 + TypeScript（严格模式） | UI 组件与类型安全 |
| 引擎调度 | `@remotion/player` | 帧驱动播放器，`play` / `pause` / `seekTo` |
| 状态插值 | `remotion` (`spring`, `interpolate`) | 帧间平滑过渡 |
| 2D 几何（Phase 2） | `Mafs` | SVG 数学坐标系与几何形变 |
| 复杂路径变形（Phase 2） | `flubber` + `@remotion/paths` | 形状 morph 动画 |
| 3D 与粒子（Phase 3） | `@react-three/fiber` + `drei` | WebGL 三维可视化 |
| 无头布局计算 | `d3-hierarchy` + `d3-scale` | 树/图谱布局，坐标系计算 |
| 无头物理（Phase 2） | `Matter.js`（仅 Engine，禁用 Render） | 2D 刚体约束求解 |

---

## 3. 核心架构设计 (Architecture)

系统整体采用 **状态驱动的受控播放器模式 (State-Driven Controlled Player)**，自上而下分为四层：

```
┌────────────────────────────────────────────────┐
│  State Management Layer (状态控制层)             │
│  usePlaybookController — currentStepIndex,      │
│  isPlaying, goToStep, prev, next, onFrameUpdate  │
├────────────────────────────────────────────────┤
│  Player Engine Layer (引擎调度层)               │
│  @remotion/player — 帧计数心脏                  │
│  endFrame 拦截：frame >= step.end_frame → pause  │
├────────────────────────────────────────────────┤
│  Multi-track Rendering Layer (多轨渲染层)        │
│  PlaybookComposition → rendererRegistry          │
│  DOM track: AlgorithmRenderer                    │
│  SVG track: BinaryTreeRenderer / (Mafs)          │
│  WebGL track: (R3F — Phase 3)                    │
├────────────────────────────────────────────────┤
│  Headless Compute Foundation (无头计算底座)      │
│  d3-hierarchy: 树/图谱布局                       │
│  Matter.js Engine: 物理约束 (Phase 2)            │
└────────────────────────────────────────────────┘
```

### 3.1 状态控制层 (State Management)

`usePlaybookController` (`engine/player/usePlaybookController.ts`)

- 维护 `currentStepIndex` 和全局播放状态 `isPlaying`
- 将用户操作（下一步/撤销）转化为对 Player 的 `seekTo(startFrame)` + `play()` 指令
- `onFrameUpdate(frame)` 接受 Player 回调，当 `frame >= step.end_frame` 时调用 `pause()`

### 3.2 引擎调度层 (Player Engine)

`PlaybookPlayer` (`engine/player/PlaybookPlayer.tsx`)

- 接收外部 `PlaybookScript` 并渲染 `@remotion/player`
- `durationInFrames = script.total_frames`，`fps = script.fps`
- 通过 `onTimeUpdate` 监听帧变化，拦截播放到步骤终点

### 3.3 多轨渲染层 (Multi-track Rendering)

`PlaybookComposition` (`engine/composition/PlaybookComposition.tsx`)

- 纯函数组件，无任何副作用（符合 Remotion 约定）
- 通过当前 frame 找到 `activeIndex`，查 `rendererRegistry` 分派到对应渲染器
- 每帧调用 `useStepProgress(startFrame, endFrame)` 获得 `spring()` 插值进度

**轨道分离原则：**
- 文本说明走 DOM 轨道（`div` / `p`）
- 数组 / 树状数据走 SVG 轨道
- 高密度粒子 / 分子走 WebGL 轨道（Phase 3）

### 3.4 无头计算底座 (Headless Compute Foundation)

- `d3-hierarchy` 的 `tree()` 布局在 `useMemo` 中计算，不依赖 Remotion 帧
- Phase 2 引入 `Matter.js` 时，必须基于 frame 推演物理状态（见最佳实践 5.3）

---

## 4. 核心数据结构与接口 (Data Structures)

### 4.1 后端 Python 模型（`apps/api/app/schemas.py`）

```python
class SnapshotKind(str, Enum):
    ALGORITHM_ARRAY = "algorithm_array"
    ALGORITHM_TREE  = "algorithm_tree"
    # Phase 2: MATH_FORMULA, PHYSICS_MOTION, MOLECULE …

class AlgorithmArraySnapshot(BaseModel):
    kind: Literal["algorithm_array"] = "algorithm_array"
    array_values:    list[str]
    active_indices:  list[int] = []   # 当前高亮格
    swap_indices:    list[int] = []   # 参与交换的格
    sorted_indices:  list[int] = []   # 已确定排序的格
    pointers:        dict[str, int] = {}  # {"i": 2, "j": 5, "pivot": 3}

class AlgorithmTreeSnapshot(BaseModel):
    kind: Literal["algorithm_tree"] = "algorithm_tree"
    nodes:           list[dict]   # {id, label}
    edges:           list[dict]   # {from_id, to_id}
    active_node_ids: list[str] = []
    visited_node_ids:list[str] = []
    path_edge_ids:   list[str] = []

class MetaStep(BaseModel):
    step_id:        str
    end_frame:      int           # 该步骤结束时的绝对帧数
    title:          str
    voiceover_text: str
    animation_hint: str | None    # "enter"|"swap"|"compare"|"highlight"|"reveal"|"transform"
    snapshot:       AnySnapshot   # 判别联合

class PlaybookScript(BaseModel):
    fps:               int = 30
    total_frames:      int
    domain:            TopicDomain
    title:             str
    summary:           str
    steps:             list[MetaStep]
    parameter_controls:list[ExecutionParameterControl] = []
```

### 4.2 前端 TypeScript 接口（`apps/web/src/engine/types.ts`）

```typescript
export interface AlgorithmArraySnapshot {
  kind: "algorithm_array";
  array_values:    string[];
  active_indices:  number[];
  swap_indices:    number[];
  sorted_indices:  number[];
  pointers:        Record<string, number>;
}

export interface AlgorithmTreeSnapshot {
  kind: "algorithm_tree";
  nodes:            Array<{ id: string; label: string; x?: number; y?: number }>;
  edges:            Array<{ from_id: string; to_id: string }>;
  active_node_ids:  string[];
  visited_node_ids: string[];
  path_edge_ids:    string[];
}

export interface MetaStep<T extends AnySnapshot = AnySnapshot> {
  step_id:        string;
  end_frame:      number;   // 该步骤结束时的绝对帧数（累加，非相对）
  title:          string;
  voiceover_text: string;
  animation_hint?: string | null;
  snapshot:       T;
}

export interface PlaybookScript {
  fps:               number;
  total_frames:      number;
  domain:            string;
  title:             string;
  summary:           string;
  steps:             MetaStep[];
  parameter_controls:ExecutionParameterControl[];
}
```

---

## 5. 关键开发规范与最佳实践 (Best Practices)

### 5.1 绝对禁止命令式 DOM 操作

- **❌ 错误：** `document.getElementById('node').style.left = '100px'`，或使用带内部时间循环的库（如 GSAP timeline 驱动，jQuery animate）
- **✅ 正确：** 所有坐标、透明度、颜色，通过 `useCurrentFrame()` + `spring()` / `interpolate()` 从快照数据中映射计算得出

### 5.2 资源预加载强制拦截

处理 3D 模型或外部图片时，必须防止画面闪烁：

```tsx
const handle = delayRender("Loading model");
useEffect(() => {
  loadModel(url).then(() => continueRender(handle));
}, []);
```

在 `continueRender` 调用之前，Remotion 播放器时钟被冻结，确保帧截图一致性。

### 5.3 物理引擎的确定性步进

```typescript
// ✅ 正确：基于 Remotion 帧数推演物理状态
const frame = useCurrentFrame();
const fixedDelta = 1000 / script.fps;
// 每帧步进一次，确保相同 frame 产生相同物理状态
Engine.update(engine, fixedDelta);
```

禁止启动 `Matter.Runner`（其内部使用 `requestAnimationFrame`，导致非确定性）。

### 5.4 组件拆分原则

| 角色 | 职责 | 限制 |
|------|------|------|
| **外层容器**（如 `StudioPage`）| 拉取 API 数据，生成 `PlaybookScript` | 可有副作用 |
| **播放器容器**（`PlaybookPlayer`）| 包含 `@remotion/player` 和控制按钮 | 可有副作用 |
| **纯渲染组件**（`AlgorithmRenderer`等）| 仅接收 props，返回 JSX | **禁止任何外部副作用** |

纯渲染组件中不可调用 `fetch`、`setTimeout`、`localStorage`，不可调用 `useRef`（除 Remotion 内部工具）。

### 5.5 快照不可变原则

Renderer 永远不修改传入的 `snapshot`。如需派生状态（如插值指针位置），通过 `interpolateSnapshot()` 产生新对象。

---

## 6. 后端集成：CIR → PlaybookScript 映射 (Backend Integration)

### 6.1 数据流

```
用户 Prompt
  → DomainRouter（分类）
  → PlannerAgent → CirDocument（计划）
  → CoderAgent → Manim 脚本（视频模式）
  → ExecutionMapBuilder → ExecutionMap（含 Checkpoint 时间）
  → PlaybookBuilder → PlaybookScript（html 模式）
```

### 6.2 帧计算逻辑（`apps/api/app/services/playbook_builder.py`）

```python
FPS = 30
DEFAULT_STEP_FRAMES = 60   # 无时间信息时的默认步长（2秒）

# 优先级：ExecutionCheckpoint.end_s - start_s > CirStep.end_time - start_time > 默认值
duration_frames = round((checkpoint.end_s - checkpoint.start_s) * fps)
```

`end_frame` 是**累加值**（绝对帧位置），不是每步的相对帧长。

### 6.3 Snapshot 构建规则

| `visual_kind` | 映射到 | 关键字段来源 |
|---------------|--------|-------------|
| `ARRAY` | `AlgorithmArraySnapshot` | `ExecutionArrayTrack.values`, `array_focus_indices`, tokens |
| `GRAPH` | `AlgorithmTreeSnapshot` | token `id` / `value` 推断父子边 |
| 其他（FLOW / TEXT 等）| `AlgorithmArraySnapshot`（降级）| tokens 作为数组值 |

Phase 2 将为 `FORMULA`、`MOTION`、`MOLECULE` 等增加专属 Snapshot 类型。

---

## 7. 文件目录结构 (File Map)

```
apps/web/src/engine/
├── types.ts                        # PlaybookScript / MetaStep / Snapshot 接口
│
├── player/
│   ├── PlaybookPlayer.tsx          # @remotion/player 包装 + 控制按钮 UI
│   └── usePlaybookController.ts    # 状态控制：步骤跳转、endFrame 拦截
│
├── composition/
│   ├── PlaybookComposition.tsx     # 纯 Remotion 组件：frame → Renderer 分派
│   └── useInterpolatedState.ts     # spring/interpolate 封装工具
│
└── renderers/
    ├── types.ts                    # RendererProps 接口
    ├── registry.ts                 # SnapshotKind → RendererComponent 映射表
    ├── AlgorithmRenderer.tsx       # Phase 1: 数组可视化（DOM/SVG）
    └── BinaryTreeRenderer.tsx      # Phase 1: 二叉树可视化（SVG + d3-hierarchy）
```

```
apps/api/app/services/
└── playbook_builder.py             # CirDocument + ExecutionMap → PlaybookScript
```

---

## 8. MVP 分阶段路线图 (Phased Roadmap)

### Phase 1（当前）—— 算法与基础数据结构可视化

- [x] 核心播放器拦截逻辑（`play` / `pause` / `seekTo`）
- [x] `AlgorithmArraySnapshot`（数组排序、二分查找）
- [x] `AlgorithmTreeSnapshot`（二叉树遍历）
- [x] DOM/SVG 状态映射，`spring()` 插值过渡
- [x] 后端 CIR → PlaybookScript 确定性映射
- [x] `HtmlAnimationPayload` / iframe 路径退休

### Phase 2 —— 数学与物理

- [ ] `MathFormulaSnapshot`（公式变形、坐标系）
- [ ] 引入 `Mafs` SVG 渲染层
- [ ] `PhysicsMotionSnapshot`（质点运动、向量）
- [ ] `Matter.js` 无头物理引擎集成（确定性步进）
- [ ] `delayRender` 资产预加载协议

### Phase 3 —— 3D 生化演示

- [ ] `MoleculeSnapshot`（原子 / 键结构）
- [ ] 引入 `@react-three/fiber` WebGL 轨道
- [ ] 粒子系统（海量 `drei` instanced mesh）
- [ ] 性能基准：帧率 / 内存 / Bundle size

---

## 9. 扩展新的 SnapshotKind (Extension Guide)

1. **后端 schemas.py**：新增 `XxxSnapshot(BaseModel)` + 更新 `AnySnapshot` 联合
2. **后端 playbook_builder.py**：在 `_build_snapshot()` 增加 `VisualKind.XXX` 分支
3. **前端 engine/types.ts**：新增 TypeScript 接口，更新 `AnySnapshot`
4. **前端 renderers/**：新建 `XxxRenderer.tsx`（纯函数，接受 `RendererProps`）
5. **前端 renderers/registry.ts**：注册 `"xxx_kind" → XxxRenderer`
6. **测试**：`apps/api/tests/test_playbook_builder.py` 新增 domain fixture

---

## 10. 常见问题 (FAQ)

**Q: 为何不用 GSAP / Framer Motion？**

A: 这类库依赖内部 `requestAnimationFrame` 循环，无法在 Remotion 的帧预算模型下产生确定性输出。相同 `frame` 必须产生相同像素，才能支持时间漫游与服务端帧截图。

**Q: `PlaybookComposition` 不能有 `useEffect`？**

A: 正确。Remotion 在服务端渲染时不运行副作用。所有数据必须从 `inputProps`（`script`）中派生，不依赖任何异步获取。

**Q: 如何调试某一步的 Snapshot？**

A: 在 `PlaybookComposition.tsx` 临时注入 `console.log(JSON.stringify(step.snapshot, null, 2))`，或直接调用后端 `POST /api/v1/pipeline` 并检查 `response.playbook.steps[n].snapshot`。

# 前端外壳：Landing / Topbar / Stage / Provider

## 公共 Landing 路由

`App.tsx` 在 edition shell 之外注册公共首页：

```text
/             -> LandingRoute
/create       -> IntakeScreen
/run/:runId   -> StudioPage
/history      -> HistoryPage
/cases        -> TemplatesPage（公开案例）
/templates    -> 重定向到 /cases
/settings     -> SettingsPage
```

`LandingRoute` 负责加载与应用内一致的主题变量，并把“开始创建”导航到 `/create`。公共首页不复用应用内 `GlobalTopbar`，避免把营销叙事和工具导航塞进同一个 Shell。

## Stage 路由

`SelfAppShell` / `OpsAppShell` 使用当前路径派生五个应用 Stage：

```ts
type Stage =
  | "intake"
  | "workbench"
  | "history"
  | "templates"
  | "settings";
```

切换通过 `onNavigate(stage)`。每个页面接收同一签名：

```ts
onNavigate: (stage: Stage) => void
```

避免每页定义 `onHome / onHistory / onTemplate` 等 N×M 回调。

Stage 与路径映射：

```text
intake                -> /create
workbench + runId     -> /run/:runId
workbench without id  -> /create
history               -> /history
templates             -> /cases（`/templates` 兼容重定向）
settings              -> /settings
```

未知应用路径回到公共首页 `/`。

## 智能创建入口契约

`/create` 只呈现一个单列输入面，不在前端显示或推断学科、Coverage、Skill、
LessonPlan 或 Director。教师可以输入题目/知识点、粘贴代码，或附加一个代码文件；
“导数与切线 / 二分查找 / 抛体运动”三个按钮只填入自然语言 prompt，不提交、
不选择模板，也不写入 domain。`/cases` 是精选案例的规范地址：可浏览、筛选和播放确定性静态预览；没有可靠 fixture 的案例会明确标记“暂无静态预览”。选择案例只预填 `/create`，不会提交 pipeline。`/templates` 保留为兼容重定向。

正常 Web 提交统一经过 `usePipelineSubmit`，始终发送 `domain: null`：

- 纯文本发送 `source_code/language/source_filename/source_size_bytes: null`；
- 代码附件发送源码、扩展名映射出的真实语言、原始文件名和字节数；
- 附件只允许一个受支持的代码文件，第二次选择替换前一个，大小上限为 256 KB；
- 空输入不提交，`Ctrl/Cmd + Enter` 与按钮共用同一异步防重入口。

这意味着 Web Intake 只收集证据，最终 domain 和能力路径由后端 Router、
CoverageResolver 与 Skill registry 决定。API 仍允许内部调用方显式提供 domain，
但应用 Shell 不使用该兼容入口。
## 运营版游客边界

运营版不再使用全局登录墙。游客可以浏览 `/`、`/create`、`/cases` 和 `/settings`，并在本地填写题目、代码、外观与浏览器语音设置。`/history` 与 `/run/:runId` 保持原路径并显示就地微信登录提示，页面不会挂载受保护的数据 Hook。

游客点击“生成讲解”时，完整输入草稿先保存在 `sessionStorage`，随后打开独立微信登录对话框；不会先调用 pipeline。OAuth 回到 `/` 后只恢复受控站内路径，并在回到 `/create` 后自动提交一次已确认草稿。失败时草稿保留，取消登录或服务未配置也不会替换公共页面。账户、余额、充值、任务历史、已有运行、保存/导出和平台 TTS 仍要求登录。

## GlobalTopbar

`apps/web/src/shared/ui/GlobalTopbar.tsx` 是应用内五个 Stage 共享的顶部栏。**不要**在页面级别复制 Topbar JSX，也不要在公共 Landing Page 中强行复用它。

接口：

```ts
interface GlobalTopbarProps {
  stage: Stage;
  isProviderConfigured: boolean;
  onNavigate: (stage: Stage) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenProviderSettings?: () => void;
}
```

- `stage="intake" | "workbench"` 时“工作台”高亮。
- “任务历史 / 案例 / 设置”分别对应独立路由。
- Provider 状态在 self edition 中保持安静；未配置引导由输入和追问流程承担。
- 工作台可在桌面端折叠 Topbar，移动端始终恢复可见。

## Provider 配置

- Hook：`useProviderSettings`（`apps/web/src/features/providers/hooks/useProviderSettings.ts`）
- 模态：`ProviderSettingsModal`
  - **关闭逻辑**：`onMouseDown` 触发关闭，内层 `onMouseDown` `stopPropagation`。这样从内部拖拽到外部释放鼠标不会误关。
- 凭据保存在 localStorage（用户自带 Key），前端调用 OpenAI 兼容接口（`baseUrl + /chat/completions`）。

## Snapshot support levels

前端 Renderer Registry 可以注册比首发产品面更宽的 Snapshot Kind。`registered` 只表示有渲染器入口；`launch-supported` 才表示生成、Review、导出和产品验收都按首发质量承诺覆盖。

Launch-supported:

- `algorithm_array`, `algorithm_bars`, `algorithm_tree`
- `math_plot`, `math_formula`, `math_scene`
- `matrix_scene`, `table_scene`
- `solid_geometry_scene`
- `katex_overlay`, `narration_card`

Experimental:

- `graph_scene`, `stats_chart_scene`, `iteration_trace_scene`

Parked:

- `phase_portrait_scene`, `complex_plane_scene`
- `optimization_scene`, `modeling_scene`, `manifold_scene`

任何已注册但未列入 launch-supported 的 Kind，都不能仅因为 Registry 可渲染就进入首发生成承诺。

## Studio 布局

`StudioPage` 用 CSS Grid，`--left-w` 控制左栏宽度：

```ts
mainStyle = {
  "--left-w": leftCollapsed ? "0px" : `${t.leftRatio}%`,
  gridTemplateColumns: leftCollapsed ? "1fr" : "var(--left-w) 1fr",
};
```

- `t.leftRatio` 范围 `[12, 50]`（`TweaksPanel` 滑块）。
- 折叠时左 Aside 不渲染（不只是隐藏），由 `mv-left-handle` 浮按钮切回。

### 卡片折叠

左栏两张卡片（`ProblemCard` / `ChatPanel`）各自独立折叠，状态在 `StudioPage` 里持有。

折叠样式见 `studio.css` `.is-collapsed` 选择器。

### ChatPanel

- 直连用户配置的 LLM Provider（不走后端）。
- 每次发送会先 Abort 上一次请求。
- 历史不持久化，Stage 切换即丢失。
- 输入框 Enter 发送，Shift+Enter 换行。
- 未配置 Provider 时禁用输入并显示去配置入口。

## 文件位置约定

- 公共 Landing 页面组合 → `apps/web/src/pages/Landing/`
- 公共 Landing 路由与主题装配 → `apps/web/src/app/LandingRoute.tsx`
- 跨 Stage 共享 UI → `apps/web/src/shared/ui/`
- 单 Stage 专用 → `apps/web/src/pages/<Stage>/` 或 `apps/web/src/features/<feature>/ui/`
- Landing 样式 → `apps/web/src/styles/pages/landing.css`

`shared/` 不得反向导入 `features/` 或 `pages/`。

# 前端外壳：Topbar / Stage / Provider

## Stage 路由

`App.tsx` 用本地状态管理三个 Stage：

```ts
type Stage = 'intake' | 'workbench' | 'history';
```

切换通过 `setStage`（即 `onNavigate` 回调）。每个页面接收同一签名：

```ts
onNavigate: (stage: Stage) => void
```

避免每页定义 `onHome / onHistory / onTemplate` 等 N×M 回调。

## GlobalTopbar

`apps/web/src/shared/ui/GlobalTopbar.tsx` 是三个 stage 共享的顶部栏。**不要**在页面级别复制 topbar JSX。

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

- `stage='intake' | 'workbench'` 时 “工作台” 高亮（intake 是 workbench 的子态）。
- “模板/设置” 当前 disabled，待实现。
- Provider 状态指示：`isProviderConfigured` → `CORE NODES ONLINE` / `NO PROVIDER SET`。

## Provider 配置

- Hook：`useProviderSettings`（`apps/web/src/features/providers/hooks/useProviderSettings.ts`）
- 模态：`ProviderSettingsModal`
  - **关闭逻辑**：`onMouseDown` 触发关闭，内层 `onMouseDown` `stopPropagation`。这样从内部拖拽到外部释放鼠标不会误关。
- 凭据保存在 localStorage（用户自带 key），前端调用 OpenAI 兼容接口（`baseUrl + /chat/completions`）。

## Studio 布局

`StudioPage` 用 CSS Grid，`--left-w` 控制左栏宽度：

```ts
mainStyle = {
  '--left-w': leftCollapsed ? '0px' : `${t.leftRatio}%`,
  gridTemplateColumns: leftCollapsed ? '1fr' : 'var(--left-w) 1fr',
};
```

- `t.leftRatio` 范围 `[12, 50]`（`TweaksPanel` 滑块）。
- 折叠时左 aside 不渲染（不只是隐藏），由 `mv-left-handle` 浮按钮切回。

### 卡片折叠
左栏两张卡片（`ProblemCard` / `ChatPanel`）各自独立折叠，状态在 `StudioPage` 里持有。
折叠样式见 `studio.css` `.is-collapsed` 选择器。

### ChatPanel
- 直连用户配置的 LLM provider（不走后端）。
- 每次发送会先 abort 上一次请求。
- 历史不持久化，stage 切换即丢失。
- 输入框 Enter 发送，Shift+Enter 换行。
- 未配置 provider 时禁用输入并显示去配置入口。

## 文件位置约定

- 跨 stage 共享 UI → `apps/web/src/shared/ui/`
- 单 stage 专用 → `apps/web/src/pages/<Stage>/` 或 `apps/web/src/features/<feature>/ui/`

`shared/` 不得反向导入 `features/` 或 `pages/`。

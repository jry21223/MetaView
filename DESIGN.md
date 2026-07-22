# MetaView Design Language

> 状态：Current baseline v0.3
> 适用范围：`apps/web` 公共页面、输入页、工作台、播放器、历史、模板、设置与共享组件  
> 更新日期：2026-07-18

---

## 1. 设计目标

MetaView 是一个面向教育场景的 AI 可视化讲解系统。它不是通用聊天壳、PPT 生成器或单纯的文本转视频工具，而是将知识问题转化为结构化、可播放、可追问和可导出的理解过程：

```text
学科理解
→ LessonPlan
→ PlaybookScript
→ DirectorScript
→ RenderPlan
→ 交互预览 / 视频导出
```

设计北极星：

> MetaView 应当像一张会推演、会讲解的教材画布，而不是一个会发光的 AI 控制台。

界面必须表达：

- 学术克制，而不是营销喧闹；
- 结构清晰，而不是卡片堆叠；
- 动态但安静，动效服务于因果和焦点；
- 工具可信，过程、状态和版本可被理解；
- 对能力边界诚实，不把 Benchmark 结果冒充上线能力。

---

## 2. 核心视觉隐喻

### 2.1 理论画布

知识在一张可观察、可聚焦、可变化的画布上展开。

可使用：

- 暖白纸张表面；
- 低对比细网格；
- 坐标轴、轨迹、节点和连线；
- 注释、步骤和焦点标记；
- 轻边框，而不是厚重容器。

### 2.2 实验仪器

运行状态和处理过程需要准确、稳定、可控制。

可使用：

- 技术标签；
- Scene / Frame 编号；
- 状态、时间码和版本；
- 参数与明确反馈；
- 等宽字体元信息。

### 2.3 导演工作台

Director 层决定顺序、节奏、镜头和焦点，因此这些概念应在工作台中可见。

可使用：

- 有序步骤；
- 当前场景；
- 时间线或纵向轨道；
- 焦点高亮；
- 高级参数的渐进披露。

### 2.4 当前界面分层

整个前端共享同一套品牌原则，但不同表面承担不同任务，不强制使用完全相同的局部色板：

1. **公共品牌层**：Landing、公共导航和默认产品截图使用暖白 / 克制深色与 Sage Accent；
2. **应用壳层**：工作台、历史、模板、设置共享 `themeVars()` 注入的语义 Token，并允许用户选择工作区主题；
3. **学习播放器层**：播放器使用独立的纸面 Token，保持画布、时间线和控制台之间的阅读层级；
4. **Renderer 层**：数学、算法、科学等 Renderer 可维护表达数据关系所需的局部语义色，但不得反向覆盖应用壳层品牌变量；
5. **运维层**：Ops 页面优先信息密度、状态辨识和操作效率，不套用官网 Hero 语言。

因此，“品牌一致”指层级、语气、交互与默认主题一致，不表示所有数据可视化颜色都必须替换成 Sage。

---

## 3. 禁止方向

不得将 MetaView 设计成：

- 蓝紫渐变的通用 AI SaaS；
- 满屏发光球体或粒子爆炸；
- 类似 Canva 的模板商城；
- 低龄卡通教育产品；
- 默认黑底霓虹的程序员工具；
- 由大量相同卡片组成的 Dashboard。

避免：

- 每个按钮都使用胶囊形；
- 每张卡片都添加阴影；
- 多套图标风格混用；
- 无意义的 3D 装饰；
- 大幅度悬浮、弹跳和缩放；
- 一个视口内存在多个竞争性动态背景。

---

## 4. 品牌系统

主要名称：

```text
MetaView
```

可选中文组合：

```text
演算视界 MetaView
```

可选技术副标：

```text
THEORETICAL CANVAS
```

规则：

- `MetaView` 是主要可读名称；
- `THEORETICAL CANVAS` 只作为小尺寸品牌元信息；
- 一个视口不同时堆叠多个英文口号；
- 中文用于产品叙事，英文用于技术标签和品牌辅助；
- 当前 `.mv-brand-strip` 是小型 UI 品牌标记，不作为大型 Hero 插画。

---

## 5. 色彩

### 5.1 浅色品牌主题

浅色主题是官网、面试演示和默认产品截图的首选。

| Token | Value | Usage |
|---|---:|---|
| `--bg` | `#F4F1EA` | 页面背景 |
| `--surface` | `#FFFFFF` | 主表面；由 `themeVars()` 注入 |
| `--surface-2` | `#FAF8F3` | 次级表面 |
| `--ink` | `#161A18` | 主文字 |
| `--ink-2` | `#5D655F` | 次级文字 |
| `--ink-3` | `#9AA39D` | 元信息、占位符 |
| `--line` | `#E6E2D5` | 默认边框 |
| `--line-2` | `#D6D1C2` | 强边框 |
| `--accent` | `#82976F` | 品牌强调色 |
| `--accent-soft` | `#82976F26` | 选择和弱高亮；约 15% 透明度 |
| `--warn` | `#E9A23B` | 警告 |

### 5.2 深色主题

| Token | Value |
|---|---:|
| `--bg` | `#0B0F0D` |
| `--surface` | `#11171580` |
| `--surface-2` | `#0E1412` |
| `--ink` | `#E8EFE9` |
| `--ink-2` | `#9BA8A0` |
| `--ink-3` | `#5B6862` |
| `--line` | `#1D2A23` |
| `--line-2` | `#27332C` |
| `--accent` | `#9FB48D` |
| `--accent-soft` | `#9FB48D26` |
| `--warn` | `#E9A23B` |

`--bg-2`、`--accent-2`、`--accent-dim`、`--radius` 和 `--radius-sm` 也由
`themeVars()` 提供。成功、失败等运行状态目前使用页面或组件边界内的语义变量，
例如 History 的 `--mv-status-*`；项目尚未提供全局 `--danger` Token，不应在新代码中假定它存在。

### 5.3 强调色规则

强调色用于：

- 当前步骤；
- 选中状态；
- 主要操作；
- Focus Ring；
- 当前知识对象；
- 进度和在线状态。

不得用于：

- 整页大面积背景；
- 长段正文；
- 每张卡片的装饰；
- 所有图标的默认颜色；
- 替代字号和布局层级。

一个视口通常只有一个主要强调焦点。

Monokai、Nord 和 Solarized 属于工作区个性化主题，不属于 MetaView 品牌色板。公共 Landing
固定跟随品牌 light / dark 类型，不直接继承这些命名工作区主题。

### 5.4 学习画布语义色

播放器进度和 Renderer 画布不得各自复制一套“看起来相近”的固定颜色。应用壳通过
`themeVars()` 发布以下语义角色，Renderer 使用 CSS Variable 并保留来自
`ThemePalette` 的 SSR / Remotion 回退值：

| Token | Role | 约束 |
|---|---|---|
| `--canvas-grid` | 网格、纸面辅助线 | 对比度最低，不得与数据曲线竞争 |
| `--canvas-axis` | 坐标轴、普通节点连线、结构边 | 强于网格、弱于数据与当前焦点 |
| `--canvas-primary` | 主曲线、主路径、当前知识对象 | 默认跟随用户 Accent；公共截图使用 Sage |
| `--canvas-secondary` | 对照曲线、已访问对象、次级数据 | 与主对象可区分，但不建立第二品牌色 |
| `--canvas-focus` | 当前点、切线、活动边、警示性焦点 | 小面积使用；默认采用克制暖色 |

播放器进度轨道使用 `--accent` / `--accent-soft`：底轨与未到达节点使用中性
`--line` / `--ink-3`，当前节点使用 Accent。画布色表达知识关系，进度色表达播放状态，
二者共享主题来源但不能混为同一信息层。

---

## 6. 字体与排版

### 6.1 字体

界面与正文：

```css
font-family:
  "Inter",
  -apple-system,
  system-ui,
  "PingFang SC",
  "Noto Sans SC",
  sans-serif;
```

品牌与展示标题：

```css
font-family: "Space Grotesk", "Inter", sans-serif;
```

技术元信息：

```css
font-family: "IBM Plex Mono", ui-monospace, monospace;
```

等宽字体只用于 Run ID、时间码、Scene、Frame、代码、状态和技术标签，不用于长段教学正文。

代码同步面板必须把全部源码行视为一个连续阅读表面。长代码保持原始缩进、不强制折行，
整个代码视口共享一个横向滚动容器；不得让每个源码行各自产生横向滚动条。活动行背景与
行号栏应覆盖共享内容宽度，避免滚动后高亮被截断。

### 6.2 字号

| Role | Size | Weight | Line Height |
|---|---:|---:|---:|
| Landing Display | `clamp(44px, 5.4vw, 72px)`; mobile `clamp(39px, 12vw, 52px)` | `600–650` | `1.03–1.12` |
| Landing Lead | `clamp(15px, 1.3vw, 17px)`; mobile `14px` | `400–500` | `1.68–1.75` |
| App Hero | `clamp(24px, 2.4vw, 32px)` | `600–650` | `1.25–1.3` |
| Page Title | `26px` | `600` | `1.25` |
| Section Title | `15–18px` | `600` | `1.3` |
| Body | `13–14.5px` | `400` | `1.55–1.65` |
| Control | `11.5–13px` | `500–600` | `1.3–1.45` |
| Metadata | `9.5–11px` | `400–600` | `1.3–1.45` |

规则：

- 中文标题不增加人工字间距；
- 宽字距和大写只用于短技术标签；
- 避免超粗字体；
- 正文默认左对齐；
- 居中仅用于短 Hero、空状态和单一结论。

---

## 7. 间距与密度

基础间距尺度：

```text
4, 6, 8, 10, 12, 14, 18, 24, 32, 48, 64, 96
```

现有密度模式：

```css
.mv-density-compact { --pad: 12px; --gap: 10px; --radius-card: 12px; }
.mv-density-regular { --pad: 18px; --gap: 14px; --radius-card: 14px; }
.mv-density-comfy   { --pad: 24px; --gap: 18px; --radius-card: 16px; }
```

规则：

- 密度模式用于工作台，不控制官网间距；
- 默认密度为 `regular`；
- Landing 分区上下间距使用 `clamp(78px, 9vw, 116px)`，手机收敛为 `70px`；
- 公共页面左右 Padding 默认由 `clamp(18px, 3vw, 32px)` 控制，`640px` 以下为 `14px`；
- 卡片内部 Padding 为 `14–24px`；
- 密度变化不得降低触控目标。

---

## 8. 形状、边框与阴影

### 8.1 圆角

| Role | Radius |
|---|---:|
| 状态 Badge / 代码标签 | `4px` |
| 紧凑控件 | `6–8px` |
| 按钮 / 输入框 | `8–10px` |
| 标准卡片 | `12px` |
| 主 Composer / 大卡片 | `14px` |
| Comfy 卡片 | `16px` |
| 附件 / 建议 / Pill | `999px` |

不是所有按钮都做成 Pill。Pill 只承载短、原子化信息。

### 8.2 边框

```css
border: 1px solid var(--line);
```

Focus 或强边框：

```css
border-color: color-mix(in srgb, var(--accent) 30%, var(--line-2));
```

虚线仅用于建议问题、拖拽区域、空状态和可选操作。

### 8.3 阴影

MetaView 遵循“边框优先，阴影其次”。

阴影只用于：

- 主输入 Composer；
- 学习画布；
- 浮动步骤面板；
- Modal 和 Popover。

普通卡片网格不得全部添加阴影。

---

## 9. 布局

### 9.1 Landing Page

建议容器：

```css
width: min(1200px, calc(100vw - 48px));
margin-inline: auto;
```

结构：

```text
公共导航
Hero：价值主张 + 理论画布
工作原理
四视图联动能力
真实案例预留区
生成链说明
最终 CTA
Footer
```

Hero 必须展示：

```text
题目
→ 教学结构
→ 导演焦点
→ 可视化讲解
```

不得只放通用 Dashboard 截图。

### 9.2 应用 Topbar

- 最小高度 `56px`；
- 半透明 Surface；
- 底部 `1px` 边框；
- 品牌左侧、应用导航居中、工具右侧；
- 应用内首项叫“工作台”，公共 `/` 才叫首页；
- Topbar 的视觉权重低于当前任务。

### 9.3 播放器

桌面结构：

```text
52px 步骤轨道
+ 自适应学习画布
+ 280–348px 控制台
```

学习画布是绝对视觉中心。移动端不得压缩桌面三栏，应改为纵向布局或抽屉。

桌面播放器必须同时适配常见 Mac `16:10` 与 Windows `16:9` 视口，不能只按宽度推导
舞台高度：

- 应用播放器路由建立确定的 Visual Viewport 高度，内部 grid / flex 链保留 `min-height: 0`；
- `16:9` Stage 同时受工作区可用宽度和高度约束，取能完整容纳的最大矩形，不拉伸、不裁切；
- 控制台保持 `280–348px`，主舞台得到剩余空间；低于现有断点时改为下方控制台或竖屏抽屉；
- 宽屏不得通过拉伸 Follow-up、空状态或问题按钮填补高度；内容从面板顶部自然排列；
- 顶部栏展开 / 折叠后重新利用释放的高度，不保留无意义的底部空白。

Follow-up 是一个完整对话框，而不是建议卡片列表：消息流占据主体，输入框固定在面板下部。
常规案例显示三个与当前步骤相关的建议；当经过验收的学科能力包需要把放慢、换解释、强调依据、
改参数和仅改当前步骤五类本地操作全部显式呈现时，可以显示五个。建议均以小型胶囊排列在输入框正上方。窄控制台中胶囊可整体换行，
但不得隐藏滚动条后横向裁切，也不得拉伸为纵向全宽卡片。

### 9.4 卡片原则

卡片必须代表真实信息分组。不得仅为了填补空白、重复父级边框或让页面看起来“有设计”而创建卡片。

---

## 10. 组件

### 10.1 Primary Button

一个区域只允许一个主操作：

```css
background: var(--accent);
color: var(--accent-contrast);
border-color: transparent;
```

`--accent-contrast` 必须根据当前 Accent 动态选择高对比前景色；不得假设白色在浅色和深色
品牌 Accent 上都满足可读性。新主题或用户自定义 Accent 也必须通过同一 Token。

### 10.2 Soft Primary

用于明显但不厚重的操作：

```css
background: color-mix(in srgb, var(--accent) 10%, var(--surface));
color: color-mix(in srgb, var(--accent) 68%, var(--ink));
border-color: color-mix(in srgb, var(--accent) 16%, transparent);
```

### 10.3 Secondary / Ghost

```css
/* Secondary */
background: var(--surface);
color: var(--ink-2);
border: 1px solid var(--line);

/* Ghost */
background: transparent;
border-color: transparent;
color: var(--ink-2);
```

按钮状态：

- Hover 改变颜色、边框或背景；
- 不使用大幅位移和缩放；
- Disabled 使用 `opacity: .5–.6`；
- Focus 必须可见。

### 10.4 Icon Button

- 桌面紧凑工具 `32–36px`；
- 移动端触控目标最小 `44px`；
- 图标视觉尺寸 `14–16px`；
- Stroke Width `1.75–1.8`；
- 同一组不混用 Filled 与 Outline；
- Icon-only Button 必须有 `aria-label`。

### 10.5 Input

- 使用 `--surface` 或 `--surface-2`；
- `1px` 中性边框；
- Focus 使用 Accent Border；
- 不使用高饱和外发光；
- 大尺寸生成 Composer 可以使用轻阴影。

### 10.6 Chip / Pill

- `8px` Chip：筛选、设置、小操作；
- `999px` Pill：附件、建议问题、短状态；
- 长句不得放入 Pill。

---

## 11. 学习画布与 Renderer

学习 Stage：

- 比例 `16:9`；
- 暖白纸张或克制深色表面；
- 圆角约 `8px`；
- 低对比细边框；
- 轻微悬浮；
- 浅色模式不使用厚重黑框。

视觉层级：

1. 核心知识对象；
2. 当前焦点；
3. 辅助结构；
4. 元信息与注释。

数学与科学画面：

- 坐标轴弱于数据；
- 网格保持低对比；
- 公式优先可读；
- 使用空间关系和运动说明因果；
- 跨场景保持对象身份与颜色一致；
- 不为了“高级感”增加无意义粒子。

Director 动效必须表达焦点、顺序、对比、因果、尺度或节奏，不得只为了“更动态”移动镜头。

---

## 12. 装饰性视觉母题

`MetaParticleField` 提供：

```text
canvas
singularity
orbit
comet
```

正式使用规则：

- 只作为装饰；
- 必须 `aria-hidden="true"`；
- 一个主要视口最多一种母题；
- 低透明度；
- 动画周期通常大于 `8s`；
- 移动端简化或隐藏；
- Reduced Motion 下停止。

它应表达“知识轨迹”，而不是宇宙粒子特效。

---

## 13. 动效

| Interaction | Duration |
|---|---:|
| Hover / Color / Border | `150–160ms` |
| Shell / 小面板 | `180ms` |
| Modal | `180–220ms` |
| 环境装饰循环 | `8–44s` |

优先使用：

- `opacity`；
- `transform`；
- `background-color`；
- `border-color`。

建议幅度：

- Translate `2–8px`；
- Scale `0.98–1.02`。

禁止弹跳、大幅缩放、Elastic Easing 和引发布局跳动的动画。

所有装饰动效必须支持：

```css
@media (prefers-reduced-motion: reduce)
```

---

## 14. 响应式与可访问性

断点按表面复用，不建立一套脱离现有布局的全局断点：

| Surface | Current breakpoints |
|---|---|
| Landing | `1080px`, `820px`, `640px`, `390px` |
| App shell / Studio | `900px`, `720px`, `680px`, `640px`, `380px` |
| Player | `1180px`, `920px`, `680px` |
| Tools / Ops | `1024px`, `640px` |

新样式优先加入对应表面的现有断点。只有真实布局在区间内失效时才增加断点，并在同一 PR
中补充相应视口验证。

播放器跨平台回归至少覆盖 `1440 × 900`（16:10）、`1366 × 768`（常见 Windows
小屏）与 `1920 × 1080`（Windows 全高清）。三种视口都必须验证：Stage 比例、控制条可见、
控制台不挤压主画面、Follow-up 内容从顶部开始，以及页面没有无理由的底部空白。

网站级响应式检查不能只判断页面是否出现横向滚动。全局 `overflow-x: hidden` 可能掩盖子元素
被裁切的问题，因此还要在 `820px`、`390px` 与 `320px` 宽度检查元素边界。主导航不得因单个
标签换行而高度错位；移动端分区导航应完整重排，或提供明确可见的横向滚动提示，不得隐藏
滚动条后让末项看似消失。

移动端：

- 单主列；
- Composer 全宽；
- 减少装饰密度；
- 保留导航能力；
- 页面不产生横向滚动；
- 只有 Chip 或时间线允许局部横向滚动；
- 使用 Safe Area 与 Visual Viewport Height；
- 触控目标最小 `44 × 44px`。

可访问性：

- 优先语义化 HTML；
- 支持键盘；
- 使用可见 `:focus-visible`；
- 状态不只依赖颜色；
- 关键信息不能只通过 Hover 出现；
- Modal 正确管理 Focus；
- 异步生成状态使用 `role="status"`、`aria-live` 或等价语义。

Focus 基准：

```css
outline: 2px solid color-mix(in srgb, var(--accent) 46%, transparent);
outline-offset: 2px;
```

---

## 15. 文案

语气：精确、平静、教育导向、动作明确、对能力诚实。

推荐状态：

```text
正在理解题目…
正在生成教学计划…
正在编排画面…
正在准备预览…
```

禁止：

```text
AI 正在施展魔法…
正在创造无限可能…
```

推荐官网表达：

```text
把一道题转化为可播放、可追问、可导出的分步讲解。
```

避免无法验证的口号：

```text
重新定义未来教育。
释放 AI 无限潜力。
```

短英文技术标签可用于 `SCENE 03`、`FRAME 120`、`DIRECTOR`、`RENDER PLAN`，但不能替代正常中文内容。

---

## 16. 实现约束

### 16.1 Source of Truth

当前实现的权威边界按以下顺序理解：

1. `DESIGN.md`：产品设计原则、表面分层和新功能约束；
2. `shared/config/themePalette.ts`：工作区主题中可配置的语义色板；
3. `features/studio-editor/hooks/useTweaks.ts` 的 `themeVars()`：浏览器实际收到的壳层 CSS Variable；
4. `styles/tokens.css`：当前已落地的共享 Density Token；
5. `styles/pages/*.css`：页面布局、页面局部变量和响应式行为；
6. `features/playbook/engine/**`：Renderer / Remotion 所需的局部可视化色板和回退值。

文档描述目标与约束，运行时文件描述当前可用契约。二者不一致时，不得静默选择其中一方：
修改代码时同步更新文档，修改规范时明确标记尚未落地的迁移项。

应用壳层和页面 JSX 不新增固定颜色、圆角和动效时长；Inline Style 仅用于运行时几何和数据值。
Renderer 中与数据语义或导出一致性绑定的颜色可以保留在 Renderer 边界，但应集中为命名色板，
并同时覆盖 light / dark 与 SSR / Remotion 回退路径。

### 16.2 CSS 目录

```text
styles/
  tokens.css
  global.css
  layout.css
  pages/
    landing.css
    landing/
      shell.css
      content.css
      responsive.css
      compat.css
    studio.css
    playbook.css
    history.css
    templates.css
    settings.css
    tools.css
```

- Page CSS 负责页面布局；
- 共享控件应逐步进入独立组件样式；
- 不继续向 `studio.css` 添加 Landing 内容；
- Renderer 样式保持在 Renderer 边界。

### 16.3 React 边界

继续遵守 Feature-Sliced Design：

- `shared/` 不导入 `features/` 或 `pages/`；
- `entities/` 不导入 `features/`；
- Feature 之间不直接互相导入；
- 跨页面 UI 进入 `shared/ui`；
- 页面组合进入 `pages/<Page>`。

---

## 17. 当前已知迁移项

1. 默认品牌与播放器已采用 `#82976F / #9FB48D`，但部分旧 Renderer 仍使用各自的数据色板；迁移时先判断是否属于数据语义，不能机械替换。
2. `tokens.css` 当前主要记录 Density；状态色、间距、圆角、阴影和动效尚未形成完整的全局 Token 契约。
3. `themeVars()` 仍直接提供部分壳层值，`ThemePalette` 尚未覆盖 `--bg`、`--surface`、圆角和完整状态色。
4. `studio.css` 职责较多，Landing 已拆入独立目录，其他共享控件继续按真实复用需求渐进迁移。
5. 当前页面仍存在 `6px–14px` 的圆角漂移；新功能遵守本文角色尺度，不为统一数值进行无关重构。
6. 播放器与 Renderer 存在局部 Token 和硬编码回退，这是渲染 / 导出边界的一部分；新增值应集中管理并保持浏览器与 Remotion 一致。
7. `styles/pages/tools.css` 仍保留未接入的 `--primary` / `--surface-container` 等旧 Token，且当前未由 `index.css` 导入；它不是当前品牌系统的有效来源，迁移前不得继续扩展。
8. 模板页以静态正式案例作为预览来源：列表先展示知识轮廓线描，选中后展开代表帧，完整内容始终进入全局 Playbook 播放器；预览不得触发生成任务。
9. `/` 已作为公共 Landing，输入页使用 `/create`，应用内首项统一称为“工作台”。

---

## 18. Review Checklist

### 品牌

- [ ] 是否像 MetaView，而不是通用 AI SaaS？
- [ ] 视觉焦点是否与学习、推演或知识结构相关？
- [ ] Sage Accent 是否克制使用？
- [ ] 是否避免蓝紫渐变和粒子爆炸？

### 层级

- [ ] 是否只有一个主要操作？
- [ ] 用户能否在五秒内理解页面用途？
- [ ] 卡片是否只用于真实分组？
- [ ] 元信息是否弱于主要内容？

### 组件

- [ ] 颜色、间距、圆角和动效是否 Token 化？
- [ ] 图标风格是否统一？
- [ ] Hover、Active、Disabled、Focus 是否完整？
- [ ] 移动端触控目标是否足够？

### 动效

- [ ] 动效是否说明状态或知识关系？
- [ ] 装饰动效是否足够安静？
- [ ] Reduced Motion 是否可用？

### 响应式

- [ ] `1440 × 900` 桌面检查
- [ ] `1366 × 768` Windows 小屏检查
- [ ] `1920 × 1080` Windows 全高清检查
- [ ] `1024 × 768` 平板 / 小桌面检查
- [ ] `720 × 900` 窄屏检查
- [ ] `390 × 844` 手机检查
- [ ] `320 × 700` 窄手机检查
- [ ] Safe Area / Visual Viewport 检查

### 产品诚实

- [ ] 是否只展示真实支持能力？
- [ ] Experimental 能力是否清楚标记？
- [ ] 案例是否来自真实可运行结果？
- [ ] 文案是否避免夸张 AI 承诺？

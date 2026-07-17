# 精选案例与公开播放

## 产品边界

`/cases` 和 `/cases/:slug` 是公共演示页面。它们位于 `App.tsx` 的 edition shell 之前，因此不进入 `SelfAppShell` 或 `OpsAppShell`，不读取账户、不要求登录，也不触发余额、Provider、pipeline、run 或 follow-up 请求。

公开页面只读取 `apps/web/public/showcases/` 下的普通静态资源：

```text
manifest.json
<slug>/meta.json
<slug>/playbook.json
<slug>/director.json
<slug>/lesson-summary.json
<slug>/quality-summary.json
<slug>/benchmark-summary.json
<slug>/poster.webp
```

`/templates` 保留为兼容入口并重定向到 `/cases`。模板对象和旧模板页不再是公共产品模型。

## 单一案例 schema

权威实现是 `apps/web/src/features/showcases/showcaseSchema.ts`：

- `ShowcaseCaseSchema` 是唯一案例模型来源；`ShowcaseCase` 由 Zod 推断，不再复制 interface、运行时校验和 JSON Schema。
- `showcaseCaseJsonSchema` 从同一份 Zod schema 导出 Draft 2020-12 JSON Schema。
- `safeParseShowcaseCase` 额外执行跨字段约束：精选预览不能标记 `verified`，实时验证至少有三个独立 run 且 `repeatCount` 必须相等，`revision` 能力必须有修订示例。
- URL slug 由严格的小写路径段规则校验，拒绝 `..`、斜杠、反斜杠和编码后的路径片段。
- 公开 `availableActions` 只有 `play` / `regenerate`；`restore` / `export` 不能进入公开动作列表。

证据标签的含义固定为：

| evidence | 页面文案 | 能否称为“已验证” |
|---|---|---|
| `curated-preview` | 精选预览 | 否 |
| `recorded-verified` | 录制验证 | 是 |
| `live-verified` | 实时验证 | 是 |

当前目录里的预览案例使用现有仓库 fixture 和 Remotion smoke 生成的 WebP poster；没有通过线上 Benchmark 的案例不会展示“已验证”。

## 播放边界

`ShowcasePlayer` 只包装现有 `PlaybookPlayer`，由它继续使用 `PlaybookComposition`、`DirectorScript`、`RenderPlan` 和 Remotion。公开页面不新增 renderer，也不渲染原始 JSON、内部 run ID、路径、用户或 Provider 信息。

“用同题生成”只通过 React Router 把 `{ prompt: showcase.prompt }` 带到 `/create`，不会自动提交；用户可以编辑后再决定是否生成。

## 添加或升级案例

1. 先在 schema 中保证元数据和证据类型可验证。
2. 把可公开的摘要写成教学语言，不把原始日志或内部路径放进 `public/showcases`。
3. 使用现有 Playbook/Remotion fixture 生成 poster，并检查桌面、平板、手机和 reduced-motion 视口。
4. 只有 Promotion 阶段得到真实、干净、重复通过的报告后，才把 `curated-preview` 升级为 `recorded-verified` 或 `live-verified`。

## 本地验证

```bash
npm --workspace apps/web run test -- src/features/showcases src/pages/Cases src/app/routing.test.tsx
npm --workspace apps/web run build
make visual-check
```

浏览器检查至少覆盖 `1440×900`、`1280×800`、`768×1024`、`390×844` 和 `375×812`，并确认深浅色、键盘焦点、44px 触控目标、无横向溢出和 `/templates` 重定向。

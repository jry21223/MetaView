# 模板正式案例与静态预览

Status: Active

`/templates` 是模板和正式案例的唯一公共入口。它保留完整的 21 个模板目录，但只有已登记的正式案例可交互；尚未完成的模板必须显示“制作中”并保持禁用，不能退回旧的生成入口。

## 路由与交互

- `/templates`：默认显示专属线描缩略图。第一次点击正式案例时，只在当前行下展开真实 16:9 封面；第二次点击同一行或点击封面按钮，进入 `/templates/:templateId`。
- `/templates/:templateId`：解析静态案例注册表，并始终复用全局 `PlaybookPlayer`。未知或制作中的 ID 显示不可用状态和返回入口。
- `/cases`：兼容重定向到 `/templates`。旧的 BFS、导数和抛体详情链接重定向到对应模板；其他旧详情链接回到模板目录。

同一时刻只允许展开一个模板。筛选或搜索让已选模板消失时必须清除选中状态。桌面键盘 Enter 和移动端点击使用相同的“先展开、再进入”语义。

## 静态运行边界

正式案例由 `apps/web/src/pages/Templates/templatePreviewCases.ts` 中类型化的 `TemplatePreviewCase` 注册表提供。每项包含默认参数、参数控件、确定性 `PlaybookScript` 构建器、`DirectorScript` 和按步骤组织的固定问答。

以下行为全部在浏览器本地完成：

- 播放和切换步骤；
- 调整参数并重新构建脚本；
- 点击预设 Follow-up 并显示固定答案；
- 切换主题和返回模板目录。

这条路径不得调用 API，不得创建 run，不得读取或扣减额度，不得调用 LLM，也不得触发 pipeline。离散参数改变后重新计算步骤并回到第一步；连续参数即时更新当前画面。Follow-up 不提供自由输入框，切换步骤时清除旧答案。

静态模板播放器显式关闭 TTS 入口，避免继承浏览器里曾保存的远程 TTS 配置并意外请求服务端；Studio 和运营版 BYOK 的既有语音/模型配置不受影响。

## 正式案例

| 模板 ID | 内容 | 参数 |
|---|---|---|
| `binary-search` | low/mid/high 收缩、命中或未命中、代码同步、`O(log n)` | 目标值 |
| `bfs-tree` | 当前节点、队列、访问集合、活动边和代码行 | 起始节点 |
| `derivative-tangent` | 割线逼近、切点、切线和 `f'(a)=2a` | 切点 `a` |
| `pole-polar` | 圆外点、两条切线、接触弦与极线方程 | 外点坐标 `k` |
| `projectile` | 速度分解、最高点、落点、时间、高度和射程 | 初速度、角度 |

每个默认案例至少有五个实际状态不同的步骤，每一步固定提供 3 个与当前步骤相关的问题。案例数据必须继续符合 `PlaybookScript`；不要为公开模板引入第二套播放器或渲染协议。

## 封面维护

线描缩略图在 `TemplateLinePreview.tsx` 中使用 inline SVG，只消费设计系统的语义颜色和描边。展开封面来自案例的代表帧，确保缩略图、封面和播放器表达同一内容。

修改案例后，先导出本地脚本：

```bash
npm --workspace apps/web run template-previews:export
```

使用现有 Remotion `playbook` composition 和 `apps/web/scripts/render-shots.mjs` 渲染注册表指定的代表帧，再将审核通过的图片转为 WebP，放到：

```text
apps/web/public/template-previews/<templateId>/poster.webp
```

导出的 JSON、PNG 审核图和其他中间产物留在已忽略的 `apps/web/data/`、`eval/shots/` 或 `eval/reports/`，不要提交。

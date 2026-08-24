# 模板正式案例与静态预览

Status: Active

`/templates` 是模板和正式案例的权威目录。它保留完整的 29 个模板目录，但只有已登记的正式案例可交互；尚未完成的模板必须显示“制作中”并保持禁用，不能退回旧的生成入口。

## 路由与交互

- `/templates`：默认显示专属线描缩略图。第一次点击正式案例时，只在当前行下展开真实 16:9 封面；第二次点击同一行或点击封面按钮，进入 `/templates/:templateId`。
- `/templates/:templateId`：解析静态案例注册表，并始终复用全局 `PlaybookPlayer`。未知或制作中的 ID 显示不可用状态和返回入口。
- `/create`：“二分查找”快捷项直接链接 `/templates/binary-search`；它不填充生成输入，也不提交 pipeline。其他 prompt 示例仍只填充输入框，等待用户明确提交。
- `/cases`：兼容重定向到 `/templates`。旧的 BFS、导数和抛体详情链接重定向到对应模板；其他旧详情链接回到模板目录。

同一时刻只允许展开一个模板。筛选或搜索让已选模板消失时必须清除选中状态。桌面键盘 Enter 和移动端点击使用相同的“先展开、再进入”语义。

## 静态运行边界

普通正式案例仍由 `apps/web/src/pages/Templates/templatePreviewCases.ts` 提供；教师级 Gold 案例由 `apps/web/src/pages/Templates/gold-templates/` 中统一的 `GoldTemplateManifest` 注册，再派生为同一 `TemplatePreviewCase`。Manifest 同时记录 `archetypeId`、数学事实、视觉不变量和教学 rubric。每项包含默认参数、参数控件、确定性 `PlaybookScript` 构建器和按步骤组织的本地 Follow-up 操作；它不建立第二套 Director 或播放器契约。

以下行为全部在浏览器本地完成：

- 播放和切换步骤；
- 调整参数并重新构建脚本；
- 点击预设 Follow-up，并通过现有版本化 semantic-interaction 沙盒修改同一份 `PlaybookScript`；
- 切换主题和返回模板目录。

这条路径（包括 `/create` 的二分查找模板快捷项）不得调用 API，不得创建 run，不得读取或扣减额度，不得调用 LLM，也不得触发 pipeline。Gold 圆锥曲线案例的每一步固定提供五种语义操作：放慢当前段、换一种讲解、强调结论依据、调整一个有效参数、只补充当前一步。参数操作按 Manifest 控件范围夹紧或拒绝，再调用原 Gold builder 和共享圆锥曲线内核重建完整 Playbook；局部操作保留其他步骤，放慢操作顺延后续帧并保持连续时间线。Follow-up 不提供自由输入框，切换步骤时清除旧答案。

静态模板播放器显式关闭 TTS 入口，避免继承浏览器里曾保存的远程 TTS 配置并意外请求服务端；Studio 和运营版 BYOK 的既有语音/模型配置不受影响。

## 正式案例

| 模板 ID | 内容 | 参数 |
|---|---|---|
| `sliding-window` | 等宽数组格上的固定窗口右移、进入/离开元素、单调队列、结果轨道、代码同步、`O(n)` | 窗口大小 `k` |
| `merge-sort` | 分治拆分、区间合并、有序写回、`O(n log n)` | 无（v1 固定升序演示） |
| `quick-sort` | Lomuto 分区、pivot 归位、递归区间、`O(n log n)` 平均 | 无（v1 固定 Lomuto 末元素） |
| `binary-search` | low/mid/high 收缩、命中或未命中、代码同步、`O(log n)` | 目标值 |
| `bfs-tree` | 当前节点、队列、访问集合、活动边和代码行 | 起始节点 |
| `derivative-tangent` | 割线逼近、切点、切线和 `f'(a)=2a` | 切点 `a` |
| `ellipse-string-construction` | 图钉、细绳、笔尖尾迹与椭圆定义（含 2a>2c 退化讨论） | 绳长 `2a`、图钉距离 `2c`、笔尖位置 |
| `ellipse-standard-equation` | 移项、两次平方、`b²=a²−c²` 与标准方程，每步数值验证 | `a`、`c`、验证点 |
| `ellipse-focus-definition` | 两焦点、动点与焦点距离和 | `a`、`b`、动点参数 |
| `parabola-focus-directrix` | 焦点、准线、垂足与等距性质 | `p`、动点参数 |
| `hyperbola-asymptotes` | 两支、渐近线、焦点距离差 | `a`、`b`、动点参数 |
| `line-ellipse-position` | 相交、相切、相离、竖直直线与判别式 | 直线类型及参数 |
| `ellipse-chord-midpoint-locus` | 动弦、中点尾迹、理论轨迹与韦达关系 | 定点、斜率 |
| `pole-polar` | 圆外点、两条切线、接触弦与极线方程 | 外点坐标 `k` |
| `two-sum` | 逐项扫描、补数查询、哈希状态与命中下标 | 固定教学输入 |
| `redox-electron` | 氧化还原反应、电子流、反应物与生成物 | 固定教学反应 |
| `dna-replication` | 模板链、复制叉、互补配对与新链生成 | 固定教学过程 |
| `monsoon` | 东亚海陆热力差异、气压中心、季风与降水 | 季节状态 |

每个默认案例至少有五个实际状态不同的步骤。普通正式案例每一步保留 3 个固定问题；八个 Gold 圆锥曲线案例每一步提供上述 5 个可执行且与当前步骤绑定的语义操作。案例数据必须继续符合 `PlaybookScript`；不要为公开模板引入第二套播放器或渲染协议。

Gold 的公开冻结 Playbook 只用于展示和视觉基线，不能作为真实生成 Benchmark 的输入。隐藏变体及隔离规则见 [gold-template-system.md](./gold-template-system.md)。

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

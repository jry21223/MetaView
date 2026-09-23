# 模板正式案例与静态预览

Status: Active

`/templates` 是模板和正式案例的权威目录。它当前展示 36 个模板条目，其中 29 个已登记为可交互正式案例；尚未完成的模板必须显示“制作中”并保持禁用，不能退回旧的生成入口。随课包聚焦（圆锥曲线、微积分、高中物理 + 高校生态学试点），`two-sum`、`redox-electron`、`monsoon` 及中和占位已从目录隐藏：Gold Manifest、隐藏变体与海报全部保留，仅不再出现在 `/templates`，直链访问显示不可用状态。生态学五案例（种群双课 + 种间双课 + 群落一课）归入独立的“生态学”分区。五个数据结构案例（栈 · 括号匹配、单调栈、链表反转、二叉搜索树、Dijkstra）归入独立的“数据结构”分区，与滑动窗口、归并、快排、二分查找、BFS 一样由 `algorithm-cases/` 下的纯函数 trace 驱动：栈走 `algorithm_array` / `algorithm_bars` 的 `stack` 辅助轨道（渲染为主序列右侧的竖直槽位列），结果序列走横向的 `result` 轨道，树、链表与带权图走带显式坐标的 `graph_scene`（坐标投影、舞台边界与 `graphSceneSnapshot` / `rowLayout` / `inorderTreeLayout` / `pointerMarkers` 统一在 `features/playbook/engine/kits/algorithm/graphScene.ts`，渲染器读同一份常量）。

## 路由与交互

- `/templates`：默认显示专属线描缩略图。第一次点击正式案例时，只在当前行下展开真实 16:9 封面；第二次点击同一行或点击封面按钮，进入 `/templates/:templateId`。
- `/templates/:templateId`：解析静态案例注册表，并始终复用全局 `PlaybookPlayer`。未知或制作中的 ID 显示不可用状态和返回入口。
- `/create`：“二分查找”快捷项直接链接 `/templates/binary-search`；它不填充生成输入，也不提交 pipeline。其他 prompt 示例仍只填充输入框，等待用户明确提交。
- `/cases`：兼容重定向到 `/templates`。旧的 BFS、导数和抛体详情链接重定向到对应模板；其他旧详情链接回到模板目录。

同一时刻只允许展开一个模板。筛选或搜索让已选模板消失时必须清除选中状态。桌面键盘 Enter 和移动端点击使用相同的“先展开、再进入”语义。

## 静态运行边界

`apps/web/src/pages/Templates/templatePreviewCases.ts` 只保留契约类型与注册表；十个算法案例各自成文件放在 `algorithm-cases/`，用 `defineAlgorithmCase` 声明：案例只写一个 `buildSteps(params)`，一次遍历 trace 就把每一步和它的三个问题写在一起，`buildScript`、`buildFollowups`、`posterFrame` 全部由这份草稿派生。教师级 Gold 案例由 `apps/web/src/pages/Templates/gold-templates/` 中统一的 `GoldTemplateManifest` 注册，再派生为同一 `TemplatePreviewCase`。Manifest 同时记录 `archetypeId`、数学事实、视觉不变量和教学 rubric。每项包含默认参数、参数控件、确定性 `PlaybookScript` 构建器和按步骤组织的本地 Follow-up 操作；它不建立第二套 Director 或播放器契约。

以下行为全部在浏览器本地完成：

- 播放和切换步骤；
- 调整参数并重新构建脚本；
- 点击预设 Follow-up，并通过现有版本化 semantic-interaction 沙盒修改同一份 `PlaybookScript`；
- 切换主题和返回模板目录。

这条路径（包括 `/create` 的二分查找模板快捷项）不得调用 API，不得创建 run，不得读取或扣减额度，不得调用 LLM，也不得触发 pipeline。Gold 圆锥曲线案例的每一步固定提供五种语义操作：放慢当前段、换一种讲解、强调结论依据、调整一个有效参数、只补充当前一步。参数操作按 Manifest 控件范围夹紧或拒绝，再调用原 Gold builder 和共享圆锥曲线内核重建完整 Playbook；局部操作保留其他步骤，放慢操作顺延后续帧并保持连续时间线。Follow-up 不提供自由输入框，切换步骤时清除旧答案。

静态模板播放器不接 TTS 代理入口，避免继承浏览器里曾保存的远程 TTS 配置并意外请求服务端；Studio 和运营版 BYOK 的既有语音/模型配置不受影响。

旁白改为**预先录好、随前端发布的静态音频**：`apps/api/scripts/generate_template_narration.py` 用与导出视频同一套 `METAVIEW_TTS_*` 配置，把每一步旁白合成到 `apps/web/public/template-narration/<caseId>/<stepId>.mp3`（32 kbps 单声道，按步懒加载），并把录音清单生成为 TS 源码 `src/pages/Templates/narration/recordedNarration.ts`——随包发布而非线上拉取，模板页因此仍是零 fetch。播放器侧由 `useStaticNarration` 播放，并与既有「等旁白说完再翻页」的闸门共用同一契约。访客打开模板页即可听到讲解：无需登录、不发 API 请求、不扣减额度——静态运行边界不变（音频与海报一样是静态资源）。

旁白文案随参数实时重算，而录音是固定的，两者只在默认参数下完全一致。取舍是**声音优先**：任何一步都照常播放它的录音，学生拖动滑杆后那一两步会念着录制时的数字（重算后的数字仍显示在字幕和画面上）——旁白一碰滑杆就消失，用起来像坏了。同一步内重入既不重播也不打断，只有真正切换步骤才停旧句、播新句。

录音与默认文案是否一致由 `recordedNarration.test.ts` 在开发期守住：改了旁白却没重新运行生成脚本，测试会直接失败并指出是哪一步；它按案例 id 查任意已发布模板（不限 Gold），并检查每条录音在 `public/template-narration/` 下确有文件。当前已录音的是生态学五案例与数据结构五案例（栈 · 括号匹配、单调栈、链表反转、二叉搜索树、Dijkstra），其余案例自动保持无声。脚本可以只传部分案例 id 重录，清单里其他案例的条目会原样保留。

火山引擎 TTS 会**静默吞掉** `<`、`>` 这类比较符号（实测“目标 7 < 8”与删掉符号后的音频时长完全相同），旁白里的比较关系要写成“小于 / 大于”。

## 正式案例

| 模板 ID | 内容 | 参数 |
|---|---|---|
| `sliding-window` | 等宽数组格上的固定窗口右移、进入/离开元素、单调队列、结果轨道、代码同步、`O(n)` | 窗口大小 `k` |
| `merge-sort` | 分治拆分、区间合并、有序写回、`O(n log n)` | 无（v1 固定升序演示） |
| `quick-sort` | Lomuto 分区、pivot 归位、递归区间、`O(n log n)` 平均 | 无（v1 固定 Lomuto 末元素） |
| `binary-search` | low/mid/high 收缩、命中或未命中、代码同步、`O(log n)` | 目标值 |
| `bfs-tree` | 当前节点、队列、访问集合、活动边和代码行 | 起始节点 |
| `stack-brackets` | 逐字符扫描表达式、左括号入栈、右括号与栈顶配对出栈、主序列右侧的竖直栈列（栈顶在上、空槽可见）、匹配对轨道、交叉 / 未闭合 / 多余右括号三种失败、`O(n)` | 表达式预设 |
| `monotonic-stack` | 柱状数组、右侧竖直栈列保存值递减的下标、弹出即写答案的结果轨道、全递减 / 全递增两种极端、`O(n)` | 输入数组预设 |
| `linked-list-reverse` | 带箭头的节点排与两端 ∅、prev / curr / next 三指针、每步只翻一条 `next`、新头结点、`O(n)` / `O(1)` 空间 | 链表长度 |
| `bst-search` | 固定插入序列建树、中序横坐标体现左小右大、逐节点比较路径与被排除子树、落空处即插入位置、`O(h)` 与退化 | 目标值 |
| `dijkstra` | 六节点带权无向图、节点标签实时显示距离、每步确定最小距离节点并松弛邻边、已确定 / 候选 / 当前三态、最短路径树、非负权前提 | 起点 |
| `derivative-tangent` | 伽利略 1604 斜面八拍数据、奇数律、割线极限、导函数 `f'(t)=2t` 与中点速度验证 | 切点 `a`、间隔 `h` |
| `integral-area` | 阿基米德穷竭开场、上下矩形和夹逼、平方和闭式、`∫` 记号与微积分基本定理双路验证 | 矩形数 `n`、积分上限 `b` |
| `projectile` | 两颗子弹同落实验、分运动独立性、同一时钟合成轨迹、`sin2θ` 射程与 45°、伽利略 1638 抛物线证明、月球弹道边界 | 初速度 `v₀`、抛射角 `θ`、重力加速度 `g` |
| `spring-shm` | 胡克字谜、`a=−(k/m)x`、余弦解验证、与振幅无关的周期、能量交换、相图椭圆与简谐普适性 | 振幅 `A`、劲度系数 `k`、质量 `m` |
| `ellipse-string-construction` | 图钉、细绳、笔尖尾迹与椭圆定义（含 2a>2c 退化讨论） | 绳长 `2a`、图钉距离 `2c`、笔尖位置 |
| `ellipse-standard-equation` | 移项、两次平方、`b²=a²−c²` 与标准方程，每步数值验证 | `a`、`c`、验证点 |
| `ellipse-parameters-eccentricity` | 特征三角形、`e=c/a`，从接近圆到接近线段的对照 | `a`、`c` |
| `ellipse-focus-definition` | 两焦点、动点与焦点距离和 | `a`、`b`、动点参数 |
| `parabola-focus-directrix` | 焦点、准线、垂足与等距性质 | `p`、动点参数 |
| `hyperbola-asymptotes` | 两支、渐近线、焦点距离差 | `a`、`b`、动点参数 |
| `line-ellipse-position` | 相交、相切、相离、竖直直线与判别式 | 直线类型及参数 |
| `ellipse-chord-midpoint-locus` | 动弦、中点尾迹、理论轨迹与韦达关系 | 定点、斜率 |
| `pole-polar` | 圆外点、两条切线、接触弦与极线方程 | 外点坐标 `k` |
| `dna-replication` | 模板链、复制叉、互补配对与新链生成 | 固定教学过程 |
| `logistic-growth` | Carlson 1913 酵母数据、指数假设检验、S 形拟合、K/2 拐点、恒定努力捕捞与 rK/4 最大可持续产量、圣马修岛模型边界（高校生态学试点） | `r`、`K`、`N₀`、捕捞强度 `E` |
| `rabbit-chaos` | 一年一代离散 logistic 映射、过冲与周期 2/4、混沌、蝴蝶效应双轨迹、分岔图全景、洛伦兹吸引子（高校生态学试点） | 年增长率 `r`、初始兔群 `N₀` |
| `predator-prey` | 哈德逊湾毛皮数据（1900–1920）、Lotka-Volterra 耦合方程、相平面等倾线、中性环、数据回路验证、Volterra 捕捞原理、密度制约边界（高校生态学试点） | `r`、捕食效率 `a`、捕捞强度 `q`、初始雪兔 `N₀` |
| `competition-exclusion` | Gause 1934 双草履虫实验、L-V 竞争方程、零增长停线几何、排斥/共存/先到者赢三种结局、绿草履虫生态位分化（高校生态学试点） | 竞争系数 `α`、`β`、初始 `N₁₀`、`N₂₀` |
| `island-biogeography` | 喀拉喀托 1883 灭岛与留鸟普查、迁入-灭绝均衡 S*≈30、动态周转、面积/距离效应、种-面积规律 z≈0.3、保护区设计与模型边界（高校生态学试点） | 岛面积 `A`、距离 `D`、物种池 `P` |

每个默认案例至少有五个实际状态不同的步骤。算法案例的这些不变量（步数、step_id 唯一、快照互异、`total_frames`、代码行范围、每步三问、`visualQualityGate`、旁白可朗读）由 `algorithm-cases/testing/expectDeterministicCase` 统一断言，并按案例声明的参数矩阵逐组检查，而不只在默认参数下。九个 Gold 圆锥曲线案例每一步提供上述 5 个可执行且与当前步骤绑定的语义操作；其余 Gold 案例（微积分、物理、跨学科与生态学）以及普通正式案例每一步保留 3 个固定问题（观察、机制、检验）。案例数据必须继续符合 `PlaybookScript`；不要为公开模板引入第二套播放器或渲染协议。

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

## 逐步审查图

改动案例或渲染器后，用 `apps/web/scripts/render-template-shots.mjs` 把每一步渲染成 PNG 逐帧对照。它直接调用案例的 `buildScript`，所以**不必先导出**，也能渲染非默认参数下的画面：

```bash
cd apps/web
export REMOTION_BROWSER_EXECUTABLE=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell
npm run template-shots -- stack-brackets monotonic-stack --themes light,dark
npm run template-shots -- bst-search --params '{"target": 5}'
npm run template-shots -- bst-search dijkstra --params '{"bst-search": {"target": 0}, "dijkstra": {"source": "F"}}'
```

- 位置参数是案例 id（`TEMPLATE_PREVIEW_CASE_IDS` 里的任意一个，不限于数据结构案例）；
- `--themes`：`light` / `dark`，逗号分隔，默认 `light`；
- `--params`：键为案例 id 的映射，或直接给一份参数对象对所有案例生效，都会覆盖在 `defaultParams` 之上；
- `--out`：输出根目录，默认 `../../eval/shots`；
- `--frame-ratio`：在每步窗口里取样的位置，默认 `0.85`（入场动画已结束、下一步还没开始）。

输出到 `eval/shots/<案例 id>/<主题>/step-NN.png`，是已忽略目录，不要提交。

`REMOTION_BROWSER_EXECUTABLE` 在本仓库的开发环境里必须设置：容器下载不到 Remotion 自带的 headless shell，而 PATH 上的 chromium 已移除旧版 headless 模式，直接启动会失败。上面那个 Playwright 自带的 `headless_shell` 可用；不设置时脚本会先打印警告再尝试，通常会在启动浏览器时报错。

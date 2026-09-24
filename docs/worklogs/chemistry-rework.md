# 化学板块重做 · 工作日志

Status: In progress（未提交，等待 owner 审阅）

分支 `claude/chemistry-rework`，基于 `origin/main` `b51d28c8`（2026-09-23 fetch 后创建）。
规格见 [`../chemistry-coursepack.md`](../chemistry-coursepack.md)（写完后生效）。

## 续做须知

- 只在本 worktree 工作；不提交、不推送、不开 PR。
- Python：`/Users/jerry/Desktop/MetaView-v2/.venv/bin/{pytest,ruff}`。
- Remotion 截图需要设置 headless shell 路径的环境变量（变量名与用法见 `docs/template-previews.md` “逐步审查图”）；
  本机可用：`~/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell`。
- 截图输出：`eval/shots/chemistry-rework/`（已被 `.gitignore` 的 `eval/shots/` 忽略）。
- 文档漂移检查脚本不在 `origin/main` 上（只在本地未推送的 `main`）。
  本 worktree 用 `python3 /Users/jerry/Desktop/MetaView-v2/scripts/docs_keeper.py`（只读调用）跑；
  基线在 origin/main 上已有 14 条发现（docs/agents/*、docs/research/* 缺失等），与本工作无关。
- dev server 用 5195 端口，结束前必须停掉。

## 里程碑

| # | 里程碑 | 状态 |
|---|---|---|
| 0 | 读 AGENTS / CONTEXT / DESIGN / 模板文档 / Matt skills | done |
| 1 | 审计现有化学代码与截图 | done |
| 2 | 化学渲染内核（伪 3D 球棍、键断裂/生成、电子流/离子迁移、能量图、标签避让、原子守恒） | done |
| 3 | 规格文档 `docs/chemistry-coursepack.md` | done |
| 4 | 五个案例 + 线描 + 海报 + 目录分区 | done（海报在最后一轮修改后重渲） |
| 5 | 测试与门禁 | 见下方“最终验证” |
| 6 | 多视口多主题截图与视觉修正 | 见下方“最终验证” |
| 7 | 双轴 code review 与修复、docs_keeper | done（见“评审记录”） |

## 日志

### 2026-09-23

- 同步门：worktree 干净，`HEAD...origin/main` = `0 0`。
- 审计截图：`eval/shots/chemistry-rework/audit/{redox-electron,dna-replication}/{light,dark}/step-NN.png`。
- 发现 `apps/web/scripts/render-template-shots.mjs` 的已有缺陷：`--themes light,dark` 渲出的 dark 图与 light 图逐字节相同
  （`md5` 一致）。原因：`selectComposition` 只按 `themes[0]` 选一次，`renderStill` 用的是 composition 自带的 props。
  需要修（验证 dark 主题要用）。
- 线上参考：`/templates/integral-area`、`/templates/quick-sort`、`/templates/predator-prey` 用满 16:9 舞台、主题色面板；
  `/templates/dna-replication` 末步是方形 viewBox 居中、两侧大片空白、标签被形状遮挡——化学旧渲染器同一问题。
- 参考项目：Chemiation（Canvas 伪 3D，Y→X 欧拉旋转 + 仿射投影、按平均 z 画家排序、键端点按原子半径裁切、
  断键从中点裂开并淡出、成键从两端向中点生长、迁移键走抛物弧、三次 Hermite 缓动）；GitHub 对 Chemiation 与
  Anychem-pro 都检测不到 LICENSE 文件——只借鉴思路，不移植代码。

### 2026-09-24

- 网络中断后续做：确认 worktree 无源码改动、无 dev server 在 519x/8000/3000 监听。
- 会话此前被锁在另一 worktree，写入被 hook 拦截；用 `EnterWorktree(path=...)` 切入本 worktree 后继续。
- 契约：新增 snapshot kind `chemistry_scene`（web `kits/chemistry/sceneTypes.ts` + `types.ts` 联合、registry；API
  `ChemistrySceneSnapshot`（面板信封校验、主体 `extra=allow`）；agent `SUPPORTED_FRONTEND_SNAPSHOT_KINDS`）。
- 内核（纯函数，`features/playbook/engine/kits/chemistry/`）：`chemMarkup`（公式标记 → tspan）、`elements`（CPK 色板/半径）、
  `chemSpecies`（粒子物种库）、`projection`（Y→X 欧拉 + 轻透视）、`labelLayout`（避障标签）、`atomLedger`（按体系守恒）、
  `transitions`（断键/成键/粒子合并/热运动）、`geometry/*`（每类面板的形状/文字/锚点）、`sceneLayout`（全舞台布局 + 问题检查）。
- 渲染器：`renderers/chemistry/*`（ChemistrySceneRenderer + 7 类面板视图 + AtomSphere + ChemText + chemPalette）。
- `render-template-shots.mjs` 修复：按主题分别 `selectComposition`。
- 案例（`apps/web/src/pages/Templates/gold-templates/chemistry/`）：`chemistryCase.ts`（一次 build 同时产出步骤与三问）、
  `chemFormat.ts`；领域模型 `titrationDomain` / `haberDomain` / `collisionDomain` / `galvanicDomain` 各带测试。
  已完成：`galvanic-cell`（8 步）、`acid-base-titration`（8 步）、`haber-le-chatelier`（8 步）。
- 共享契约测试 `chemistryGoldTemplates.test.ts`：步数 6–10、快照互异、旁白可朗读、质量门、每步三问纯文本、
  布局无遮挡/无越界/无溢出、原子守恒——对每个案例的参数矩阵逐组跑。当前仅海报缺失三项失败（最后统一生成）。
- 视觉迭代记录：粒子障碍改为“按容器裁剪的粒子范围 + 四壁”，允许标签落在容器空白处；自由粒子自动收进容器内；
  图例按宽度换行；卡片字号自适应卡宽并新增 text-overflow 检查；旁观离子（SO₄²⁻、Na⁺、Cl⁻）降为 muted。
- 完成 `esterification-mechanism`（9 步，¹⁸O + 五步酸催化机理，价态/电荷/键长测试）与 `collision-activation`（8 步）。
- 目录：`templates.ts` 新增“化学”分区（课本顺序：原电池 → 酯化 → 碰撞理论 → 合成氨 → 滴定）；移除 `redox-electron`
  manifest、线描与海报（被 galvanic-cell 取代）；五个线描缩略图 + 测试；海报已用 Remotion 渲染（最终视觉修改后需重渲）。
- 旧渲染器升级：`Molecule2DSceneRenderer`、`ReactionSceneRenderer` 改为 178×100 宽画布、语义色 token、CPK 球体、公式转 Unicode；
  `CoreCalloutLabel` 新增可选 `fill`。
- 新测试：`ChemistrySceneRenderer.test.tsx`（断键/成键相位、token）、`transitions.test.ts`。
- Web 全量 vitest：通过（海报补齐后）；API `test_narration_speech.py` + `test_snapshot_contract_consistency.py` 通过。
- 规格：`docs/chemistry-coursepack.md` 已写并登记到 `docs/README.md` 的 Active 组；`docs/template-previews.md`、`README.md`（34 个正式案例）、
  `DESIGN.md` §11（化学场景规则）同步。`redox-electron/poster.webp` 已删除（git 可恢复）。
- 验证（进行中）：API 全量 pytest 1410 passed / 4 skipped；ruff 通过；agent lint+test、mcp typecheck+test 通过；
  web eslint 有 3 个本次引入的 error（ChemText 渲染期重赋值、chemMarkup 全角空格、haber 未用 import）待修；
  其余 3 个 warning 为既有（visual-regression.mjs、AlgorithmParamPanel）。
- Web 多视口截图：用放在 `apps/web/` 下的临时 Playwright 脚本（已删除，不入库）→ `eval/shots/chemistry-rework/web/<case>/<WxH>-<theme>/step-NN.png`，
  dev server 5195 运行中（结束前停止）。
- 双轴 code review（Standards / Spec）已派发子代理，等待结果。

## 评审记录

### Standards 轴（code-reviewer 子代理）：0 个 CRITICAL/HIGH，2 个 LOW（判断项）

1. Repeated Switches：`sceneLayout.panelGeometry` 与 `ChemistrySceneRenderer.PanelView` 各按面板类型分派一次。
   **拒绝**：两处分属两层——纯函数 kit（几何、测试直接调用，不依赖 React）与渲染层（React 组件）。合并成一张
   `{geometry, View}` 表会让 kit 引入 React 组件，破坏“纯内核 + 薄渲染器”的边界；两处 `switch` 都受 TS 判别联合的穷尽检查保护，
   新增面板类型漏改会编译失败。
2. API `ChemistryScenePanel` 用 `extra="allow"` 只校验面板信封。**拒绝（记录为待决问题 6）**：目前只有经过评审的正式案例产出此类快照，
   面板主体的权威契约是 `sceneTypes.ts` 并由 web 测试覆盖；在生成管线真正产出 `chemistry_scene` 之前，把七种面板主体在 Python 里再抄一遍
   是 Speculative Generality，且会制造两份需要同步的 schema。

### 自查补充（子代理未报）

- `npm --workspace apps/web run lint` 发现 3 个本次引入的 error，已修：`ChemText` 在渲染中重赋值 `offset`（改为先算 offsets 数组）；
  `chemMarkup.ts` 的 CJK 字符类含全角空格字面量（改为 `\u` 转义）；`haberGoldTemplate.ts` 未用的 `dec` import。
- 滴定第 3 步旁白“浓度减半，pH 只增加零点三左右”与画面 +0.48 不一致（还有稀释），卡片写成“减半”也不准：改为“约降为 1/3”。
- 滴定第 5 步旁白写死“二十五万倍”，只对 0.1 mol/L 成立：改为按当前浓度现算（`ratioSpoken`）。

### Spec 轴（对照任务说明与本规格；general-purpose 子代理，只读）

**(c) 实现有误——全部修复**

1. 指示剂一步在 0.01 mol/L + 甲基橙时自相矛盾（说“落在突变范围里、相差不到一滴”，实际约差 4 滴）。**已修**：
   `titrationGoldTemplate.ts` 按 `|相对误差| ≤ 0.1%` 分支——标题、旁白、说明、三问都改成“变色太早：不在突变范围内，约差 N 滴
   （N = |V终点 − V当量| ÷ 0.04 mL），应换指示剂”；“两条色带”的答案按两种指示剂与当前突变段是否相交现算。
2. 滴定多处写死 0.1 mol/L 的数：“pH 仍然只有 4 点多”“怎样验算 pH 4.30”“5 个数量级”“10⁻⁴ 降到 10⁻¹⁰”“二十五万倍”。
   **已修**：全部按当前浓度现算（`scientificMarkup`、`log10` 的数量级、`ratioSpoken` 两位有效数字，如“约 2500 倍”“约 25 万倍”）。
   1 mol/L 起点 pH 显示“-0.00”：**已修** `dec()` 去掉负零，并新增 `chemFormat.test.ts`。
3. 第 3 步“浓度减半，pH 只增加零点三左右”：**已修**（见“自查补充”）。
4. 合成氨“拆开一个氮氮三键要吸收 946 千焦”：**已修**为“拆开 1 摩尔氮氮三键……3 摩尔氢氢键……6 摩尔氮氢键”。
5. 变体沿用默认措辞：甲醇时标题“乙酸、乙醇和浓硫酸共热”与卡片“溶解乙醇”，铁负极时问题“而不是锌离子”。**已修**为按参数取名；
   另用脚本扫过铁/甲醇两种变体的全部文字，剩下的“锌”只出现在有意的对比句里（电极电势表、“比锌弱”）。
6. 弯箭头不全（每步只有一个）。**已修**：`nextArrow` 为每一对移动的电子各画一个箭头——加成步加 C=O π 电子 → O，
   质子转移步加 O–H 键电子 → ¹⁸O，脱水步加 O 孤对 → 重新形成 C=O；测试改为 `[1, 2, 2, 2, 1, 0]`，并新增“箭头两端的原子/键在该步确实存在”。
   第 5 步旁白同步为“两个弯箭头预告下一步……”。
7. `62.4 − 2×26.5 ≈ +9.5` 算术不严：**已修**为 `62.42 − 2×26.48 = 9.46 ≈ +9.5`（`collisionDomain.ts` 注释与规格表）。

**(a) 缺失或不完整**

1. 没有配平测试。**已补**：新增 `kits/chemistry/equationBalance.ts`（解析公式标记：下标、括号、同位素 `^{18}O`、电荷、`e^-`、
   状态 `(g)`、`Zn − 2e^- = …` 式的减项、`ΔH` 尾注；算术/文字/`C=O` 这类结构片段解析为 null）+ `equationBalance.test.ts`；
   契约测试对每个案例的参数矩阵断言“每一步的方程式胶囊必须可解析且原子、电荷都配平；卡片里能解析成方程式的行也必须配平”。
   变异检查：把 `Cu^{2+} + 2e^- = Cu` 临时改成 `+ e^-`，测试按预期失败（电荷差 +1），随后恢复原文件（`cmp` 一致）。
2. 原子守恒只覆盖带 `system_id` 的面板。**部分接受**：契约测试新增“每个案例至少有一个体系跨两步被账本跟踪”，防止账本空转。
   **拒绝其余部分**：碰撞理论的“取向对比”面板是两次独立碰撞的并排比较（8 个原子），不是反应对（4 个原子）的下一状态，
   把它并进 `hi-pair` 会制造假的不守恒；原电池直接置换特写与滴定自由滴定各只出现一步，跨步守恒对它们是空命题——
   它们画出的方程式现在由配平测试覆盖。
3. 没有离子迁移箭头。**已修**：`GalvanicPanelView` 为每条离子迁移路线画虚线轨迹 + 箭头（`IonTrack`，`--ink-3`），
   暂停帧和海报上也能看出方向；轨迹在路线首次出现时随换步淡入。
4. 若干颜色绕过 token。**已修**：盐桥填充改用 `palette.plate`（`--surface-2`）；粒子球上的元素符号改用 `palette.surface`；
   滴定管 NaOH 改用 `chemPalette.clearSolutionColor()`（与无色溶液同一个具名常量）。保留：电极高光/描边的 `#ffffff`/`#000000`
   只作为 `mixHex` 的明暗混色端点（与 `sphereColors` 相同），不是界面颜色。
5. 没有旁白音频。**拒绝在本次做**：需要 `METAVIEW_TTS_*` 与外部付费调用，任务未授权；已列为待决问题 4 与假设 11。
6. 测试矩阵注释夸大（“Every parameter combination”）。**已修**为“手选矩阵：每个选项值与每个滑杆两端至少出现一次（不是笛卡尔积）”。

**(b) 超出要求——保留，理由如下**

1. 旧渲染器（`Molecule2DSceneRenderer`、`ReactionSceneRenderer`）重写：任务交付物 2 要求“渲染器升级”，审计发现的卡片互相覆盖、
   写死颜色、深色主题浅卡片正是这两个渲染器的缺陷；改动受既有测试覆盖（`Molecule2DSceneRenderer.test.tsx`、
   `ReactionSceneRenderer.test.tsx`、`SubjectSceneRenderers.test.tsx`、`subjectVisualShowcase.test.tsx` 等全部通过）。
   **未验证**：没有真实 AI 生成运行来看新画法；已写进规格“架构改动”与待决问题。
2. `render-template-shots.mjs` 按主题选 composition：不修就无法完成交付物 6 的深色截图（dark 与 light 逐字节相同）。
3. 直接删除 `redox-electron`：按“取代”理解，旧直链无重定向——已是待决问题 1。

### 最后一轮视觉修正（看图发现，2026-09-24）

- 弯箭头：键 → 自身原子（C=O π 电子 → O、O–H → O、O 孤对 → C=O）的箭头比原子还短，直线弦会被球体盖住。
  `geometry/molecules.ts` 新增 `ownBondCurve`：从键旁绕出、落在原子侧面，自动选原子更少的一侧。
- 盐桥离子迁移：原路线只有约 37 单位长，暂停帧里离子和箭头叠在一起。改为从盐桥开口扇形进入溶液的两条长路线（一条从电极下方穿过）。
- callout 引线：从目标圆心出发会盖住目标（原电池第 1 步电子的“−”被引线压住）。`sceneLayout` 新增 `leaderStart`（目标边缘）。
- 碰撞理论第 5 步卡片 `e^{−E_a/RT}` 的下标嵌在上标里，排版器原样显示下划线：改为 `exp(−E_a/RT)`；并在
  `chemistryLayoutProblems` 新增 `raw-markup` 检查（先红：4 组参数失败；改文后绿）。
- 合成氨第 2、3 步的系列标签被挤到横轴下方或离线太远：`geometry/chart.ts` 新增 `stackEndLabels`（按线的上下顺序等距排开，
  间距 = 标签框高 + 1），系列标签限制在绘图区高度内；新增 `chart.test.ts`。
- 旁白比例改为两位有效数字（`ratioSpoken`：约 2500 倍 / 约 25 万倍 / 约 2500 万倍），新增 `chemFormat.test.ts`。
- 既有播放器问题（非本次引入，未改）：320–390 px 宽时舞台内小字很小、步骤圆点与设置/上一步按钮重叠。对照：
  `eval/shots/chemistry-rework/compare/predator-prey/320x700-light/step-04.png` 同样如此。已列为规格待决问题 9。

## 最终验证（2026-09-24，全部在本 worktree 本地执行）

| 命令 | 结果 |
|---|---|
| `cd apps/web && npx vitest run src/pages/Templates/gold-templates/chemistry src/features/playbook/engine/kits/chemistry src/features/playbook/engine/renderers/chemistry` | 15 个文件、229 个测试通过 |
| `cd apps/web && npx vitest run`（全量） | 182 个文件、1660 个测试通过 |
| `cd apps/web && npx tsc --noEmit` | 通过 |
| `npm --workspace apps/web run lint` | 0 error；3 个 warning 为既有（`apps/web/scripts/visual-regression.mjs`、`AlgorithmParamPanel.tsx`，本次未改） |
| `npm --workspace apps/web run build` | 通过（含 SEO 生成与校验） |
| `.venv/bin/ruff check apps/api/app apps/api/tests`（主仓库 `.venv`） | 通过 |
| `.venv/bin/pytest apps/api/tests -q` | 1410 passed，4 skipped |
| `npm --workspace apps/web run template-previews:export` 后 `pytest apps/api/tests/test_narration_speech.py tests/test_snapshot_contract_consistency.py` | 23 passed（导出 36 个案例） |
| `npm --workspace apps/agent run lint` / `test` / `build` | 通过 / 105 passed / 通过 |
| `npm --workspace apps/mcp-server run typecheck` / `test` | 通过 / 18 passed |
| `python3 /Users/jerry/Desktop/MetaView-v2/scripts/docs_keeper.py` | 13 条，全部为既有问题（`docs/README.md` 的 agents/ 与 research/ 死链、ADR 未登记、teacher-showcase 重复锚点、两处 env 提及）；没有涉及化学文档 |

`make check` 没有直接运行：Makefile 写死了 worktree 内的 `.venv/bin/...`，本 worktree 没有 `.venv`；上表按 `lint`、`test`、`build` 三个目标逐项用主仓库 `.venv` 跑完。

截图：`eval/shots/chemistry-rework/web/<案例>/<宽x高>-<主题>/step-NN.png`，7 个视口 × 2 个主题 × 5 个案例共 574 张，
每张都是“点步骤 → 播放约 2.2 秒 → 暂停”后截取；所有组合的页面横向溢出为 0（`report-{a,b,c,d}.json`）。
Remotion 静帧：`eval/shots/chemistry-rework/remotion/<案例>/{light,dark}/step-NN.png`。海报在最后一轮修改后重渲。
dev server（5195）已停止，临时截图脚本已删除。


## owner 决定落地（2026-09-24，协调人代 owner 决定）

### 决定 1：旧链接重定向（先测后写）

- 新增 `apps/web/src/pages/Templates/TemplatePreviewPage.test.tsx`（2 个测试）。先跑为红：`npx vitest run src/pages/Templates/TemplatePreviewPage.test.tsx`
  → 2 failed（页面显示“没有找到这个模板”，探针不存在；`RETIRED_TEMPLATE_REDIRECTS` 未导出）。
- `templates.ts` 导出 `RETIRED_TEMPLATE_REDIRECTS = Object.freeze({ "redox-electron": "galvanic-cell" })`；
  `TemplatePreviewPage` 在 `useParams` 之后、查目录之前命中即 `<Navigate replace to="/templates/galvanic-cell" />`
  （用 `Object.hasOwn` 判断，`constructor` 之类原型键不会被误当成退役 id）。转绿：2 passed；`tsc` 与 eslint 通过。

### 决定 3：甲基橙终点表述（先测后写）

- 新增 `gold-templates/chemistry/titrationGoldTemplate.test.ts`（2 个测试）。先红：甲基橙的“怎样判断终点已经到达？”答案不含“由红色变为橙色”。
- 实现：只对甲基橙在该答案末尾补一句——习题答案里常见的“由红色变为橙色”指颜色开始变化的时刻；按误差计算，要滴到刚变黄（pH 4.4）才在 0.1% 以内。
  0.01 mol/L 时按实情改为“即使滴到刚变黄（pH 4.4），误差仍超过 0.1%”（该浓度下误差 −0.79%，原句会说错）。
  顺带修正：甲基橙终点回退是“又变回橙色”，不是“褪色”（酚酞保留“半分钟内不褪色”）。
- 追问答案只以文字显示，没有任何朗读路径读它；新句不含公式标记，契约测试的纯文本检查通过。转绿：化学用例 8 个文件 201 个测试通过；`tsc`、eslint 通过。

### 决定 2 与 4：只改文档

- `docs/chemistry-coursepack.md` 新增“决定（2026-09-24）”四条（重定向、Ea 184/59 保持 Atkins 来源、甲基橙终点与习题表述、本次不配音），
  原“待 owner 决定”只留下其余五条并重新编号（本日志前文提到的“待决问题 1/4/6/9”指旧编号）。假设 1、9、11 改为指向对应决定。
- 核对决定 4 的前提：`apps/web/public/template-narration/` 下只有 5 个生态案例有音频；当前环境没有 `METAVIEW_TTS_*` 变量。
- 核对决定 3 的数字：0.1 mol/L 时 pH 3.1（刚变橙）对应 V(NaOH) ≈ 19.68 mL，误差约 −1.6%。习题答案链接由协调人提供，本地没有打开核对。
- `docs/template-previews.md` 补一句旧直链跳转。

### make check

- `.gitignore` 的 `.venv/` 只匹配目录；`ln -s /Users/jerry/Desktop/MetaView-v2/.venv .venv` 后 `git check-ignore` 不命中，`git status` 显示 `?? .venv`。
  没有改 `.gitignore` 或共享的 `.git/info/exclude`；符号链接只在跑 `make check` 期间存在，不暂存，跑完删除。
- `make check`（= lint + test + build）退出码 0：web eslint 0 error / 3 个既有 warning；agent lint、mcp typecheck、ruff 通过；
  API pytest 1410 passed / 4 skipped；web vitest 184 个文件 1664 passed；agent 105 passed；mcp 18 passed；web build（含 SEO 校验）与 agent build 通过。
- `git fetch origin`：`origin/main` 仍是 `b51d28c8`，与 HEAD 左右计数 0/0，无需合并。

### Standards 复审（新增改动：重定向 + 甲基橙追问；code-reviewer 子代理，只读）

- 0 个 CRITICAL/HIGH。确认 hooks 规则（`useParams` 之后才提前 return，之后没有 hook）、FSD 边界、测试沿用 `TemplatesPage.test.tsx` 的 MemoryRouter + LocationProbe 写法、甲基橙化学表述均无问题。
- MEDIUM：`retiredTarget` 三元表达式一行过长。**已修**，拆成三行；两个测试与 eslint 通过。
- LOW：重定向目标是否存在只由测试保证、没有类型约束。**接受现状、不改**：目录是运行时数组，测试已在目标失效时失败，再加类型体操属于过度设计。
- 文档同步（docs-reviewer 子代理，只读）：新增改动“无需更新”；规格、`template-previews.md` 与日志的描述逐条对得上代码。
- `make check` 之后只改了 `TemplatePreviewPage.tsx` 的一行换行：随后 `apps/web` 的 `npx tsc --noEmit` 与 `src/pages/Templates` 全部测试复跑通过（见下）。

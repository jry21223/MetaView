# 极点极线模板：内容与接入设计

Status: Implemented

## 结论

首版可直接使用现有 `math_scene`，不需要新增 renderer。圆可用参数曲线，外点、切点可用 points，两条切线与接触弦可用 segments，推导式放在 `formula_latex`，图内名称用 annotations 补齐。

现有能力的三个限制不阻塞首版：

- `MathSceneSegment.label` 目前不直接显示，首版为直线另加 annotation。
- segment 是有限线段，首版把极线端点延伸到视窗边缘，视觉上表示直线。
- 数学对象的显式 `id` 尚未进入前后端 schema；Director 的 `focus_target` 对数学场景也仍是渐进支持。首版用 `emphasis` 和逐步增量控制注意力，不把正确呈现依赖在 focus target 上。

## 题目与参数

使用圆上接触弦这一高中解析几何常见结构：

> 已知圆 `C: x^2+y^2=R^2`，圆外一点 `P=(k,k)`。过 P 作圆的两条切线，切点为 A、B。求接触弦 AB 的方程，并观察 P 移动时极线如何变化。

模板参数：

| 参数 | 默认值 | 范围 | 约束 |
| --- | ---: | ---: | --- |
| `k` | 5 | 4–8，步长 0.25 | `2k^2 > R^2`，保证 P 在圆外 |
| `R` | 5 | 首版固定 | 避免两个自由参数抢占教学注意力 |

确定性计算：

```text
s = R^2 / k
d = sqrt(2R^2 - s^2)
A = ((s+d)/2, (s-d)/2)
B = ((s-d)/2, (s+d)/2)
polar(P): kx + ky = R^2  <=>  x+y=s
```

默认 `R=k=5` 时，`P=(5,5)`、`A=(5,0)`、`B=(0,5)`、极线为 `x+y=5`，数字整洁，适合作为代表帧。

GeoGebra 官方 `Polar(<Point>, <Conic>)` 同样把“点关于圆锥曲线的极线”作为正式几何对象，并支持由极线反求极点：[Polar Command](https://geogebra.github.io/docs/manual/en/commands/Polar/)。该来源用于核对术语；下面的圆方程推导由切线方程直接验证。

## 六步 PlaybookScript

每步 90 帧、30 fps，总计 540 帧。所有步骤保持相同视窗，例如 `x,y in [-7,10]`，避免相机变化被误认成图形变化。

| 步骤 | 标题与教学动作 | `math_scene` 快照增量 | 公式 | 视觉焦点 |
| --- | --- | --- | --- | --- |
| 1 | 圆与圆外点 | 参数圆 `x=R*cos(t), y=R*sin(t)`；O、P 两点 | `C:x^2+y^2=R^2` | P 使用 accent，圆为 primary |
| 2 | 作两条切线 | 增加 A、B；增加 PA、PB 两条 segment | `PA\perp OA,\ PB\perp OB` | PA/PB primary；圆退为 secondary |
| 3 | 连结接触弦 | 增加 AB segment 与 `接触弦 AB` annotation | `A,B\in C` | AB accent；切线转 secondary |
| 4 | 写切点处切线 | 保留图形，强调 A；annotation 指向 A | `A(a,b):\ ax+by=R^2` | A accent，B muted/secondary |
| 5 | 让外点代入 | 强调 P 与两条切线，说明 P 同时落在 A、B 的切线上 | `ak+bk=R^2\Rightarrow a+b=R^2/k` | P 与公式；几何线保持中性 |
| 6 | 得到极线并联动参数 | 把 AB 延长为跨视窗极线；A、B 回到 primary；显示结果 | `\boxed{kx+ky=R^2}\iff\boxed{x+y=R^2/k}` | 极线 accent；最终 pull-out |

首版每一步都构建完整 snapshot；现有 math-scene diff planner 会根据内容键识别持久对象，只动画新增对象。样式字段不参与对象身份，因此仅修改 emphasis 不会让圆或点重画。

## DirectorScript 计划

Director 不承担数学事实，只安排观看节奏：

| Step | intent | shot | motion | pacing | 逻辑 focus target |
| --- | --- | --- | --- | --- | --- |
| 1 | hook | wide | push_in | normal | `point:P` |
| 2 | reveal | medium | hold | slow | `segments:PA,PB` |
| 3 | focus | close | focus_target | slow | `segment:AB` |
| 4 | explain | detail | hold | slow | `point:A + formula` |
| 5 | explain | detail | hold | slow | `point:P + formula` |
| 6 | summary | wide | pull_out | slow | `polar-line` |

上述 focus target 是设计语义，不应在首版硬编码为不稳定的 CSS selector。当前 renderer 对 `focus_target` 的消费仍不完整，所以首版实际可先用 `hold/push_in/pull_out` 与 snapshot emphasis，待对象 ID 契约完成后再绑定。

## 模板注册接入

实现时的最小改动顺序：

1. 在 `templatePreviewCases.ts` 增加 `pole-polar` case id、`k` range 控件、确定性几何计算、六步脚本与每步 3 个固定 Follow-up。
2. 在模板目录元数据中把对应数学卡片从“制作中”切为可交互，并加入线描缩略图。
3. 增加注册表/脚本结构测试：六个不同状态、全部 `math_scene`、参数边界有限、切点在圆上、PA/PB 为切线、A/B 落在极线上。
4. 用现有 template preview exporter 导出脚本和代表帧；审核 1440×900、移动端与浅色/深色主题后更新 poster。
5. 不新增 API 调用，不创建第二播放器，不改变 PlaybookScript 唯一渲染出口。

## 数学与渲染验证标准

对 `k=4,5,8` 至少验证：

- `A_x^2+A_y^2=R^2` 且 `B_x^2+B_y^2=R^2`，误差 `<1e-8`。
- `(P-A) dot A = 0`、`(P-B) dot B = 0`，证明半径垂直切线。
- `k*A_x+k*A_y=R^2` 且 B 同样成立，证明 AB 方程正确。
- A、B 为不同有限点；根号内 `2R^2-s^2 > 0`。
- 六个 snapshots 结构不同，增量对象不会全场重画。
- 代表帧中 P、A、B、PA、PB、AB 和 `x+y=R^2/k` 不重叠、不出视窗。
- 灰度截图中仍能凭点名、线的位置与公式分清切线和极线，不依赖颜色单独编码。

## 可选的最小契约增强（非首版阻塞项）

不需要新 renderer；若后续扩展到一般圆锥曲线，优先小幅加深 `math_scene`：

```ts
interface MathSceneObjectBase {
  id?: string;
  semantic_role?: string;
}

interface MathSceneLine extends MathSceneObjectBase {
  a: number;
  b: number;
  c: number; // ax + by + c = 0
  label?: string;
  emphasis?: string;
  line_style?: "solid" | "dashed";
}
```

`MathSceneSnapshot.lines?: MathSceneLine[]` 可让无限直线由 renderer 按 viewBox 裁切，并给 Director 提供稳定 `id`。这比新建 `pole_polar_scene` renderer 更小、更通用，也符合现有深模块边界。

# 物理运动场景的视觉编码研究

> 状态：Research / implementation guidance
>
> 日期：2026-07-18
>
> 范围：`PhysicsForceSceneRenderer` 中的运动轨迹、速度、加速度与受力表达；不讨论页面布局。

## 结论

更优方案不是为轨迹、速度、加速度、受力各分配一种醒目品牌色并同时展示，而是采用混合编码：

1. **颜色用于建立稳定关联或强调当前教学焦点，不承担全部区分任务。** 同一物理量在确实需要跨公式、图形和步骤对应时应保持颜色一致；若当前步骤只讲一个量，只让该量使用强调色，其他量隐藏或降为中性。
2. **轨迹是空间参照，不是矢量。** 默认用高对比墨色细实线，不使用箭头头部，也不使用品牌色。只有“未来预测”“理论外推”等不同语义才切换虚线。
3. **矢量必须通过箭头、直接标签和层级区分。** `v`、`a`、`F` 等标签与箭头直接绑定；总量与分量通过线宽、线型或显隐区分，颜色只是冗余编码。
4. **一次只突出一个主要教学对象。** 对当前抛体模板，默认应是“轨迹 + 当前步骤的一个物理量”，而不是轨迹、速度、加速度、受力全部争夺注意力。

这也与项目现有 `DESIGN.md` 一致：Renderer 可以维护数据关系所需的局部语义色，但“品牌一致”不等于所有数据可视化都改成 Sage。

## 证据

### 1. 颜色可以帮助关联，但错误或过量的颜色会制造错误物理含义

PhET 的原始访谈研究指出，新手容易把可见线索都视为同等重要；设计应强调教学上重要的信息并移除干扰。研究还记录了学生把跨模拟复用但语义不同的绿色箭头误认为先前学过的“合力”，即使旁边有文字标签。这说明颜色的感知强度可能高于文字标签：一旦颜色承担物理语义，就必须稳定；否则应使用中性表达。[PhET interview study, Part II](https://phet.colorado.edu/publications/archive/PhET%20interview%20Paper%20Part%20II.pdf)

一项面向大学基础力学课程的原始研究使用颜色来连接公式、文字定义和图形中的相关信息；学生总体评价积极，约 40% 的学生认为颜色有助于匹配相关信息或区分不同信息。该研究测量的是**学生感知**，不是学习成绩的因果改善，因此它支持“有目的地建立关联”，不支持“颜色越多越好”。[Thomas, Carr & Guo, *The effect of color-coding on students' perception of learning in introductory mechanics*](https://arxiv.org/abs/2411.14605)

**项目判断：** 采用“稳定语义 + 当前焦点”的混合方案。颜色不应该随步骤重新分配，但也不需要在每一步展示全部物理量。

### 2. 成熟教学模拟把轨迹、总量、分量和受力分别建模

PhET 的 `Projectile Motion` 实现提供了可参考的结构证据：

- 轨迹拥有独立的 `PATH_WIDTH`，与矢量不是同一个视觉对象。[ProjectileMotionConstants.ts](https://github.com/phetsims/projectile-motion/blob/72794fc16be76870f7431b31388cbb634107753c/js/common/ProjectileMotionConstants.ts#L72-L79)
- 总速度/加速度箭头的杆宽和头宽大于分量箭头；也就是说，层级不仅依赖颜色。[ProjectileNode.ts](https://github.com/phetsims/projectile-motion/blob/72794fc16be76870f7431b31388cbb634107753c/js/common/view/ProjectileNode.ts#L30-L47)
- 速度、加速度、受力以及 total/components 均可独立显隐，默认不必全部堆叠。[VectorsViewProperties.ts](https://github.com/phetsims/projectile-motion/blob/72794fc16be76870f7431b31388cbb634107753c/js/vectors/view/VectorsViewProperties.ts#L24-L66)
- 受力使用独立的自由体图组件，力箭头为黑色并直接带 `F` 标签，而不是强制使用品牌色。[FreeBodyDiagram.ts](https://github.com/phetsims/projectile-motion/blob/72794fc16be76870f7431b31388cbb634107753c/js/common/view/FreeBodyDiagram.ts#L25-L44)

这些源码中的具体色值并不适合直接照抄；可复用的是信息架构：轨迹、运动学矢量、受力、总量和分量拥有不同角色与显隐控制。

### 3. 矢量本身就容易被误读，不能再依赖拥挤的颜色堆叠

一项 2024 年的物理教育原始研究发现，学生生成矢量表示通常不难，但解释矢量表示存在显著困难；箭头重叠、密度和位置会带来错误推断。研究建议并列、对照不同表示并明确教授它们之间的转换。[Hoyer & Girwidz, *Vector representations and unit vector representations of fields*](https://journals.aps.org/prper/abstract/10.1103/PhysRevPhysEducRes.20.010150)

**项目判断：** 不应让速度、加速度和多个力箭头在物体周围同时占据同等权重。当前步骤只显示所讲对象；涉及受力分析时，优先使用独立自由体图或 inset，而不是继续叠加到运动轨迹上。

### 4. 色盲与低对比环境要求颜色之外的冗余编码

WCAG 2.2 明确要求颜色不能是传达信息或区分视觉元素的唯一方式，并建议结合文字、形状或图案。[WCAG 2.2 — Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color)

对理解内容所必需的图形对象，WCAG 要求其相对相邻背景至少达到 `3:1`。W3C 对图表的示例还明确把数据线视为需要检测的图形对象；过细线条的抗锯齿会降低实际可见度，因此仅在计算值上勉强达到阈值仍存在风险。[WCAG 2.2 — Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast)

Apple 的官方无障碍评估建议直接检查灰度状态，并用位置、顺序、形状、图标或直接标签补充颜色；复杂图形应尽量直接标注。[Apple — Differentiate Without Color Alone](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/differentiate-without-color-alone-evaluation-criteria)

GeoGebra 官方把颜色、线型、线宽和标签作为独立的样式通道，且支持 `Name`、`Name & Value`、`Value` 和自定义 Caption。这证明教学图形可以让颜色退出主编码，改由线型与直标承担明确区分。[GeoGebra Style Bar](https://geogebra.github.io/docs/manual/en/Style_Bar/)

### 5. 投影环境应比普通桌面更保守

一项 2024 年、包含 96 名参与者的原始实验显示，投影图像可读性同时受投影照度和环境照度影响；环境越亮，需要越强的投影照度。[Yeh et al., *Visual perception of projection image quality*](https://doi.org/10.1016/j.heliyon.2024.e27485)

由该实验与 WCAG 可推导出项目策略：关键轨迹和箭头不应依赖浅灰、低饱和或透明叠色；投影用截图应保留高对比中性结构。这是设计推论，不是论文直接给出的配色规范。

## 面向 `PhysicsForceSceneRenderer` 的实施方案

### P0：重建信息层级

建议默认显示规则：

| 角色 | 默认表达 | 说明 |
|---|---|---|
| 网格 | 极浅中性细线 | 仅提供定位，不与轨迹竞争 |
| 坐标轴/地面 | 中性灰线 | 强于网格、弱于轨迹 |
| 运动轨迹 | 墨色细实线 | 无箭头、无品牌色；预测段才用虚线 |
| 物体 | 浅色填充 + 墨色轮廓 | Sage 仅用于“当前选中物体”，不作为永久材质色 |
| 当前教学矢量 | 单一强调色 + 直接标签 | 每一步只突出一个主要物理量 |
| 非当前矢量 | 隐藏，必要时墨灰 | 不默认显示三种彩色箭头 |
| 受力 | 独立自由体图/inset | 避免与速度、加速度在同一锚点混淆 |

当前实现的轨迹 `strokeWidth="0.42"` 和较小箭头方向是正确的，但 `vectorColor()` 仍然把 force、acceleration、velocity 固定映射为三种主题色，并且 `snap.vectors.map(...)` 会同时渲染快照中的全部矢量。下一步的关键不是继续调色值，而是增加**步骤级焦点/显隐规则**。

### P1：建立矢量层级，而非统一粗细

以下是针对当前 `viewBox="0 0 100 100"` 的项目起始值，属于待实测的设计建议，不是外部标准：

- 轨迹：`0.45–0.55`；墨色，`70–85%` 不透明度。
- 非当前/分量矢量：`0.55–0.65`；中性墨灰；必要时使用短虚线。
- 当前/总量矢量：`0.75–0.9`；单一强调色；保持实线。
- 箭头头部：宽度约为杆宽的 `2.5–3×`，长度不超过短矢量的约 `12%`。
- 标签：在箭头附近直接写 `v`、`a`、`F_g`、`F_d`；数值使用次级墨色，必要时增加暖白 halo，避免文字被网格穿过。

当前 marker 的 `2.5 × 2.5` 已比旧版克制；更重要的是根据矢量角色区分粗细，并避免短箭头被箭头头部吞没。

### P2：颜色策略

建议把“物理语义色”和“教学状态色”分开：

- `trajectory`: `#2F3431`（中性墨色）
- `vector-muted`: `#66706A`（非当前矢量）
- `vector-current`: 默认使用当前 canvas accent，但必须通过对比检测
- 多量同屏且需要跨表示对应时，可启用固定语义色：
  - velocity: `#356B5C`
  - acceleration: `#8A5A00`
  - force: `#9B3A2D`

按 WCAG 相对亮度公式计算，这些建议色相对浅色画布 `#FAF8F3` 的对比分别约为 `11.95:1`、`4.84:1`、`5.80:1`、`5.58:1`、`6.52:1`。项目当前 Sage `#82976F` 对该背景约为 `3.00:1`，适合较粗的当前对象轮廓，但不应继续作为极细关键箭头的唯一编码。

多量同屏时仍必须保留 `v/a/F` 直接标签；不允许只凭色相区分。

## 验收清单

1. **五秒测试：** 第一眼先看到物体与轨迹，第二眼看到当前教学矢量；其他结构不竞争。
2. **灰度测试：** 转为灰度后仍能区分轨迹、当前矢量、非当前矢量以及总量/分量。
3. **对比测试：** 每条理解所必需的线和箭头相对背景至少 `3:1`；投影截图内部目标建议高于最低线。
4. **washed-out 测试：** 降低饱和度与整体对比后，轨迹和当前箭头仍可辨。
5. **缩放测试：** 在 `1366×768`、`1440×900`、`1920×1080` 以及截图缩放到 `75%` 时检查抗锯齿与标签碰撞。
6. **教学步骤测试：** 每一步列出“必须看到 / 可以看到 / 必须隐藏”的物理对象，禁止由 Renderer 无条件显示快照中的所有矢量。

## 推荐决策

采用：

> **墨色轨迹 + 当前教学量单一强调色 + 其他量隐藏或墨灰 + `v/a/F` 直接标签 + 总量/分量用线型和粗细区分。**

这比“三种品牌色同时上场”更能建立主次，也更适合浅色主题、色觉差异和教室投影环境。

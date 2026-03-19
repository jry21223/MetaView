## 🤖 Assistant

```markdown
# Manim 算法演示动画生成提示词（带中文字幕解释版）

你是一个 Manim 动画专家。请根据用户描述的算法，生成一段**可以直接运行、无需任何修改**的 Manim Community Edition (ManimCE) Python 代码。

---

## 一、硬性约束（必须遵守，违反则视为失败）

### 1. 运行环境
- 使用 `manim` (ManimCE)，不是 `manimlib` (3b1b版)。
- 入口类继承 `Scene`，文件顶部只需 `from manim import *`。
- 运行命令：`manim -pql file.py ClassName`
- 不要使用任何需要额外安装的第三方库。

### 2. 字体与文本
- **优先使用 `Text()` 渲染标题、步骤说明、源码字符串和普通中文/英文文字**。
- `MathTex()` 或 `Tex()` 只用于公式、数学符号或极短标签。
- 所有文字的 `font_size` 不得超过 `32`，标题不超过 `40`。
- 数组元素内的数字 `font_size` 建议 `28`。

### 2.5 中文字幕解释（必须遵守）
- 动画中的**步骤说明、底部字幕、过程解释、结果提示**必须使用**中文**。
- 若需要显示变量名（如 `i`、`j`、`pivot`、`low`、`high`），可以保留英文变量名，但整句说明必须以中文为主。
- 对于中文标题、步骤说明、结果提示，**优先使用 `Text()`**，减少对 LaTeX/ctex 的依赖。
- 只有当内容本身是数学公式或短数学标记时，才使用 `Tex()` / `MathTex()`。
- 代码中的注释可以用中文。
- 所有步骤说明应简短清晰，单行展示，避免过长导致超出画面。
- 常见中文字幕示例：
  - `"当前比较 34 和 25"`
  - `"选择最后一个元素作为枢轴"`
  - `"交换索引 1 和 3"`
  - `"目标值已找到"`
  - `"左半部分继续递归"`
  - `"排序完成"`

### 3. 画面布局与防遮挡
- 画面安全区域：x ∈ [-6.5, 6.5]，y ∈ [-3.5, 3.5]。所有元素必须在此范围内。
- 标题放在画面顶部 `UP * 3.2` 位置。
- 主要数据结构（数组、树等）居中偏上，y ∈ [0, 2.5]。
- 说明文字/步骤提示放在画面底部 `DOWN * 3.0` 位置。
- 指针/箭头/高亮框不得与文字标签重叠，箭头放在数组下方，标签放在箭头下方。
- 每次添加新元素前，检查是否与已有元素位置冲突，如有冲突则偏移。

### 4. 动画节奏
- 每个关键步骤之间使用 `self.wait(0.5)` 到 `self.wait(1.0)`。
- 整体动画时长控制在 15-45 秒。
- 使用 `run_time=0.5` 或 `run_time=0.8` 让动画紧凑。
- 避免同时播放超过 3 个动画对象。

### 5. 颜色规范
- 背景保持默认黑色。
- 普通元素：`WHITE`
- 当前正在比较/访问的元素：`YELLOW`
- 已确认/已排序的元素：`GREEN`
- 关键元素（pivot、target等）：`RED`
- 辅助指针/标记：`BLUE`
- 如用户指定 ，请按照用户指定的来
### 6. 代码健壮性
- 不要使用 `lambda` 做 updater（容易出现闭包陷阱）。
- 不要使用 `always_redraw` 除非绝对必要。
- 所有 `VGroup` 在创建后立即定位，不要依赖后续 `arrange` 改变已播放动画的对象。
- 交换动画使用 `Swap` 或手动 `animate.move_to()` 配合保存位置，不要用 `.shift()`。
- 数组可视化统一使用 `Square` + `MathTex` 组合，正方形边长 `0.7`，间距 `0.0`（紧贴）。

---

## 二、数组可视化标准模板

当算法涉及数组时，必须使用以下结构：

```python
def create_array(self, arr, start_pos=LEFT * 3):
    """创建数组可视化，返回 (squares_list, labels_list, group)"""
    squares = []
    labels = []
    for i, val in enumerate(arr):
        sq = Square(side_length=0.7, color=WHITE, stroke_width=2)
        lb = MathTex(str(val), font_size=28, color=WHITE)
        sq.move_to(start_pos + RIGHT * i * 0.7)
        lb.move_to(sq.get_center())
        squares.append(sq)
        labels.append(lb)
    group = VGroup(*squares, *labels)
    return squares, labels, group
```

### 交换两个元素的标准方式：

```python
def swap_elements(self, squares, labels, i, j):
    """交换数组中第 i 和第 j 个元素的动画"""
    pos_i = squares[i].get_center()
    pos_j = squares[j].get_center()
    self.play(
        squares[i].animate.move_to(pos_j),
        labels[i].animate.move_to(pos_j),
        squares[j].animate.move_to(pos_i),
        labels[j].animate.move_to(pos_i),
        run_time=0.5
    )
    squares[i], squares[j] = squares[j], squares[i]
    labels[i], labels[j] = labels[j], labels[i]
```

---

## 三、指针/箭头标准模板

```python
def create_pointer(self, target_mob, label_text, color=BLUE):
    """在目标对象下方创建箭头指针"""
    arrow = Arrow(
        start=target_mob.get_bottom() + DOWN * 0.8,
        end=target_mob.get_bottom() + DOWN * 0.1,
        color=color, buff=0, stroke_width=3, max_tip_length_to_length_ratio=0.3
    )
    label = MathTex(label_text, font_size=24, color=color)
    label.next_to(arrow, DOWN, buff=0.1)
    return VGroup(arrow, label)

def move_pointer(self, pointer, new_target):
    """移动指针到新目标下方"""
    new_arrow_start = new_target.get_bottom() + DOWN * 0.8
    new_arrow_end = new_target.get_bottom() + DOWN * 0.1
    arrow = pointer[0]
    label = pointer[1]
    self.play(
        arrow.animate.put_start_and_end_on(new_arrow_start, new_arrow_end),
        label.animate.next_to(
            Arrow(start=new_arrow_start, end=new_arrow_end), DOWN, buff=0.1
        ).move_to(new_arrow_start + DOWN * 0.3),
        run_time=0.3
    )
```

---

## 四、底部说明文字标准模板（中文字幕）

```python
def show_step(self, text, prev_step=None):
    """在底部显示中文步骤说明，自动替换上一条"""
    step = Text(text, font_size=28, color=GRAY)
    step.move_to(DOWN * 3.0)
    if prev_step:
        self.play(FadeOut(prev_step), FadeIn(step), run_time=0.4)
    else:
        self.play(FadeIn(step), run_time=0.4)
    return step
```

---

## 五、标题与中文文字使用规范

如果标题或说明文字包含中文，推荐使用如下方式：

```python
title = Text("快速排序", font_size=40, color=WHITE)
title.move_to(UP * 3.2)
```

如果是英文变量标签，例如 `i`、`j`、`L`、`R`、`pivot`，可以继续使用：

```python
label = MathTex("i", font_size=24, color=BLUE)
```

如果需要展示中文结果提示，例如“排序完成”，推荐使用：

```python
result_text = Text("排序完成", font_size=28, color=GREEN)
result_text.move_to(DOWN * 3.0)
```

---

## 六、输出要求

1. 输出完整的、可直接运行的单个 `.py` 文件。
2. 代码开头加注释说明算法名称和运行命令。
3. 不要输出任何解释性文字，只输出代码。
4. 数组数据使用 `[5, 3, 8, 1, 9, 2, 7]` 作为默认示例（除非用户指定）。
5. 动画中的**步骤字幕必须是中文**。
6. 若标题使用中文，优先使用 `Text()`，不要默认依赖 `TexTemplateLibrary.ctex`。
7. 动画结尾 `self.wait(2)` 停留展示最终结果。

---

## 七、自检清单（生成代码后逐条核对）

- [ ] 是否所有文本都用 `Tex` / `MathTex`，没有 `Text()`？
- [ ] 是否只在公式或短数学标签中使用了 `Tex()` / `MathTex()`？
- [ ] 是否所有元素都在安全区域 x∈[-6.5,6.5], y∈[-3.5,3.5] 内？
- [ ] 标题、数组、说明文字是否分层不重叠？
- [ ] 指针箭头是否在数组下方，标签在箭头下方？
- [ ] 交换动画是否同时移动了 square 和 label？
- [ ] 交换后是否同步更新了 Python 列表中的引用？
- [ ] 是否有 `self.wait()` 控制节奏？
- [ ] 底部说明文字是否为中文简洁解释？
- [ ] 是否能直接 `manim -pql file.py ClassName` 运行？

---

现在，请根据以上规范，为以下算法生成 Manim 动画代码：

**算法名称**：[在此填写，例如：冒泡排序 / 快速排序 / 二分查找 / BFS / 归并排序]

**特殊要求**（可选）：[例如：数组长度8、展示每轮比较次数、突出pivot选择过程、使用中文字幕解释每一步]
```

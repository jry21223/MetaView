# HTML 中的 CSS 实现讲解

MetaView 前端主要使用 React 组件生成 HTML 结构，再通过普通 CSS 文件和 CSS 变量控制视觉样式。理解方式可以拆成三层：HTML 决定“有什么元素”，选择器决定“样式作用到谁”，属性决定“元素如何显示”。

## CSS 的三种写法

1. 行内样式：直接写在元素的 `style` 属性里，适合少量运行时计算值。项目中 React 组件会用 `style={{ ... }}` 传入尺寸或 CSS 变量。
2. `<style>` 标签：直接放在 HTML 文档中，适合小型页面 demo。MetaView 正式页面较少使用这种方式。
3. 外部样式表：把样式写在 `.css` 文件中，再由应用入口导入。这是项目主路径，例如页面布局、播放器、账户弹窗都使用外部 CSS。

## 选择器如何定位元素

选择器会把样式绑定到匹配的 HTML 元素：

```html
<section class="demo-card" id="css-demo">
  <h2>CSS 示例</h2>
  <p class="demo-card__text">这段文字会被类选择器命中。</p>
</section>
```

```css
section {
  display: block;
}

.demo-card {
  padding: 16px;
  border: 1px solid #d8dee8;
}

#css-demo {
  background: #f7f9fc;
}

.demo-card .demo-card__text {
  color: #263241;
}
```

- `section` 是标签选择器，命中所有 `<section>`。
- `.demo-card` 是类选择器，命中 `class="demo-card"` 的元素。
- `#css-demo` 是 ID 选择器，命中唯一的 `id="css-demo"`。
- `.demo-card .demo-card__text` 是后代选择器，只命中 `.demo-card` 内部的文字元素。

## 常见属性和页面效果

下面是一个完整示例，左侧 HTML 决定卡片内容，右侧 CSS 决定视觉结果：

```html
<article class="explain-panel">
  <h3>二分查找</h3>
  <p>每一步都缩小搜索区间。</p>
  <button>开始演示</button>
</article>
```

```css
.explain-panel {
  width: 320px;
  padding: 16px;
  border: 1px solid #cfd7e3;
  border-radius: 8px;
  background: #ffffff;
  color: #1f2937;
  font-family: system-ui, sans-serif;
}

.explain-panel h3 {
  margin: 0 0 8px;
  font-size: 18px;
}

.explain-panel p {
  margin: 0 0 12px;
  line-height: 1.6;
}

.explain-panel button {
  padding: 8px 12px;
  border: 0;
  border-radius: 6px;
  background: #2563eb;
  color: white;
}
```

- `width` 控制卡片宽度。
- `padding` 控制内容和边框之间的内边距。
- `border` 和 `border-radius` 形成边框和圆角。
- `background`、`color`、`font-family` 控制背景、文字颜色和字体。
- `margin` 控制标题、段落和后续内容之间的外部间距。
- `line-height` 增加段落行距，让中文说明更易读。

## 盒模型

浏览器计算一个元素尺寸时，会从内到外叠加四层：

- `content`：元素真实内容，例如文字或图片。
- `padding`：内容和边框之间的空间。
- `border`：元素边框。
- `margin`：元素和外部元素之间的空间。

如果一个元素设置 `width: 320px; padding: 16px; border: 1px solid`，默认情况下实际占用宽度会是 `320 + 16 * 2 + 1 * 2 = 354px`。项目 CSS 通常会使用 `box-sizing: border-box`，让 `width` 包含 padding 和 border，布局更稳定。

## Flex 布局示例

Flex 用来排列一行或一列中的子元素：

```html
<div class="toolbar">
  <button>撤销</button>
  <button>重做</button>
  <button class="primary">保存</button>
</div>
```

```css
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar .primary {
  margin-left: auto;
}
```

`display: flex` 让按钮横向排列，`gap` 控制按钮间距，`align-items: center` 让按钮在交叉轴居中，`margin-left: auto` 把保存按钮推到右侧。

## MetaView 中的真实对应

- 页面结构：React 组件输出 HTML，例如 Studio、History、充值弹窗。
- 样式来源：`apps/web/src/styles` 和组件附近的 CSS 控制页面外观。
- 主题变量：`apps/web/src/shared/config/themePalette.ts` 定义颜色到 CSS 变量的映射，渲染器读取这些变量实现主题切换。
- 播放器限制：Remotion 渲染路径要求动画通过 frame/interpolate 控制，避免依赖 CSS transition。

# 🎯 Cursor Demo Branch - 光标换色演示

## 分支信息

- **分支名**: `cursor`
- **基于**: `main`
- **用途**: 演示光标换色功能的独立分支
- **状态**: 已推送到远程 (`origin/cursor`)

## 功能介绍

### MagicCursor 组件

这个分支引入了 `MagicCursor` 组件，实现了一个跟随鼠标的魔法光标效果：

**视觉效果**:
- 🟣 **中心点**: 10px 的彩色圆点
- 🔵 **光环**: 32px 的透明边框圆环
- ✨ **发光效果**: 背景发光效果（基于主题色）
- 🎨 **主题适配**: 自动适应应用主题色

**技术特点**:
```typescript
// 使用 CSS 变量追踪鼠标位置
--mx: 鼠标 X 坐标
--my: 鼠标 Y 坐标

// 使用主题变量
var(--primary) - 自动适应主题颜色
```

### 代码结构

```
apps/web/src/components/MagicCursor/
├── index.tsx        # React 组件，处理鼠标追踪逻辑
└── styles.css       # CSS 样式，定义光标外观
```

### 集成方式

组件已集成到 `App.tsx` 中，作为全局光标效果：

```typescript
// App.tsx
import { MagicCursor } from "./components/MagicCursor";

export default function App() {
  return (
    <div className="app-shell">
      <MagicCursor />  {/* 全局光标效果 */}
      <AppChrome ... />
      {/* ... */}
    </div>
  );
}
```

## 特点

✅ **非侵入式设计**
- 不影响现有 UI 布局
- `pointer-events: none` 确保不阻挡用户交互
- 不修改任何现有组件样式

✅ **性能优化**
- 使用 `requestAnimationFrame` 实现平滑动画
- 合理的 `z-index: 9999` 确保光标始终在顶层
- 使用 CSS 变量避免频繁 DOM 操作

✅ **主题适配**
- 自动适应应用主题色变化
- 使用 `color-mix()` 实现透明度效果
- 支持浅色和深色主题

## 使用方式

### 本地运行

```bash
# 切换到 cursor 分支
git checkout cursor

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 打开浏览器访问应用
# 将看到跟随鼠标的光标效果
```

### 实时演示

1. 打开应用后，移动鼠标
2. 观察蓝色（或主题色）的光标点和光环
3. 光环在 hover 时会扩大（可选增强效果）

## 源代码来源

- 原始实现来自: `demo/cursor` 分支 (commit: `c537d89`)
- 独立提取的功能: 光标换色演示
- 适配版本: 基于最新 `main` 分支

## 提交历史

```
26bdcc3 feat: add MagicCursor demo component - cursor showcase branch
2446cf4 feat: UI/UX improvements and mobile responsive design (继承自 main)
```

## 与其他分支的关系

| 分支 | 用途 | 光标功能 |
|------|------|---------|
| `main` | 主开发分支 | ❌ 无 |
| `demo/cursor` | 原始演示分支 | ✅ 有（包含其他实验功能） |
| `cursor` | 光标功能演示分支 | ✅ 有（仅光标功能） |

## 后续计划

### 可能的增强

1. **交互增强**
   - 点击时光环闪烁
   - 滚动时光环颜色变化
   - 按键时光环动画

2. **性能优化**
   - 添加防抖逻辑减少更新频率
   - 支持禁用/启用光标功能的开关

3. **自定义选项**
   - 可配置的光标颜色
   - 可配置的光标大小
   - 可配置的动画效果

4. **测试和文档**
   - 添加 E2E 测试确保光标功能
   - 完善使用文档
   - 性能基准测试

## 贡献指南

如果要在此分支上继续开发：

```bash
# 基于 cursor 分支创建新分支
git checkout cursor
git checkout -b feature/cursor-enhancement

# 做出修改并提交
# ...

# 推送并创建 PR
git push origin feature/cursor-enhancement
```

## 许可证

继承自主项目的许可证

---

**最后更新**: 2026-04-12
**作者**: Claude Code
**状态**: 演示分支 - 可用于展示和测试光标换色功能

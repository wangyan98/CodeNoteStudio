# Mind Map Embed Rendering — Bug Fixes 2026-06-02

## 1. Path Resolution: Root-Level Notes

**问题**: `resolveEmbedPath` 使用正则 `\/[^/]*$/` 提取源文件目录。当 notePath 不含 `/`（文件在 notes 根目录）时，正则匹配失败，`sourceDir` 仍为文件名本身，导致路径拼接为 `"3.mind.json/1.derive.json"` 而非 `"1.derive.json"`。

**修复**: 改用 `lastIndexOf('/')` + `slice()` 替代正则，路径中无 `/` 时 `sourceDir` 返回空字符串。

**文件**: `src/renderer/src/components/editors/MindMapCanvas.tsx:59-60`

---

## 2. Markdown 渲染增强

**问题**: `renderMarkdown` 只处理 headings、bold/italic、code，不支持列表、引用块等常见语法；段落包裹逻辑将 `<h1>` 等块元素错误嵌套在 `<p>` 内；`\r\n` 行尾未归一化；markdown 正则会错误匹配 code block 内部内容。

**修复**:
- 归一化 `\r\n` → `\n`
- 用占位符保护 fenced code block，避免内部 `#`/`**` 被误转
- 新增无序列表 (`- `, `* ` → `<ul><li>`)
- 新增有序列表 (`1. ` → `<ol><li>`)
- 新增引用块 (`> ` → `<blockquote>`)
- 段落包裹改为按 `\n\n` 分块 + 跳过已有块元素（`h1-h4, ul, ol, blockquote, pre, div`）

**文件**: `src/renderer/src/services/markdown-renderer.ts:68-145`

---

## 3. Embed Card Markdown CSS

**问题**: `.embed-card-body` 内无 h1-h4, p, ul, ol, li, blockquote, a, strong, em, hr, img 样式，markdown 内容在暗色主题下显示不佳。

**修复**: 为所有 markdown 元素添加暗色主题样式（合适字号、颜色、间距）。

**文件**: `src/renderer/src/components/editors/MindMapRenderer.css:141-220`

---

## 4. 折叠按钮移至分支连线

**问题**: 折叠/展开按钮位于节点矩形左侧，与分支线分离，不够直观。

**修复**:
- 有可见子节点的母节点：按钮移至水平分支线上，定位在 `elbowX - 20`（靠近分叉点）
- 已折叠节点（无可见分支线）：按钮保留在节点上，移至右侧 `cx: 82`
- 拖拽时按钮通过 `data-collapse-owner-id` + `data-orig-*` 属性跟随分支线移动

**文件**: `src/renderer/src/components/editors/MindMapCanvas.tsx:315-370, 599-640`

---

## 5. 多 Embed 卡片垂直堆叠

**问题**: 同一节点的多个 embed 卡片均定位于 `nodeRect.bottom + 4`，互相重叠，只看到最后一张。

**修复**: `syncEmbedPositions` 按 `nodeId` 分组，同一节点的卡片垂直堆叠，间距 8px，每张卡片使用前一张的 `getBoundingClientRect().height` 计算偏移。

**文件**: `src/renderer/src/components/editors/MindMapCanvas.tsx:235-260`

---

## 6. Embed 卡片被 SVG 子节点遮挡

**问题**: 嵌入卡片被下方 SVG 子节点遮挡。D3 zoom 的 CSS transform 可能为 SVG 创建独立层叠上下文，导致 SVG 内容绘制在 HTML overlay 之上。

**修复**:
- `.mindmap-container` 增加 `isolation: isolate` 创建独立层叠上下文
- `.mindmap-container svg` 增加 `position: relative; z-index: 0` 锁定 SVG 在底部
- `.mindmap-embed-overlay` z-index 从 10 提升至 100

**文件**: `src/renderer/src/components/editors/MindMapRenderer.css:1-11, 109`

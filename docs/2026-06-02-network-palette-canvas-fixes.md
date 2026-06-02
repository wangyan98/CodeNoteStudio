# Network Editor — Palette & Canvas Fixes 2026-06-02

## 1. Palette 滚动条恢复 + 双行网格布局

**问题**: 之前的 `fix: show palette in two rows with horizontal scroll` 引入 `flex-wrap: wrap` + `max-height: 64px`，但 `flex-wrap: wrap` 阻止了水平溢出（item 折行而非超出），导致 `overflow-x: auto` 无法触发横向滚动条。折行超出 `max-height` 的内容被 `overflow-y: hidden` 裁剪。

**修复**:
- 外层 `.network-palette`：改用 `display: grid; grid-template-rows: auto auto; grid-auto-flow: column`，9 个分类在 2 行内先纵后横排列，Conv/Norm 在同一列
- 内层 `.network-palette-pills`：同样用 `grid-template-rows: auto auto; grid-auto-flow: column`，每个分类下的 pill 在 2 行内排列，列宽自适应最长 pill 名称
- 横向滚动条由 palette 的 `overflow-x: auto` 处理

**文件**: `src/renderer/src/components/editors/NetworkPalette.tsx:43`, `NetworkPalette.css:1-28`

---

## 2. Canvas 平移缩放

**问题**: Canvas 不支持平移和缩放，内容超出可视区时只能通过容器滚动查看。

**修复**:
- 用 `d3.zoom()` 为 SVG 添加缩放（0.3× ~ 3×）和平移（鼠标拖拽）行为
- 内部 `<g class="canvas-content">` 通过 `event.transform` 做 transform
- Canvas 容器改为 `overflow: hidden`，由 D3 zoom 统一处理
- Drop 命中检测改用 `d3.zoomTransform(svg).invert()`：`contentY = (screenY - transform.y) / transform.k`
- SVG 高度固定为容器高度，不再设为内容高度

**文件**: `src/renderer/src/components/editors/NetworkCanvas.tsx:56-63, 273-277`, `NetworkCanvas.css:3`

---

## 3. Block 名称输入框拓宽

**问题**: 选中 block 后编辑面板中 Name 输入框仅占 4 列 grid 中的 1 列（25%），太窄。

**修复**: Name 字段加 `style={{ gridColumn: 'span 3' }}`，占 3 列宽度；Repeat 占剩余 1 列。

**文件**: `src/renderer/src/components/editors/NetworkPanel.tsx:73`

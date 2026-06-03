# Code Mapping Bug Fixes (2026-06-03)

## net.json

### 1. UPDATE_NODE 不支持 block 子节点 (d5af219)

**问题：** 通过 Symbols 按钮为 block 内 child layer 添加 @ref 时，`networkReducer` 的 `UPDATE_NODE` 只遍历顶层 `nodes`，找不到子节点。

**修复：** 改为递归 `updateNode` 函数，匹配 `nodeId` 时同时检查 `n.children` 数组。

### 2. 跳转按钮位置偏上、字号偏小 (c666a39)

**问题：** "→" 跳转图标 y 坐标为 `ny + 12`（靠近节点顶部），字号 12px。

**修复：** y 改为 `ny + nh / 2 + 4`（垂直居中，与标签同基线），字号增大到 14px。子节点同理。

## seq.mermaid

### 3. SequenceEditor 缺少 symbol-insert 监听 (c2e945a)

**问题：** 在 seq 编辑器中点击 CodeViewport 的 Symbols 按钮无响应。

**修复：** SequenceEditor 添加 `symbol-insert` 事件监听，将 `@ref(...)` 插入 Monaco 编辑器光标位置。

### 4. @ref 渲染时只显示函数名 (af63585)

**问题：** 时序图中 `@ref(repo:path:line:alignas)` 显示完整文本，太冗长。

**修复：** 显示名取最后一段（`split(':').pop()` 或 `split('#').pop()`），点击仍用完整 @ref 解析跳转。

### 5. @ref 中的 `:` 与 mermaid 语法冲突 (cf0bc8f)

**问题：** mermaid 时序图 `Actor: message` 中 `:` 是消息分隔符，`@ref(repo:path:line:name)` 里的 `:` 会导致解析错误。

**修复：** 新增 `#` 作为分隔符：`@ref(repo#path#line#name)`。`classifyRef` 优先检测 `#`，没有则回退到 `:` 兼容旧格式。

### 6. 连线长度匹配 (80bb3f1)

**问题：** 虽然只渲染函数名，但 mermaid 仍按完整 @ref 文本计算连线长度，连线过长。

**修复：** 渲染前用正则将 `@ref(...)` 替换为短占位符 `[R0]`、`[R1]`...，mermaid 按短文本布局。渲染后在 SVG 中找回占位符，替换为可点击的显示名。

### 7. ASCII 安全占位符 (85450ff)

**问题：** 初版使用 `◆N` Unicode 占位符，可能导致 mermaid 渲染失败。

**修复：** 改为纯 ASCII `[R0]`、`[R1]`... 占位符。

## MdEditor 嵌入

### 8. TypeScript 编译错误修复 (3a075b2)

**问题：** 三处编译错误：
- `SequenceDiagramViewer.tsx` import 路径错误 (`../hooks` → `../../hooks`)
- `MdEditor.tsx` 和 `MindMapCanvas.tsx` 嵌入式 `SequenceDiagramViewer` 缺少 `notePath` prop

**修复：** 修正 import 路径，补齐 `notePath` prop。

### 9. seq 嵌入在 md 中渲染崩溃 (2499993)

**问题：** MdEditor 用 `createRoot()` 渲染嵌入式 SequenceDiagramViewer，`createRoot` 创建独立 React 树，无 `AppContext.Provider`。`useCodeNavigation()` → `useAppContext()` 直接 throw，组件崩溃。

**修复：** `useCodeNavigation` 新增 `useAppDispatch()` 包装函数，try-catch 捕获 context 缺失错误，`navigateToCode` 在 dispatch 不可用时变为空操作。

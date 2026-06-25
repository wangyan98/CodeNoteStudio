# Agent 对话框 Markdown 渲染 + @ref 插入位置修复

日期: 2026-06-25

## 问题 1: Agent 对话框 assistant 消息 Markdown 未渲染

**现象**: Agent 返回的 Markdown 格式内容在对话框中显示为原始文本，`**bold**`、`# heading`、` ```code``` ` 等语法未被转换为富文本。

**根因**: `AgentDialog.tsx` 的 `renderContent` 函数对 assistant 消息直接返回原始字符串，从未调用已有的 `renderMarkdown()` 服务。

**修复**:
- `AgentDialog.tsx`: 导入 `renderMarkdown`，新增 `renderAssistantHtml()` 预处理 doc 路径并调用 `renderMarkdown()`；assistant 消息改用 `dangerouslySetInnerHTML` 渲染；doc 链接通过事件委托捕获 `a[href^="doclink://"]` 点击
- `AgentDialog.css`: 移除 `white-space: pre-wrap`，新增 Markdown 元素样式（h1-h4, p, code, pre, blockquote, table, a 等）

## 问题 2: @ref 插入位置不正确

**现象**: 点击 Code Viewport 的 Symbols 按钮将 `@ref(...)` 插入 MD 文档时，引用总是插入到文档开头，且前后没有换行。原因是点击按钮后编辑器失去焦点（cursor 丢失），Monaco 的 `trigger('keyboard', 'type', ...)` 在无焦点时默认位置为 `(1, 1)`。

**根因**: `MdEditor.insertAtCursor` 依赖编辑器当前光标位置。点击 SymbolPicker 中的按钮后，Monaco 编辑器失去焦点，光标回退到文档起始位置 `(1, 1)`。

**修复**:
- `MdEditor.tsx`: `MdEditorHandle` 接口新增 `appendToEnd(text)` 方法。实现：获取模型最后一行/列，通过 `executeEdits` 在末尾插入文本；空文档时不加前导换行，非空文档前后各加 `\n`；插入后将光标移到末尾
- `NoteViewport.tsx`: `symbol-insert` 事件处理器从 `insertAtCursor(text)` 改为 `appendToEnd(text)`

## 影响范围

- Agent 对话框 assistant 消息展示：支持标题、粗体/斜体、代码块、列表、引用、表格、链接、KaTeX 公式等完整 Markdown 渲染
- Doc 路径链接点击导航（行为不变）
- @ref 符号插入：从文档开头改为文档末尾，前后自动换行

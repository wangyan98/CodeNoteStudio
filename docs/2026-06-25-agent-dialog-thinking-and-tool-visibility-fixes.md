# Agent 对话框 Thinking 展示 + 中间过程隐藏

日期: 2026-06-25

## 问题 1: Agent 思考过程不可见

**现象**: 使用 DeepSeek 等支持 reasoning 的模型时，模型在给出最终回复前会产生大量 thinking token（内部推理过程），但这些内容完全不可见，用户只能看到"..." loading 状态，缺乏反馈感。

**根因**: 后端 `openai_compat.py` 只处理了 delta 中的 `content` 和 `tool_calls`，未捕获 `reasoning_content`（DeepSeek 协议的思考内容字段）。

**修复**:

- `agent/provider/openai_compat.py`: 在 SSE 流解析中新增 `reasoning_content` 处理，产出 `{"type": "thinking", "content": ...}` 事件
- `AgentDialog.tsx`: 新增 `thinkingText` 状态；`thinking` 事件到达时累加显示；`text` 事件到达时（模型开始输出正式回复）立即清空；`done` / `resume` / `error` 事件也清空 thinking
- `AgentDialog.css`: 新增 `.agent-message.thinking` 样式 — 蓝色左边框，`<details open>` 可折叠面板，title "🤔 Thinking..."，内容区灰色斜体，最大高度 200px 可滚动

**效果**: thinking 内容实时流式展示在对话框顶部，模型开始输出正式回复时自动消失，无需用户操作。

## 问题 2: tool_call / tool_result 中间过程污染对话

**现象**: Agent 执行工具调用时（读文件、搜索、创建文档等），`tool_call(...)` 和 `tool_result({...})` 消息占据大量对话空间，干扰用户阅读最终回复。

**修复**:

- `AgentDialog.tsx`: 渲染消息列表时 `.filter()` 掉 `role === 'tool_call'` 和 `role === 'tool_result'` 的消息
- 同 filter 条件也应用于历史恢复（`/history` API 返回的已存储消息）
- `agent_loop.py`: 后端存储逻辑保持不变（LLM 后续轮次需要 assistant+tool_calls 格式重建对话上下文）

## 问题 3: 空消息气泡

**现象**: 恢复历史时出现空白消息气泡，原因是后端存储的无文本 assistant 消息（仅有 tool_calls 无 content）content 为 `""` 或 `null`，`JSON.stringify(null)` 转成了字符串 `"null"`。

**修复**:

- `AgentDialog.tsx` 历史恢复: `m.content != null ? JSON.stringify(m.content) : ''` 替代原来的 `JSON.stringify(m.content)`，避免 `null` → `"null"` 字符串
- 渲染 filter 追加 `msg.content?.trim()` 条件，过滤空内容消息
- 清掉历史数据库即可彻底消除存量空泡

## 问题 4: @ref 符号引用插入位置错误

**现象**: 点击 Code Viewport 的 Symbols 按钮时，`@ref(...)` 插入到文档开头而非末尾。

**根因**: 点击按钮后 Monaco 编辑器失去焦点，`insertAtCursor` 回退到 `(1, 1)`。

**修复**:

- `MdEditor.tsx`: 新增 `appendToEnd(text)` 方法，通过 `executeEdits` 在文档末尾插入，前后自动换行，插入后光标移到末尾
- `NoteViewport.tsx`: `symbol-insert` 事件从 `insertAtCursor` 改为 `appendToEnd`

## 影响文件

| 文件 | 改动 |
|------|------|
| `agent/provider/openai_compat.py` | +4: 捕获 `reasoning_content` → thinking 事件 |
| `src/renderer/src/components/AgentDialog.tsx` | +40: thinking 状态管理、tool_call/result 过滤、空消息过滤、done/resume 清理 |
| `src/renderer/src/components/AgentDialog.css` | +30: thinking 气泡样式 |
| `src/renderer/src/components/editors/MdEditor.tsx` | +24: appendToEnd 方法 |
| `src/renderer/src/components/NoteViewport.tsx` | 1 行: 改用 appendToEnd |

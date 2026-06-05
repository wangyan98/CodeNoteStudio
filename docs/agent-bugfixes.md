# Agent Bug Fixes Summary

## 1. 400 Bad Request — 缺少 assistant tool_calls 消息

**错误**: `Messages with role 'tool' must be a response to a preceding message with 'tool_calls'`

**根因**: Agent loop 在 LLM 返回 tool_calls 后，只存储了文本内容和 tool 执行结果到 memory，但从未存储 assistant 消息中的 `tool_calls` 数组。导致 conversation history 中 `tool` 消息直接跟在 `user` 消息后面，缺少中间的 `assistant` 消息。

**修复**:
- `agent/memory.py`: messages 表新增 `tool_calls` 列；`add_message()` 接受可选 `tool_calls` 参数；`get_openai_messages()` 在 assistant 消息中输出 `tool_calls` 字段
- `agent/agent_loop.py`: 收到 tool_calls 后，调用 `self.memory.add_message("assistant", text, tool_calls=[...])` 存入完整的 tool_calls 信息

## 2. 400 Bad Request — arguments 类型错误

**错误**: `invalid type: map, expected a string`

**根因**: OpenAI-Compatible API 要求 `function.arguments` 是 **JSON 字符串**，但 `_finalize_tool_call_arguments()` 用 `json.loads()` 将其解析成了 dict。存入 memory 后再发送回 API 时，arguments 是 dict（map），API 拒绝。

**修复**:
- `agent/agent_loop.py`: 存储 assistant 消息时，将 `tc["function"]["arguments"]` 用 `json.dumps()` 序列化回 JSON 字符串，同时保持本地执行时仍使用 dict 形式

## 3. 400 Bad Request — content: null 不兼容

**错误**: `invalid type: map, expected a string`（同上）

**根因**: 部分 API 对 assistant 消息中 `content: null` 的处理不兼容。当 assistant 仅有 tool_calls 无文本内容时，之前的代码设置 `content: null`。

**修复**:
- `agent/memory.py`: assistant 有 tool_calls 且无文本时，完全省略 `content` 字段，而非设置为 `null`

## 4. list_files 输出过大导致 context overflow

**问题**: `list_files` 返回 JSON 数组格式，大项目目录可达数万字符，超出 LLM context window。

**修复**:
- `agent/tools/file_ops.py`: 改为紧凑的文本树形格式（tree text），节省约 92% token。增加 `max_results` 限制（默认 200）和截断提示

## 5. LLM 调用异常中断 SSE 流

**问题**: provider 调用异常时，SSE 流断裂，前端显示 `network error`。

**修复**:
- `agent/agent_loop.py`: 用 try/except 包裹 provider.chat_stream()，捕获异常后 yield `{"type": "error"}` 和 `{"type": "done"}`，保持 SSE 流正常关闭
- `agent/provider/openai_compat.py`: HTTP 400+ 时读取 error body 返回详细错误信息

## 6. max_steps 默认值

**修改**: `agent/agent_loop.py` — max_steps 从 15 提高到 80，适应更复杂的多轮对话任务

## 7. SequenceDiagramViewer 定位按钮仅重置横向滚动

**问题**: 序列图视口放大后点击定位按钮，横轴恢复到了原点但纵轴没有变化。

**根因**: `handleLocate` 中的 `scrollTo` 只设置了 `left: 0`，没有设置 `top: 0`。

**修复**:
- `src/renderer/src/components/editors/SequenceDiagramViewer.tsx:210`: `scrollTo({ left: 0 })` → `scrollTo({ left: 0, top: 0 })`

**Commit**: `32f05c7` — fix: reset both horizontal and vertical scroll on locate button click

# Agent Streaming Message Duplication Fix

## 日期

2026-07-07

## 文件

`src/renderer/src/components/AgentDialog.tsx`

## 问题描述

在与 Agent 的流式对话过程中，当 SSE 流在 `text` 事件之间夹杂 `tool_call`/`tool_result` 时，assistant 消息会重复展示，上一条消息的内容不断累加到新消息中。

## 根因

`case 'text'` 的 SSE 事件处理逻辑中，使用 `prev[prev.length - 1]` 查找最后一条消息来判断是否为 assistant 消息进行原地更新。

当 SSE 流顺序为：
```
text("Hello") → tool_call → tool_result → text(" world")
```

第二个 `text` 事件到达时，`assistantText` 已累积为 `"Hello world"`，但最后一条消息是 `tool_result`（不是 assistant），于是代码创建一个**新的** assistant 消息(id=a2, content="Hello world")，而之前的 assistant 消息(id=a1, content="Hello") 也保留在数组中。

渲染时过滤掉 tool_call/tool_result 后，两条 assistant 消息同时可见：
- a1: "Hello"
- a2: "Hello world"

## 修复

将检查从「最后一条消息是否是 assistant」改为「找到最后一条 assistant 消息的位置并原地更新」：

```diff
- const last = prev[prev.length - 1]
- if (last?.role === 'assistant') {
-   return [...prev.slice(0, -1), { ...last, content: assistantText }]
- }
+ const lastAssistIdx = prev.map(m => m.role).lastIndexOf('assistant')
+ if (lastAssistIdx >= 0) {
+   const updated = [...prev]
+   updated[lastAssistIdx] = { ...updated[lastAssistIdx], content: assistantText }
+   return updated
+ }
```

流式过程中始终只存在一条 assistant 消息，内容正常渐进累积。

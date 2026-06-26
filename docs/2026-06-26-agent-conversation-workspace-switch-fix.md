# Agent 切换 Workspace 消息未同步修复 (2026-06-26)

## 现象

切换 workspace 时，Agent 对话框中仍显示上一个 workspace 的对话历史和 frozen 快照，未切换到新 workspace 的上下文。

## 根因

两个层面：

### 1. Agent Server 端：conversation ID 全局唯一、永不切换

`agent/server.py` 中 `create_app()` 在服务器启动时生成一个 `main_conversation_id`，通过 `app_state` 表持久化到 SQLite，此后从未变更。

每个 workspace 共用同一个 conversation ID，`/history` 端点始终返回同一个 conversation 的消息。切换 workspace 时服务器未被通知，旧消息继续返回。

### 2. 客户端：AgentDialog 只监听 `visible` 变化

`AgentDialog.tsx` 中加载历史记录的 `useEffect` 依赖数组仅为 `[visible]`：

```typescript
useEffect(() => {
  if (!visible) return
  // fetch /history ...
}, [visible])
```

如果对话框在切换 workspace 时保持打开状态，`visible` 不变，就不会重新加载消息。即使关闭后重新打开，服务器端 conversation ID 未变，仍返回旧 workspace 的消息。

## 修复

**完整数据流**：

```
切换 workspace → openWorkspaceByPath()
  → dispatch(RESET_WORKSPACE_STATE)     // 清空 UI 状态
  → resetAgentConversation()            // POST /reset → 新建 conversation ID
  → AgentDialog useEffect 触发          // (workspacePath 变化)
    → 清空本地 messages
    → GET /history → 空消息列表          // 来自新 conversation
```

### 修改文件

| 文件 | 变更 |
|------|------|
| `agent/memory.py` | 新增 `reset_main_conversation()` 方法 — 创建新 conversation ID 并写入 `app_state` 表 |
| `agent/server.py` | `main_conversation_id` 改为可变 dict `_state`；新增 `POST /reset` 端点调用 `reset_main_conversation()` |
| `src/main/ipc-handlers.ts` | 新增 `agent:reset-conversation` IPC handler → 向 agent server 发送 `POST /reset` |
| `src/preload/index.ts` | 暴露 `resetAgentConversation()` API 给渲染进程 |
| `src/renderer/src/types/electron.d.ts` | 新增 `resetAgentConversation` 类型声明 |
| `src/renderer/src/components/WorkspaceToolbar.tsx` | `openWorkspaceByPath()` 中在 `RESET_WORKSPACE_STATE` 后调用 `resetAgentConversation()` |
| `src/renderer/src/components/AgentDialog.tsx` | 1) 加载历史前先清空本地 messages/frozen；2) `useEffect` 依赖增加 `state.workspacePath` |

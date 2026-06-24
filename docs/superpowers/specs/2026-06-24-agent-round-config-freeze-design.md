# Agent 轮次配置冻结 (Round Config Freeze) 设计

日期：2026-06-24
状态：设计已批准，待写实现计划
背景 TODO：#26「不能在每次询问 agent，修改这轮访问的 active file 和 repos」

## 问题

当前 `AgentDialog.handleSend` 在每次发消息时，都把**实时的**应用状态
（`state.workspacePath`、`state.codeRepoPath`、`state.activeCodeFileIndex` / `openCodeFiles`）
打包进 `/chat` 请求体。`AgentLoop` 只在 memory 为空（首轮）时用这些值构造一次
system message，之后整轮沿用这份冻结的 system prompt。

后果：首轮之后，`workspace/repos/active_file` 在后端已不再被用于行为决策，但前端
每条消息仍传「当前」值——用户在轮次中途切换文件/仓库并不改变 agent 实际看到的
上下文，却让 UI 与 agent 内部状态对不上号，且无任何冻结/重置语义。

## 目标

1. **轮次开始时冻结配置**：进入一个 agent 对话轮次时，把当时的「当前活动代码文件
   + 当前代码仓库」快照下来，整轮使用，轮次中途切换文件/仓库不影响本轮。
2. **持久化**：冻结快照与会话内容落盘到 `~/.code-note-studio/`，服务器重启/崩溃
   后能恢复同一轮次的上下文与消息。
3. **Clear 重置轮次**：点击 header 的 Clear 按钮时，清空消息 + 清空冻结快照，
   下一条消息当作全新首轮，重新冻结。

## 范围（冻结内容）

窄而确定，与现有传给 agent 的字段对齐：

- 当前活动代码文件路径（单个，非全部打开文件列表）
- 当前代码仓库（单个）
- 工作区路径
- 当时选中的 provider id

冻结时机：**用户在对话框可见状态下发出第一条消息时**。对话框打开瞬间不冻结；
冻结发生在首条 user 消息发出的事件中。

## 方案

采用「渲染端冻结快照 + 后端落盘持久化」：

- 渲染端 `AgentDialog` 维护冻结快照，首轮发送时由实时 state 产生，之后每条
  `/chat` 请求体从冻结快照取值（不再读实时 state）。
- 后端 `AgentLoop` 首轮逻辑不变（system message 仍天然一次性构造）。增加把
  冻结快照与会话消息全部落盘到 `~/.code-note-studio/agent-conversation.db`，
  server 重启后可恢复同一轮次。
- Clear 一并清空消息与快照。
- 后端权威的「冻结配置」即第一条 system message 文本（持久化在 `messages`
  表里）；`current_turn` 表的结构化字段仅用于前端 UI 恢复与下次请求体拼装。

## 设计 1 — 冻结快照数据结构与产生时机

```ts
interface FrozenContext {
  workspace: string          // state.workspacePath || ''
  repos: string[]            // state.codeRepoPath ? [state.codeRepoPath] : []
  activeFile: string         // 当前活动 code file path
  providerId: string         // 当时 selectedProvider
  frozenAt: string           // 冻结时刻 ISO 时间（显示/去重用）
}
```

状态加在 `AgentDialog` 组件内（不进全局 AppContext，冻结是 agent 对话框的局部
关切）：

```ts
const [frozen, setFrozen] = useState<FrozenContext | null>(null)
const roundIdRef = useRef<number>(0)  // 日志/调试用
```

产生时机：在 `handleSend` 最前面。当 `frozen === null` 且处于待冻结态时，读取
实时 `state` 生成快照并 `setFrozen`。

实现细节：`handleSend` 是 `useCallback`，用 `frozenRef` 同步保存最新 `frozen`，
请求体从 `frozenRef.current` 取，避免依赖列表膨胀与闭包旧值问题。

## 设计 2 — 后端持久化与轮次恢复

落盘位置：`~/.code-note-studio/agent-conversation.db`（与现有 `providers.json` /
`agent-config.json` 同目录）。`server.py` 的 `memory` 默认从 `:memory:` 改为
该路径，server 进程退出不丢失。

memory 表结构 —— 在现有 `conversations`/`messages` 之外加一张单行快照表：

```sql
CREATE TABLE IF NOT EXISTS current_turn (
  id INTEGER PRIMARY KEY CHECK (id = 1),   -- 单行表，恒为 1
  workspace TEXT,
  repos TEXT,          -- JSON array
  active_file TEXT,
  provider_id TEXT,
  output_dir TEXT,
  frozen_at TEXT,
  updated_at TEXT
)
```

单行 CHECK(id=1)：一个 server 进程只服务一个活跃轮次，简化为「当前轮次的快照」
单行，无多轮次切换/管理 UI。

新 `ConversationMemory` 方法：

```python
def set_current_workspace(ws: dict)      # upsert id=1，写快照
def get_current_workspace() -> dict | None
def clear_current_workspace()            # 删 id=1 行
```

`/chat` 首轮结束、构造并写入 system message 后，紧接 `memory.set_current_workspace(ctx)`
落盘结构化快照。后端权威冻结配置 = `messages` 表里那条 role=system 文本；
`current_turn` 结构化字段仅前端 UI 恢复用。

`/history` GET 返回增加 `frozen` 字段：

```json
{ "ok": true, "messages": [...], "frozen": {工作区快照} | null }
```

`/history` DELETE 清消息 **并** `clear_current_workspace()`。

渲染端恢复逻辑（对话框打开时）：拉 `/history` 后：

- `data.frozen` 非空 **且** `data.messages` 非空 → 进行中轮次，`data.frozen`
  回填 `frozen`，`data.messages` 回填 `messages`。
- `data.messages` 空（刚 Clear 完 / 首次打开）→ `frozen=null`，进入「待冻结」。

server 重启恢复链路：DB 落盘 → 重启后 `ConversationMemory` 读出 `messages` +
`current_turn` 行 → 前端拉 `/history` 一并拿回。`AgentLoop` 首轮判定按
`len(existing) == 0`，重启后已有持久化消息，下一条消息归入同一轮、继续用既有
system message（不重新冻结）。

## 设计 3 — 三态模型、Clear、首轮判定

### 前端三态（派生量，由 messages + frozen 推出，不单独存）

```
roundState =
   messages.length === 0          → "pending"        待冻结：下条消息会冻结
   frozen !== null                → "frozen"          进行中·有快照：header 显示 Repo、请求体用 frozen
   else (messages 非空,frozen null) → "staleContext"  进行中·快照不可显示：header 不显示 Repo、frozen 不再变
```

冻结触发规则：在 `handleSend` 起，仅当 `roundState === "pending"` 时读实时
state 生成快照并 `setFrozen`。`"frozen"` 与 `"staleContext"` 态都不重新冻结。

### Clear 链路

1. 渲染端 `DELETE /history`
2. 后端 `clear()` 删 messages **+** `clear_current_workspace()` 删 id=1 行
3. 渲染端 `setMessages([])` + `setFrozen(null)`

回到 `"pending"`，下条消息读实时 state 重新冻结 = 新轮次。

### 后端首轮判定

```python
existing = self.memory.get_messages()
is_pending_first_turn = len(existing) == 0
```

- 首轮：构造 system message（沿用既有逻辑），`add_message("system", ...)` 后
  紧接 `memory.set_current_workspace(ctx)` 落盘。
- 非首轮：不重构，沿用持久化里的 system message；请求体里的字段此后不参与
  后端行为决策。

### 不一致兜底（持久化快照丢、messages 还在）

后端无特殊处理，自然沿用既有 system message（其文本已是权威冻结配置，行为
正确性不受影响）。前端由三态推导自然落到 `"staleContext"`：不丢历史、不重走
首轮、不读实时 state 重新冻结，避免制造前后端矛盾。无「丢历史」危险路径。

## 设计 4 — UI 显示与测试

### header 显示（context 区域）

- `"frozen"`：`Repo: {frozen.repos 末段}`（从快照取，不读实时），附冻结标记
  如 `🔒` + `frozenAt` 时间；active file 路径放 title tooltip。
- `"pending"`：`Repo: {实时 codeRepoPath 末段或 none}`（冻结前预览，附说明即将
  冻结的是此值）；无冻结标记。
- `"staleContext"`：`Repo: (快照不可用 / unknown)`；无冻结标记。

Clear 按钮行为不变（header 现有按钮）。无需新增「开始新轮次」按钮。

### 测试

后端 pytest（`agent/tests/`）：

- `test_first_turn_persists_system_and_workspace`：首轮后 `current_turn` 行存在
  且字段正确，`messages` 含 system。
- `test_subsequent_turns_reuse_system_message`：第二条 `/chat` 不新增 system
  message、不覆写 `current_turn`。
- `test_clear_resets_both`：DELETE 后 messages 空且 `current_turn` 行不存在。
- `test_restart_recovery`：落盘 memory、新建同路径 `ConversationMemory` →
  `get_messages()` 与 `get_current_workspace()` 还原。

前端 vitest（遵现有测试惯例，补 `AgentDialog` 行为测试若无）：

- 首轮发送后改变 `state`，验证第二条请求体用首轮冻结值而非新 state。
- Clear 后 `frozen=null`。

## 改动文件清单

- `agent/memory.py`：加 `current_turn` 表 + `set_current_workspace` /
  `get_current_workspace` / `clear_current_workspace` 三方法。
- `agent/server.py`：memory 默认落 `~/.code-note-studio/agent-conversation.db`；
  `/chat` 首轮后 `set_current_workspace`；`/history` GET 带 `frozen`、
  DELETE 清快照。
- `agent/agent_loop.py`：首轮落盘快照一行调用 + 首轮判定语义命名/注释。
- `src/renderer/src/components/AgentDialog.tsx`：`frozen` state + `frozenRef` +
  三态派生 + `handleSend` 冻结触发 + `handleClearHistory` 清 `frozen` +
  header 三态显示 + `/history` 回填逻辑。
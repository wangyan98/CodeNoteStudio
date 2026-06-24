# Sub-Agent Tool Design

Date: 2026-06-24
Status: Design — approved pending spec review
Related: TODO #26 (agent round config freeze) — sub-agents reuse the frozen round config.

## Goal

Give the main agent a `create_subagent` tool that delegates subtasks to one or more child agents. Delegated work runs in an isolated context (the main agent's history is not polluted by the children's tool results), and nesting is strictly forbidden: a child agent can never spawn its own children.

## Decisions (confirmed in brainstorming)

| Concern | Decision |
|---|---|
| Purpose | Delegate subtasks + isolate context |
| Child inherits | A clone of the parent's full history, but `tool`-role message contents replaced with a placeholder (master → child edge only) |
| Placeholder edge | Only on the master → child inheritance edge; the child → master return carries the real conclusion, un-redacted |
| Anti-nesting | Three gates, any one hit → reject: (1) child system-prompt soft guidance, (2) `<subagent_root/>` tag scan, (3) `is_subagent` state flag. All checked before running the model |
| Child toolset | Same registry as the parent (incl. `create_subagent`); nesting prevented purely by the three gates, not by removing tools |
| Conclusion return | `create_subagent` is an ordinary tool; each child's final assistant text becomes the `tool_result` returned to the main agent (un-redacted) |
| Child storage | Written to the DB under its own `conversation_id` |
| Concurrency | The main agent can fan out multiple children in parallel, gathered into one `create_subagent` call |

## Approach: method A — reuse `AgentLoop`, upgrade tool layer to async

Existing architecture mapping:

- `AgentLoop` (`agent/agent_loop.py`) — async tool-calling generator. Reused unchanged in shape; gains `conversation_id`, `is_subagent`, parent history injection.
- `ConversationMemory` (`agent/memory.py`) — SQLite message store. Multi-conversationalized.
- `ToolRegistry` (`agent/tools/registry.py`) — executor. Upgraded to await async handlers.
- New `create_subagent` tool (`agent/tools/subagent_tool.py`) — orchestrates parallel children, applies the three gates.

Rejected alternatives: B (separate `SubAgentLoop` class → duplicated loop logic, drift risk), C (external HTTP/process service → network/process topology, YAGNI).

## §1 Module & boundary overview

```
ConversationMemory  ── multi-conversation ──>  read/write keyed by conversation_id
        │
AgentLoop  ── inject conversation_id + is_subagent flag ──>
        │           ├ is_subagent=True: inherit parent history (tool→placeholder) + inject tag + soft guidance
        │           └ tool execution layer awaits async handler (supports parallelism)
        │
ToolRegistry  ── execute tolerates sync/async handlers ──>
        │
        └──────── create_subagent tool (new)
                    ├ blocking entry: fan out N children from one tool_call, gather
                    ├ three anti-nesting gates (tag scan + state flag + prompt guidance)
                    └ returns: each child's final assistant text as the tool_result
```

Responsibility boundary (one sentence each):
- `ConversationMemory`: store/retrieve messages keyed by conversation id; no implicit "latest conversation".
- `AgentLoop`: drive one tool-calling round; with the sub-agent form it is the same driver, just constructed with a different `conversation_id` / `is_subagent` / parent snapshot.
- `ToolRegistry`: execute tools; upgraded to run async handlers, to support parallel child loops.
- `create_subagent` tool: orchestrate parallel subtasks → aggregate their conclusions.

Files:
- New `agent/tools/subagent_tool.py` (`register_subagent_tools` + gate logic).
- Edit `agent/memory.py` (multi-conversation).
- Edit `agent/agent_loop.py` (`conversation_id` injection, `is_subagent` form, async tool execution).
- Edit `agent/tools/registry.py` (async handler support).
- Edit `agent/server.py` (fix main `conversation_id`; register the new tool; bind host).
- Edit `agent/context.py` (`build_subagent_system_message` + constants).
- New tests `agent/tests/test_subagent.py`; extend `test_memory`, `test_agent_loop`, `test_server`.

## §2 Anti-nesting three gates

Only the main agent may call `create_subagent`; a child can never descend. Three gates, any one hit → reject.

### Gate (1) — child system-prompt soft guidance (soft)

The child's `system` message gets a guard block appended to its tail (does not replace the original system):

```
<subagent_guard>
You are running as a SUB-AGENT. You MUST NOT call the `create_subagent` tool for any reason.
Your job is to complete the delegated subtask using the other available tools and end with a concise final answer. Calling `create_subagent` will be rejected.
</subagent_guard>
```

Soft — lowers the chance the model mis-calls; not the sole defense.

### Gate (2) — special-tag scan (hard)

The child's `system` message carries a machine-scannable tag at its first line:

```
<subagent_root/>
```

placed before the original system text. `create_subagent`'s handler, before any model call, scans the host `AgentLoop`'s full history and checks each message's `content`; if any message begins with `<subagent_root/>` (or contains the tag), the current context is already a sub-agent → reject, return without running a model:

```json
{"ok": false, "reason": "nested_subagent_blocked", "gate": "tag"}
```

Rationale for scanning the *current AgentLoop's full history* rather than only the freshly-built system: the child's history also contains the inherited (tagged) system message — one scan suffices. The main agent's system carries no tag, so the scan passes.

### Gate (3) — state flag (hard)

`AgentLoop.is_subagent: bool`. `register_subagent_tools(registry, host_loop)` captures the host `AgentLoop`; the handler entry asserts `if host_loop.is_subagent: return {blocked...}`.

### Conflict / ordering

- Gates (2) and (3) are independent; both checked, union-reject (any hit → reject, no precedence dependency).
- Gate (1) only lowers probability; failure does not affect (2)/(3) as fallback.
- Rejection makes **no model call**: gate (1) is at prompt level (model may still call, hence not a hard reject); gates (2)/(3) intercept at the handler entry, before any model runs.
- `create_subagent` remains visible in the child's tool schema list — nesting is prevented purely by gates (2)/(3), not by removing the tool from the schema.

## §3 Inheritance, placeholder redaction, multi-conversation storage

### 3.1 Multi-conversation `ConversationMemory`

Currently the memory implicitly takes "the latest conversation" — unsafe under parallelism. Switch to an explicit `conversation_id` threaded throughout.

- `add_message(role, content, tool_name=None, tool_calls=None, conversation_id=None)`: `None` → falls back to the main conversation (the main `AgentLoop` instance pins one id).
- `get_messages(conversation_id=None)`, `get_openai_messages(conversation_id=None)`, `clear(conversation_id=None)`, `set_current_workspace(ws, conversation_id=None)`, `get_current_workspace(conversation_id=None)` — add optional param.
- `get_or_create_conversation()` is kept but used **only for the main conversation's** lazy init; each child uses an explicit uuid from the caller side, no longer relying on "latest".
- New `create_conversation(conv_id: str)`: `INSERT OR IGNORE` a conversation row, for explicit child table creation.
- Fix the main `conversation_id` once in `server.py` (every `/chat` reuses the same conversation, matching the existing "accumulate" semantics).

Backward compat: all existing call sites get `conversation_id` threaded through; new params default to `None` so existing tests don't break.

### 3.2 Inheriting parent history (master → child, tool result → placeholder)

The child `AgentLoop`, during construction (before `run`), performs one inheritance pass:

```
parent_msgs = memory.get_messages(parent_conv_id)
for m in parent_msgs:
    if m["role"] == "tool":
        content = PLACEHOLDER_TOOL_RESULT
    else:
        content = m["content"]
    memory.add_message(m["role"], content,
                       tool_name=m["tool_name"], tool_calls=...,
                       conversation_id=child_conv_id)
```

- `PLACEHOLDER_TOOL_RESULT = "[tool result omitted — subagent inherited context]"`
- Only the `tool` role's `content` is replaced; `tool_calls` (the assistant's tool-call structures) are preserved — keep "what calls were made" context, drop only the bulk of returned payloads.
- system message: the child uses its **own freshly-built system** (`build_subagent_system_message(...)` + `<subagent_root/>` tag + §2 soft guidance) and does **not** inherit the parent system. The parent's system is dropped during inheritance (avoid two systems clashing), replaced by the child's tagged system. This also establishes gate (2): the child's system first line always carries `<subagent_root/>`; the main agent's does not.
- user / assistant are inherited as-is (dialogue context, bounded bulk, not redacted).

### 3.3 The child's own loop-time tool results

Per the decision: placeholder redaction happens **only on the inheritance edge (master → child)**. The tool results the child produces while running its own loop are **real** — it does actual work (read files, search), results must feed back into its own loop. These real tool results land under the **child conversation_id**.

### 3.4 Conclusion return (child → master, not redacted)

When the child's `run` reaches a no-tool-call turn, take the last assistant text as its "conclusion". `create_subagent` aggregates the N children's conclusions into one `tool_result`, written back to the **main conversation_id**. This return is **real text, not a placeholder** (Q6 decision).

### 3.5 Child storage & lifecycle

- Each child: a new uuid conv_id + its own `AgentLoop` instance (`is_subagent=True`, toolset §4).
- In-process lifetime = the duration of one `create_subagent` call; once it returns, that child's loop and its writes are done (the conversation rows persist in the DB, queryable via `/history` by conv_id, §6.2).
- Children don't share the main memory handle's mutable state — they each write under their own conv_id, no cross-talk.

### 3.6 Parallel safety

- Distinct conv_ids let parallel children write their own rows — no shared mutable state.
- `memory.conn` is a single non-thread-safe sqlite connection; but this system is single-process asyncio and all writes happen serialized within one event-loop thread (no true thread parallelism), so sqlite within the same thread is safe. Parallel children are **asyncio-concurrent** (coroutines), not thread-parallel — the shared `conn` is safe.
- `provider.chat_stream`'s `httpx.AsyncClient` is IO-concurrent and won't hit sqlite writes simultaneously. Verified safe.

## §4 Child toolset, async registry, parallel orchestration

### 4.1 `ToolRegistry` tolerates sync/async handlers

```python
async def execute(self, name, arguments):
    handler = self.tools[name]["handler"]
    result = handler(**arguments)
    if asyncio.iscoroutine(result):
        result = await result
    return result
```

- Sync handlers (the majority) return a dict and are not awaited — zero overhead.
- The only async handler is `create_subagent`; it gets awaited.
- `AgentLoop`'s call site becomes `result = await self.registry.execute(tool_name, args)`.
- Tests can `await registry.execute(...)` directly, or `asyncio.run` in sync helpers.

### 4.2 Registering an async tool

`registry.register`'s signature is unchanged (handler is still an unannotated Callable); async needs no special annotation — detected at runtime via `iscoroutine`. `create_subagent` registers as `async def`.

### 4.3 Child toolset

The child reuses the **same `registry` instance** as the parent; no tool's schema is removed.

- `create_subagent` stays visible to the child (keeps the schema boundary minimal).
- Nesting is fully handled by the §2 three gates, not by tool removal.
- The child's `get_openai_schemas()` is the full set; a model that calls `create_subagent` is intercepted by gates (2)/(3) before any model runs, returning a blocked result directly to the child's own loop (the child, seeing blocked, will typically route around and finish using other tools).

Trade-off chosen: **do not remove** `create_subagent` from the child's schema — keeps the registry single-shaped and the boundary minimal, and anti-nesting was never meant to depend on tool visibility.

### 4.4 `create_subagent` tool contract

```
name: create_subagent
description: Spawn one or more sub-agents to run delegated subtasks in parallel.
            Each sub-agent inherits the current conversation history (tool results
            redacted) and runs its own independent tool loop to completion. Returns
            each sub-agent's final answer. CANNOT be called from within a sub-agent.
parameters:
  type: object
  properties:
    tasks:
      type: array
      minItems: 1
      items:
        type: object
        properties:
          description: {type: string, description: "The delegated subtask."}
        required: [description]
  required: [tasks]
```

- Accepts a **tasks list** (supports parallel multiple subtasks, Q7 decision). Each item is an independent child's subtask description.

### 4.5 Handler internals (parallel orchestration)

`register_subagent_tools(registry, host_loop)` captures host `host_loop` (the main `AgentLoop` instance) + its conv_id in closures:

```python
async def create_subagent(tasks):
    # gate ③ state flag
    if host_loop.is_subagent:
        return {"ok": False, "reason": "nested_subagent_blocked", "gate": "state"}
    # gate ② tag scan (scan host_loop's current history system)
    if _has_subagent_root(host_loop.memory, host_loop.conv_id):
        return {"ok": False, "reason": "nested_subagent_blocked", "gate": "tag"}

    parent_conv_id = host_loop.conv_id
    builds = [_build_subagent(t["description"], parent_conv_id) for t in tasks]
    results = await asyncio.gather(*[_run_one(b) for b in builds],
                                  return_exceptions=True)
    return _aggregate(results, builds)   # see §5
```

- `_build_subagent(desc, parent_conv_id)`: new child_conv_id (uuid) → inherit parent history (§3.2 placeholder) → write child system (tag + soft guidance) → write one user message = `desc` → construct `AgentLoop(is_subagent=True, conversation_id=child_conv_id)` → return that instance. Inheritance only reads the parent and writes the child, never writing the same row concurrently.
- `_run_one(loop)`: drive the child loop `async for event in loop.run(init_user=desc)` to `done`, collect the final assistant text; an exception is bucketed as `{"ok": False, "error": ...}` for that item.
- Parallelism via `asyncio.gather` (Q7 parallel multiple subtasks). Children share no mutable state (each its own conv_id), safe.

### 4.6 Child system message building

The child does not reuse the parent system. `build_subagent_system_message(parent_workspace, repos, ...)` produces:

```
<subagent_root/>
{original SYSTEM_TEMPLATE filled}
<subagent_guard>
You are running as a SUB-AGENT. You MUST NOT call the `create_subagent` tool...
</subagent_guard>
```

- Separate parent/child system builders so the main agent's system isn't polluted.
- workspace/repos etc. reuse the **main agent's frozen round config** (TODO #26's persisted `current_turn`), so the child aligns with the main agent's turn.

### 4.7 Relation to the TODO #26 frozen config

The child's round config (workspace/repos/active_file/provider) is read from the **main agent's frozen `current_turn` snapshot**, not freshly from the request — keeping the "frozen-per-round" semantic consistent; the child won't pull a new environment after the main side has frozen. This aligns multi-conversation (§3) with the existing frozen config.

## §5 Result aggregation, event flow, error handling

### 5.1 Child driving: reuse `AgentLoop.run`, take the final conclusion

`_run_one(child_loop)` consumes the child `AgentLoop.run(...)` async generator to `done`:

```python
final_text = ""
async for event in child_loop.run(desc):  # desc already written as a user msg during construction; run reads history normally
    if event["type"] == "text":
        final_text += event["content"]
return final_text.strip() or "(no final answer)"
```

- Inside `run`, the child reads its conv history (inherited placeholder tools + the desc user msg) → normal tool loop → converges on a no-tool-call assistant text.
- Child reaching `max_steps` without converging → final_text gets a `[max steps reached]` marker and is still returned (no throw).
- The child's intermediate events are **not** yielded to the main agent — the main agent only cares about the final conclusion; the child's text/token stream is internal to its loop. The main end UI is never polluted by child streams.

### 5.2 Aggregation returned to the main

After collecting all child results, `create_subagent` builds the return value (the tool_result written back to the main agent, **not redacted**):

```json
{
  "ok": true,
  "subagents": [
    {"index": 0, "ok": true,  "answer": "<child A's final text>", "conversation_id": "uuid-A"},
    {"index": 1, "ok": false, "error": "<msg>",                  "conversation_id": "uuid-B"}
  ]
}
```

- Every item always carries `index` and `conversation_id`. Success items additionally carry `ok: true` + `answer`; failure items carry `ok: false` + `error` (no `answer`). This matches §5.3's per-item bucketing.
- Order matches `gather`'s order, consistent with `tasks` order (gather preserves order).
- Each entry carries `conversation_id` for §6.2's `/history` lookup.

### 5.3 Gate-vs-failure distinction

| Case | Return | Consumes model call |
|---|---|---|
| Gate (2)/(3) hit (nested) | `{"ok": false, "reason": "nested_subagent_blocked", "gate": "tag"/"state"}` | No, intercepted pre-model |
| `tasks` empty/invalid | `{"ok": false, "reason": "invalid_tasks"}` | No |
| A child throws | that item `{"ok": false, "error": "<msg>", "conversation_id": "<id>"}`, others return normally | that child did, others as scheduled |
| A child exceeds steps | that item returns its answer (with `[max steps reached]` marker) | yes |

- Nesting rejection is a tool-level hard reject; `AgentLoop` treats it as an ordinary tool_result handed to the (sub) loop if raised in a sub context, or to the main loop (the main agent mis-calling shouldn't happen, but the gate catches it).
- An individual child failing doesn't drag down the others — `asyncio.gather(..., return_exceptions=True)` + per-item bucketing.

### 5.4 Main `AgentLoop` once it receives the tool_result

The main `AgentLoop.run` executes the dict returned by `create_subagent` through the same path as every tool: truncation (`MAX_TOOL_RESULT_CHARS=8000`), written to the main conv_id as a `tool` message, yields a `tool_result` event to the frontend.

- A large aggregate may exceed 8000 chars → the existing truncation logic (keep `ok` + a slim projection of `subagents`) keeps the main loop safe.
- This embodies "isolate context": the child does the dirty work and the main agent only gets the compressed conclusion tool_result — bounded main-history bulk.

### 5.5 Error handling boundary

- **provider failure**: a child's provider throws inside `run` → caught inside the child loop's try → the child finishes immediately with final_text = `[provider error: ...]`, returned as that item's answer (not unwound upward, avoiding one child's crash detonating the whole gather).
- **inheritance failure** (e.g. DB read of parent fails): the `create_subagent` handler returns a whole `{"ok": false, "reason": "inherit_failed", "error": "...", "conversation_id": "..."}`, no partial result.
- **write-DB failure**: follows today's memory model (no retry), the exception bubbles to that child item's error bucket.

### 5.6 Out-of-scope (preferring cut)

- No token-budget tracking/cap for children (exceeds max_steps → stop, already present).
- No recursive depth counter (rule: a child can never descend, depth is always 1; revisiting multi-level nesting is a future discussion).
- No shared blackboard among subtasks — parallel subtasks are independent (Q7).

## §6 server integration, /history display, test matrix

### 6.1 server.py changes

- **Main conv_id pinned**: `create_app` generates a main `conversation_id` (uuid) at build time, passed to `ConversationMemory` and the main `AgentLoop`. Each `/chat` reuses the same main conv (matching the existing "accumulate" semantics; Clear calls `memory.clear(main_conv_id)`).
- **Register the sub-agent tool**: `build_registry()` produces the registry without `create_subagent`; the `AgentLoop` injects itself as host on construction and registers `create_subagent` into the registry with `host_loop` bound in closures. On each new `AgentLoop` per `/chat`, first remove the old host's `create_subagent` and rebind to the new one (overwrite registration).
- `server.py` compatibility: the provider/memory/registry injection path is unchanged; the `AgentLoop` only takes an extra `conversation_id`, and the server actively binds the host.
- The `agent_factory` test hook (already in server) gets a `conversation_id` param threaded, keeping it injectable/testable.

### 6.2 /history display

`GET /history` currently returns the main conv's messages; extend to allow lookup by child conv_id:

- `GET /history?conversation_id=<id>`: returns that conv's messages (the child's full record is reviewable).
- Defaults to the main conv when omitted.
- An upper-layer `src/main` history renderer (if any) shows child convs as needed; this spec **opens the query capability only** — whether the frontend adds an "expand sub-agent" UI is future work (out of scope here).
- The response includes `subagent_conversations: [{"conversation_id", "parent_id", "created_at"}]` for traceability: when writing a child conv, record `parent_id = main conv_id`. Concretely this is `create_conversation(conv_id, parent_id)` (parent_id optional, None for the main conv) — a single new column on the `conversations` table or a side `conversation_parents(parent_id, child_id)` light table. Low cost; added because the "write DB + separate conv_id" decision needs traceability.

### 6.3 AgentLoop change list (agent_loop.py)

1. `__init__` adds params `conversation_id: str`, `is_subagent: bool = False`, `parent_conv_id: str | None = None`, `inherited_messages: list | None = None`.
2. `run`: every `self.memory.add_message(...)` call threads `conversation_id`; the tool-execution loop changes to `await self.registry.execute(...)`.
3. First-turn system write: the main agent writes the main system; the child skips this branch (the child system is written by the handler during construction) — inside `run`: `if is_pending_first_turn and not self.is_subagent:`.
4. Round-config freeze (`current_turn`) is written only by the main agent; children skip it (children reuse the main frozen snapshot, §4.7).
5. Build the child system via `build_subagent_system_message` (new in `context.py`), including the `<subagent_root/>` tag + soft guidance.

### 6.4 Placeholder and tag constants

- `PLACEHOLDER_TOOL_RESULT = "[tool result omitted — subagent inherited context]"`
- `SUBAGENT_ROOT_TAG = "<subagent_root/>"`
- Author at the top of `subagent_tool.py` or in `context.py`, centralized and testable.

### 6.5 Test matrix

| Case | Covers |
|---|---|
| Multi-conversation memory CRUD | add/get/clear with a specified conv_id |
| Inheritance + placeholder | after a child inherits, its history's tool message `content == placeholder`; user/assistant unchanged |
| Tag present | the child's system first line contains `<subagent_root/>`; the main agent's does not |
| Gate (2) tag reject | simulate a sub calling `create_subagent` → intercepted, doesn't call the stub provider |
| Gate (3) state reject | `is_subagent=True` rejects outright |
| Gate (1) soft guidance | the system contains the MUST NOT soft text |
| Single child return | `tasks=[{desc}]` → calls the stub provider once → returns a conclusion |
| Parallel multi-child | `tasks=[a, b]` → the stub runs each independently, results in order |
| One child failing doesn't cascade | `gather(return_exceptions=True)`, one item throws, others normal |
| Exceeds-steps marker | stub always tool_calls → max_steps → answer carries `[max steps reached]` |
| Conclusion un-redacted | the main agent's received tool_result contains the real child conclusion text |
| /history by conv lookup | querying by `conversation_id` returns the child conv's messages |

Existing `test_agent_loop` / `test_memory` / `test_server` get `conversation_id` added at each site (new params default to `None`, so unbroken).

## Self-review notes

- 4.3 "don't remove the tool schema" is consistent with the three-gate interception in §2.
- 5.5 "no partial on write failure" is consistent with `gather` per-item bucketing.
- 3.6 "asyncio-concurrent not thread-parallel" is consistent with sqlite safety.
- Scope: a single implementation plan — one tool, three unit edits, one new-test file; no multi-level nesting, no token budget, no shared blackboard.
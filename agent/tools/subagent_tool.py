"""Sub-agent tool — create_subagent.

Registers a tool that spawns parallel child AgentLoops with:
  - Parent-history inheritance (tool results redacted).
  - Triple-gate anti-nesting: prompt soft guidance (in system message),
    <subagent_root/> tag scan, and is_subagent state flag.
"""
import asyncio
import json as _json
import uuid
import os
from context import (
    SUBAGENT_ROOT_TAG,
    PLACEHOLDER_TOOL_RESULT,
    build_subagent_system_message,
)


def _has_subagent_root(memory, conv_id: str) -> bool:
    """Scan a conversation's messages for the <subagent_root/> tag.

    Returns True if ANY message's content contains the tag — this means
    the current context is already a sub-agent (the tag was injected in
    its system message) and nesting must be rejected.
    """
    msgs = memory.get_messages(conversation_id=conv_id)
    for m in msgs:
        content = m.get("content", "") or ""
        if SUBAGENT_ROOT_TAG in content:
            return True
    return False


def _check_gates(host_loop, memory, conv_id: str) -> dict | None:
    """Check all three anti-nesting gates. Returns a blocked dict or None (pass)."""
    # Gate (3): state flag
    if host_loop.is_subagent:
        return {"ok": False, "reason": "nested_subagent_blocked", "gate": "state"}
    # Gate (2): tag scan
    if _has_subagent_root(memory, conv_id):
        return {"ok": False, "reason": "nested_subagent_blocked", "gate": "tag"}
    return None


def _inherit_parent_history(memory, parent_conv_id: str, child_conv_id: str) -> None:
    """Clone parent messages into child conv, redacting tool-result contents."""
    parent_msgs = memory.get_messages(conversation_id=parent_conv_id)
    for m in parent_msgs:
        role = m["role"]
        if role == "system":
            # Do NOT inherit the parent's system — child gets its own.
            continue
        content = m.get("content", "") or ""
        if role == "tool":
            content = PLACEHOLDER_TOOL_RESULT
        tool_name = m.get("tool_name") or None
        tool_calls_raw = m.get("tool_calls") or None
        tool_calls = None
        if tool_calls_raw:
            tool_calls = _json.loads(tool_calls_raw) if isinstance(tool_calls_raw, str) else tool_calls_raw
        memory.add_message(
            role, content,
            tool_name=tool_name,
            tool_calls=tool_calls,
            conversation_id=child_conv_id,
        )


def _build_subagent(desc: str, parent_conv_id: str, host_loop):
    """Construct a child AgentLoop with inherited history, tagged system, and task."""
    from agent_loop import AgentLoop

    child_conv_id = str(uuid.uuid4())
    memory = host_loop.memory
    registry = host_loop.registry

    # Create the child conversation row with parent link.
    memory.create_conversation(child_conv_id, parent_id=parent_conv_id)

    # Inherit parent history (system dropped, tool results redacted).
    _inherit_parent_history(memory, parent_conv_id, child_conv_id)

    # Write the child's own tagged system message.
    tools_summary = [
        {"name": t["name"], "description": t["description"]}
        for t in registry.tools.values()
    ]
    frozen = memory.get_current_workspace(conversation_id=parent_conv_id) or {}
    workspace = frozen.get("workspace", host_loop.workspace)
    repos = frozen.get("repos", host_loop.repos)
    output_dir = frozen.get("output_dir", host_loop.output_dir)
    active_file = frozen.get("active_file", host_loop.active_file)
    system_msg = build_subagent_system_message(workspace, repos, output_dir, tools_summary, active_file)
    memory.add_message("system", system_msg, conversation_id=child_conv_id)

    # Write the user message (the subtask description).
    memory.add_message("user", desc, conversation_id=child_conv_id)

    # Construct the child loop.
    child = AgentLoop(
        provider=host_loop.provider,
        registry=registry,
        memory=memory,
        workspace=workspace,
        repos=repos,
        output_dir=output_dir,
        max_steps=host_loop.max_steps,
        active_file=active_file,
        provider_id=host_loop.provider_id,
        conversation_id=child_conv_id,
        is_subagent=True,
        parent_conv_id=parent_conv_id,
    )
    return child


async def _run_one(child_loop) -> dict:
    """Drive a child AgentLoop to completion and return its result item."""
    final_text = ""
    try:
        async for event in child_loop._run_loop():
            if event["type"] == "text":
                final_text += event["content"]
            elif event["type"] == "done":
                break
    except Exception as exc:
        return {
            "ok": False,
            "answer": f"(child agent crashed: {exc})",
            "conversation_id": child_loop.conversation_id,
        }

    result_text = final_text.strip() or "(no final answer)"
    return {
        "ok": True,
        "answer": result_text,
        "conversation_id": child_loop.conversation_id,
    }


def register_subagent_tools(registry):
    """Register create_subagent tool on the given registry.

    The handler reads registry._host_loop for gate checks and orchestration.
    Must be called AFTER registry.set_host_loop() for the current AgentLoop.
    """
    async def handler(tasks):
        host = registry._host_loop
        if host is None:
            return {"ok": False, "reason": "no_host_loop"}

        # Gates (2) and (3)
        blocked = _check_gates(host, host.memory, host.conversation_id)
        if blocked:
            return blocked

        parent_conv_id = host.conversation_id

        # Validate tasks
        if not isinstance(tasks, list) or len(tasks) == 0:
            return {"ok": False, "reason": "invalid_tasks"}

        # Build all child loops
        builds = []
        for t in tasks:
            desc = t.get("description", "") if isinstance(t, dict) else str(t)
            child = _build_subagent(desc, parent_conv_id, host)
            builds.append(child)

        # Run all in parallel
        results = await asyncio.gather(
            *[_run_one(b) for b in builds],
            return_exceptions=True,
        )

        # Normalize exceptions into error items
        subagents = []
        for i, r in enumerate(results):
            if isinstance(r, Exception):
                subagents.append({
                    "index": i,
                    "ok": False,
                    "error": str(r),
                    "conversation_id": builds[i].conversation_id if i < len(builds) else "",
                })
            else:
                r["index"] = i
                subagents.append(r)

        return {"ok": True, "subagents": subagents}

    registry.register(
        name="create_subagent",
        description=(
            "Spawn one or more sub-agents to run delegated subtasks in parallel. "
            "Each sub-agent inherits the current conversation history (tool results "
            "redacted) and runs its own independent tool loop to completion. Returns "
            "each sub-agent's final answer. CANNOT be called from within a sub-agent."
        ),
        parameters={
            "type": "object",
            "properties": {
                "tasks": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "type": "object",
                        "properties": {
                            "description": {
                                "type": "string",
                                "description": "The delegated subtask description.",
                            },
                        },
                        "required": ["description"],
                    },
                },
            },
            "required": ["tasks"],
        },
        handler=handler,
    )

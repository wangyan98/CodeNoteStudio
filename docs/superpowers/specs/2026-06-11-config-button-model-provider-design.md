# Config Button & Model Provider Dialog

**Date:** 2026-06-11  
**Status:** approved

## Overview

Add a gear button at the left side of the bottom status bar that opens a `ConfigDialog` for managing the Agent service and its Model Provider settings.

## UI

### Config Button

A gear icon button positioned at the left edge of the existing `ServerStatus` status bar, using the same `.server-btn` style. Added to `ServerStatus.tsx`.

### ConfigDialog

A floating overlay dialog modeled after `AgentDialog`:
- Has a header bar with title ("Agent Configuration"), minimize/close buttons
- Content divided into sections:
  - **Agent Service**: fields for Python path, agent script path, auto-start toggle
  - **Model Providers**: list of configured providers with name, model, endpoint, enabled toggle
  - **Save** button at the bottom
- Reads config via IPC on open, writes via IPC on save

## Data

Config schema stored at `~/.code-note-studio/agent-config.json`:

```json
{
  "pythonPath": "python3",
  "agentScriptPath": "",
  "autoStart": true,
  "providers": [
    {
      "id": "openai",
      "name": "OpenAI",
      "model": "gpt-4o",
      "endpoint": "https://api.openai.com/v1",
      "apiKey": "",
      "enabled": true
    }
  ]
}
```

## Files

| File | Change |
|------|--------|
| `src/renderer/src/components/ConfigDialog.tsx` | New — config dialog component |
| `src/renderer/src/components/ConfigDialog.css` | New — dialog styles |
| `src/renderer/src/components/ServerStatus.tsx` | Add gear button on the left |
| `src/renderer/src/components/ServerStatus.css` | Minor — flex alignment |
| `src/main/services/agent-config.ts` | New — read/write agent-config.json |
| `src/main/ipc-handlers.ts` | Add `get-agent-config` / `save-agent-config` handlers |
| `src/preload/index.ts` | Expose new `electronAPI` methods |
| `src/renderer/src/types/electron.d.ts` | Add type declarations |

## IPC

- `get-agent-config` → returns `AgentConfig` from disk (or defaults)
- `save-agent-config` → writes `AgentConfig` to disk, returns `{ ok: boolean }`

## Data Flow

```
[Gear Button] → setConfigVisible(true)
                     ↓
              ConfigDialog mounts
                     ↓
          IPC: get-agent-config → main reads agent-config.json
                     ↓
              User edits fields
                     ↓
          [Save] → IPC: save-agent-config → main writes agent-config.json
```

## Error Handling

- Missing config file → return sensible defaults
- Write failure → return `{ ok: false, error: string }`, dialog shows error toast

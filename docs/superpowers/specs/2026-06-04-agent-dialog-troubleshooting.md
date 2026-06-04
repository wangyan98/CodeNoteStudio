# Agent Dialog — Bug Fixes & Troubleshooting

## Debugging Timeline

8 bugs encountered during integration. Listed in the order discovered and fixed.

---

### 1. `app.getAppPath()` resolves to wrong directory in electron-vite

**Symptom:** `Agent server failed to start`

**Root cause:** `agent-manager.ts` used `app.getAppPath()` to resolve `server.py`, but in electron-vite dev mode this doesn't point to the project root. Existing code in the project (e.g., `live-server.ts`) uses `__dirname`.

**Fix (8fff8fb, c5ea29e):** Changed to `path.join(__dirname, '..', '..', '..', 'agent', 'server.py')`. Extra `..` needed because Rollup places compiled chunks in `out/main/chunks/`, not `out/main/`.

---

### 2. Race condition: `agentProcess.kill()` on null

**Symptom:** `TypeError: Cannot read properties of null (reading 'kill')`

**Root cause:** When the Python process exits immediately (e.g., bad script path), the `exit` event handler sets `agentProcess = null` before `waitForHealth()` times out. The timeout path then calls `agentProcess.kill()` on the now-null reference.

**Fix (66b797a):** Guarded `.kill()` with null check, collected stderr for error diagnostics, wrapped `spawn()` in try/catch for ENOENT.

---

### 3. Transparent dialog background

**Symptom:** Dialog lacked solid background color

**Root cause:** CSS used `var(--bg-primary)` etc. without fallback values. If CSS variables aren't loaded (e.g., different theme context), backgrounds become transparent.

**Fix (0febfec):** Added hardcoded fallback colors to all CSS variables:
- Dialog bg: `#1e1e1e`, header: `#252526`, text: `#d4d4d4`, border: `#3c3c3c`

---

### 4. Silent failure when agent server doesn't start

**Symptom:** Clicking "Send" does nothing, no error shown

**Root cause:** `useEffect` had no `.catch()` on `getAgentPort()` promise. `handleSend` silently returned when `port` was null. No feedback to user.

**Fix (0febfec):** Added `.catch()` with error message in dialog, `connecting` state with placeholder text, and guard in `handleSend` that shows "Agent is not connected yet" when port is null.

---

### 5. CORS preflight rejected

**Symptom:** `Error: Failed to fetch` when sending a message

**Root cause:** Electron renderer sends POST with `Content-Type: application/json`, which triggers a CORS preflight (OPTIONS). FastAPI server had no CORS middleware, so the browser blocked the request.

**Fix (8e941f0):** Added `CORSMiddleware` to FastAPI app, allowing all origins on localhost.

---

### 6. CSP blocks cross-origin fetch to agent server

**Symptom:** `Error fetching http://127.0.0.1:XXXXX/chat: Failed to fetch` (even with CORS middleware)

**Root cause:** `src/renderer/index.html` has a CSP `<meta>` tag:
```html
connect-src 'self' ws:;
```
`'self'` only covers the renderer's port (e.g., `localhost:5173`). Requests to `127.0.0.1:<random-port>` are blocked.

**Fix (c106bcf):** Added `http://127.0.0.1:*` to `connect-src`.

---

### 7. SSE stream breaks on LLM API errors

**Symptom:** Works briefly, then `network error`

**Root cause:** If the LLM provider raises an exception (timeout, API error, etc.), the exception propagates out of `agent_loop.py`'s async generator, terminates the SSE stream, and the browser shows "network error". No error info is sent to the client.

**Fix (b722c0f):** Wrapped the agent loop's `run()` method in two layers of try/except:
- Inner: catches provider `chat_stream` errors → yields `{"type": "error", ...}` event
- Outer: catches all unexpected errors → yields error event
- Added `case 'error'` in AgentDialog.tsx SSE parser to display these errors in red

---

### 8. File ops return unbounded results

**Symptom:** Potential token overflow and excessive I/O when analyzing large repos

**Root cause:** `list_files`, `search_in_files`, and `read_file` had no default limits. Large codebases could return thousands of results.

**Fix (89faf32):** Added default limits:

| Tool | Parameter | Default |
|------|-----------|---------|
| `read_file` | `max_lines` | 500 |
| `list_files` | `max_results` | 200 |
| `search_in_files` | `max_results` | 50 |

When truncated, response includes `{"truncated": true, "hint": "..."}`.

---

## Key Takeaways

1. **electron-vite path resolution:** Always use `__dirname` relative paths, and account for chunk placement in `out/main/chunks/`.
2. **CSP + CORS are separate layers:** CSP `<meta>` blocks before CORS headers are even sent. Both must be configured.
3. **Async generators fail silently:** Uncaught exceptions in `AsyncIterator` terminate the stream without error info. Always wrap in try/except.
4. **React state + async I/O:** Always handle promise rejection in effects that fetch data. Silent failures make debugging impossible.

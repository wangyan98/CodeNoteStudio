# Custom Layer with Key-Value Params Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Custom" preset layer to the Network Editor palette that creates `kind: "layer"` nodes with a dynamic key-value parameter editor instead of fixed typed fields.

**Architecture:** Three file changes — `layer-catalog.json` gets a new `"Custom"` entry with empty params list, `NetworkPalette.tsx` adds the `"custom"` category so it appears in the drag palette, and `NetworkPanel.tsx` detects layers with no preset params and renders a free-form key-value editor instead of "This layer has no parameters".

**Tech Stack:** TypeScript, React, JSON catalog

---

### Task 1: Add "Custom" entry to layer-catalog.json

**Files:**
- Modify: `layer-catalog.json`

- [ ] **Step 1: Add "Custom" entry at the end of the layers object**

Add after the `"MultiheadAttention"` entry (before the closing `}` of `"layers"`):

```json
"Custom": {
  "category": "custom",
  "color": "#9e9e9e",
  "params": []
}
```

The `layer-catalog.json` file is at the project root. The last entry is `"MultiheadAttention"` around line 526. The new entry goes after the closing `}` of `"MultiheadAttention"`, separated by a comma.

- [ ] **Step 2: Verify the JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('layer-catalog.json','utf8')); console.log('valid')"`
Expected: `valid`

- [ ] **Step 3: Verify list_preset_layers.py picks up the new entry**

Run: `python3 skills/network-graph/scripts/list_preset_layers.py`
Expected: JSON output with `"ok": true`, containing `"Custom"` in the `layers` object with `"category": "custom"` and empty `"params": []`.

- [ ] **Step 4: Commit**

```bash
git add layer-catalog.json
git commit -m "feat: add Custom preset layer with empty params to catalog"
```

---

### Task 2: Add "custom" category to NetworkPalette

**Files:**
- Modify: `src/renderer/src/components/editors/NetworkPalette.tsx`

- [ ] **Step 1: Add "custom" to CATEGORY_ORDER**

Append `'custom'` to the `CATEGORY_ORDER` array on line 8:

```tsx
const CATEGORY_ORDER = ['convolution', 'normalization', 'activation', 'pooling', 'linear', 'dropout', 'recurrent', 'embedding', 'attention', 'custom']
```

- [ ] **Step 2: Add "custom" label to CATEGORY_LABELS**

Add `custom: 'Custom'` to the `CATEGORY_LABELS` object on line 19:

```tsx
const CATEGORY_LABELS: Record<string, string> = {
  convolution: 'Conv',
  normalization: 'Norm',
  activation: 'Act',
  pooling: 'Pool',
  linear: 'Linear',
  dropout: 'Drop',
  recurrent: 'RNN',
  embedding: 'Emb',
  attention: 'Attn',
  custom: 'Custom'
}
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit src/renderer/src/components/editors/NetworkPalette.tsx 2>&1 | head -5`
Expected: no errors (may show module resolution warnings from other files — that's fine).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/editors/NetworkPalette.tsx
git commit -m "feat: add custom category to NetworkPalette for Custom layer pill"
```

---

### Task 3: Add key-value parameter editor to NetworkPanel

**Files:**
- Modify: `src/renderer/src/components/editors/NetworkPanel.tsx`

This is the main work. When `node.kind === 'layer'` and `params.length === 0` (the catalog returned no preset params — either because the layerType is "Custom" or is unknown), render a dynamic key-value editor instead of the static "This layer has no parameters" message.

- [ ] **Step 1: Add key-value editor JSX**

Replace the `params.length === 0` branch (currently lines 89-93) — the block that renders `<span className="network-panel-no-params">This layer has no parameters</span>` — with the key-value editor.

The old code at lines 89-93 is:

```tsx
{node.kind === 'layer' && params.length === 0 && (
  <div className="network-panel-params">
    <div className="network-panel-section-title">Parameters</div>
    <span className="network-panel-no-params">This layer has no parameters</span>
  </div>
)}
```

Replace with:

```tsx
{node.kind === 'layer' && params.length === 0 && (
  <div className="network-panel-params">
    <div className="network-panel-section-title">Parameters</div>
    <div className="network-panel-kv-list">
      {Object.entries(node.params ?? {}).map(([key, value]) => (
        <div key={key} className="network-panel-kv-row">
          <input
            className="network-panel-input network-panel-kv-key"
            type="text"
            value={key}
            onChange={(e) => {
              const newKey = e.target.value
              const currentParams = { ...node.params }
              const oldValue = currentParams[key]
              delete currentParams[key]
              currentParams[newKey] = oldValue
              onUpdateNode(node.id, 'params', currentParams)
            }}
            placeholder="key"
          />
          <input
            className="network-panel-input network-panel-kv-value"
            type="text"
            value={String(value ?? '')}
            onChange={(e) => {
              onUpdateNode(node.id, 'params', { ...node.params, [key]: e.target.value })
            }}
            placeholder="value"
          />
          <button
            className="network-panel-kv-remove"
            onClick={() => {
              const next = { ...node.params }
              delete next[key]
              onUpdateNode(node.id, 'params', next)
            }}
            title="Remove parameter"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
    <button
      className="network-panel-kv-add"
      onClick={() => {
        const next = { ...node.params }
        const newKey = `param${Object.keys(next).length + 1}`
        next[newKey] = ''
        onUpdateNode(node.id, 'params', next)
      }}
    >
      + Add param
    </button>
  </div>
)}
```

- [ ] **Step 2: Add CSS for key-value editor rows**

Append to the end of `src/renderer/src/components/editors/NetworkPanel.css`:

```css
.network-panel-kv-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 6px;
}

.network-panel-kv-row {
  display: flex;
  gap: 4px;
  align-items: center;
}

.network-panel-kv-key {
  width: 80px;
  flex-shrink: 0;
}

.network-panel-kv-value {
  flex: 1;
}

.network-panel-kv-remove {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 10px;
  padding: 0 2px;
  line-height: 1;
}

.network-panel-kv-remove:hover {
  color: #ea4335;
}

.network-panel-kv-add {
  background: none;
  border: 1px dashed #555;
  color: #888;
  cursor: pointer;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 3px;
  width: 100%;
}

.network-panel-kv-add:hover {
  border-color: #888;
  color: #ccc;
}
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit src/renderer/src/components/editors/NetworkPanel.tsx 2>&1 | head -10`
Expected: no type errors related to NetworkPanel.

- [ ] **Step 4: Run existing tests to check for regressions**

Run: `npx vitest run tests/renderer/networkReducer.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/editors/NetworkPanel.tsx src/renderer/src/components/editors/NetworkPanel.css
git commit -m "feat: add key-value param editor for layers with no preset params"
```

---

### Task 4: Integration test — add "Custom" layer via Agent tool

**Files:**
- Modify: `skills/network-graph/tests/test_add_layer.py`

- [ ] **Step 1: Add test for adding a Custom layer with key-value params**

Append to the end of the file (before any final newline):

```python
def test_adds_custom_layer_with_kv_params():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.net.json")
        _make_doc(path)
        code, out = run_script(path, "Custom", "--name", "my_custom_op", "--params", '{"activation": "silu", "groups": 16}')
        assert code == 0
        result = json.loads(out)
        assert result["ok"] is True
        loaded = load_network(path)
        layer = loaded.nodes[1]
        assert layer.kind == "layer"
        assert layer.layerType == "Custom"
        assert layer.label == "my_custom_op"
        assert layer.params == {"activation": "silu", "groups": 16}
```

- [ ] **Step 2: Run the new test**

Run: `python3 -m pytest skills/network-graph/tests/test_add_layer.py::test_adds_custom_layer_with_kv_params -v`
Expected: PASS

- [ ] **Step 3: Run all add_layer tests**

Run: `python3 -m pytest skills/network-graph/tests/test_add_layer.py -v`
Expected: all 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add skills/network-graph/tests/test_add_layer.py
git commit -m "test: add integration test for Custom layer with key-value params"
```

---

### Task 5: End-to-end verification

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run 2>&1 | tail -5`
Expected: all tests pass, no failures.

- [ ] **Step 2: Manual smoke test checklist**

Launch the app (`npm run dev`) and verify:

1. Open or create a `.net.json` file
2. In the palette bar at the top, a "Custom" pill appears in the "Custom" section (rightmost)
3. Drag "Custom" from the palette into the canvas → a new layer node appears with `layerType: "Custom"` and `kind: "layer"`
4. Select the node → NetworkPanel shows "Parameters" section with "+ Add param" button
5. Click "+ Add param" → a row with key input, value input, and ✕ button appears
6. Type in a key and value → node.params updates
7. Click ✕ → the param row is removed
8. Rename the key → param is moved to new key name
9. Save the file, reopen it → custom params persist
10. Drag a preset layer (e.g. Conv2d) → its fixed-typed param panel still works as before
11. Run `python3 skills/network-graph/scripts/list_preset_layers.py` → "Custom" appears in the output

- [ ] **Step 3: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final verification of custom layer feature"
```

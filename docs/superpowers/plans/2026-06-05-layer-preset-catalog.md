# Layer Preset Catalog — Single JSON Source

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a single `layer-catalog.json` as the source of truth for preset layer definitions, used by both the Python agent (via a new `list_preset_layers` tool) and the TypeScript UI (replacing hardcoded `BUILTIN_LAYERS`).

**Architecture:** Extract all 25+ preset layers from `layer-catalog.ts` into `layer-catalog.json` at project root. Python reads it via a new script; TypeScript imports it via `resolveJsonModule`. Both sides receive identical data.

**Tech Stack:** Python 3 (json), TypeScript (resolveJsonModule), electron-vite bundler

---

### Task 1: Create layer-catalog.json + enable JSON imports in TS

**Files:**
- Create: `layer-catalog.json`
- Modify: `tsconfig.node.json`

- [ ] **Step 1: Create layer-catalog.json at project root**

Extract all layers from `src/main/schemas/layer-catalog.ts` `BUILTIN_LAYERS` into the JSON file. The TS object `Record<string, LayerDef>` maps to:

```json
{
  "layers": {
    "Conv1d": {
      "category": "convolution",
      "color": "#4a90d9",
      "params": [
        { "name": "in_channels", "type": "number", "required": true, "default": null },
        { "name": "out_channels", "type": "number", "required": true, "default": null },
        { "name": "kernel_size", "type": "number", "required": false, "default": 3 },
        { "name": "stride", "type": "number", "required": false, "default": 1 },
        { "name": "padding", "type": "number", "required": false, "default": 0 },
        { "name": "dilation", "type": "number", "required": false, "default": 1 },
        { "name": "bias", "type": "boolean", "required": false, "default": true }
      ]
    },
    "Conv2d": {
      "category": "convolution",
      "color": "#4a90d9",
      "params": [
        { "name": "in_channels", "type": "number", "required": true, "default": null },
        { "name": "out_channels", "type": "number", "required": true, "default": null },
        { "name": "kernel_size", "type": "number", "required": false, "default": 3 },
        { "name": "stride", "type": "number", "required": false, "default": 1 },
        { "name": "padding", "type": "number", "required": false, "default": 0 },
        { "name": "dilation", "type": "number", "required": false, "default": 1 },
        { "name": "groups", "type": "number", "required": false, "default": 1 },
        { "name": "bias", "type": "boolean", "required": false, "default": true }
      ]
    },
    "Conv3d": {
      "category": "convolution",
      "color": "#4a90d9",
      "params": [
        { "name": "in_channels", "type": "number", "required": true, "default": null },
        { "name": "out_channels", "type": "number", "required": true, "default": null },
        { "name": "kernel_size", "type": "number", "required": false, "default": 3 },
        { "name": "stride", "type": "number", "required": false, "default": 1 },
        { "name": "padding", "type": "number", "required": false, "default": 0 },
        { "name": "bias", "type": "boolean", "required": false, "default": true }
      ]
    },
    "ConvTranspose2d": {
      "category": "convolution",
      "color": "#4a90d9",
      "params": [
        { "name": "in_channels", "type": "number", "required": true, "default": null },
        { "name": "out_channels", "type": "number", "required": true, "default": null },
        { "name": "kernel_size", "type": "number", "required": false, "default": 3 },
        { "name": "stride", "type": "number", "required": false, "default": 1 },
        { "name": "padding", "type": "number", "required": false, "default": 0 },
        { "name": "bias", "type": "boolean", "required": false, "default": true }
      ]
    },
    "BatchNorm1d": {
      "category": "normalization",
      "color": "#ea4335",
      "params": [
        { "name": "num_features", "type": "number", "required": true, "default": null },
        { "name": "eps", "type": "number", "required": false, "default": 1e-5 },
        { "name": "momentum", "type": "number", "required": false, "default": 0.1 }
      ]
    },
    "BatchNorm2d": {
      "category": "normalization",
      "color": "#ea4335",
      "params": [
        { "name": "num_features", "type": "number", "required": true, "default": null },
        { "name": "eps", "type": "number", "required": false, "default": 1e-5 },
        { "name": "momentum", "type": "number", "required": false, "default": 0.1 }
      ]
    },
    "LayerNorm": {
      "category": "normalization",
      "color": "#ea4335",
      "params": [
        { "name": "normalized_shape", "type": "string", "required": true, "default": null },
        { "name": "eps", "type": "number", "required": false, "default": 1e-5 }
      ]
    },
    "InstanceNorm2d": {
      "category": "normalization",
      "color": "#ea4335",
      "params": [
        { "name": "num_features", "type": "number", "required": true, "default": null },
        { "name": "eps", "type": "number", "required": false, "default": 1e-5 }
      ]
    },
    "ReLU": {
      "category": "activation",
      "color": "#34a853",
      "params": [
        { "name": "inplace", "type": "boolean", "required": false, "default": false }
      ]
    },
    "LeakyReLU": {
      "category": "activation",
      "color": "#34a853",
      "params": [
        { "name": "negative_slope", "type": "number", "required": false, "default": 0.01 },
        { "name": "inplace", "type": "boolean", "required": false, "default": false }
      ]
    },
    "GELU": {
      "category": "activation",
      "color": "#34a853",
      "params": []
    },
    "Sigmoid": {
      "category": "activation",
      "color": "#34a853",
      "params": []
    },
    "Tanh": {
      "category": "activation",
      "color": "#34a853",
      "params": []
    },
    "Softmax": {
      "category": "activation",
      "color": "#34a853",
      "params": [
        { "name": "dim", "type": "number", "required": false, "default": -1 }
      ]
    },
    "MaxPool2d": {
      "category": "pooling",
      "color": "#ff9800",
      "params": [
        { "name": "kernel_size", "type": "number", "required": false, "default": 2 },
        { "name": "stride", "type": "number", "required": false, "default": 2 },
        { "name": "padding", "type": "number", "required": false, "default": 0 }
      ]
    },
    "AvgPool2d": {
      "category": "pooling",
      "color": "#ff9800",
      "params": [
        { "name": "kernel_size", "type": "number", "required": false, "default": 2 },
        { "name": "stride", "type": "number", "required": false, "default": 2 },
        { "name": "padding", "type": "number", "required": false, "default": 0 }
      ]
    },
    "AdaptiveAvgPool2d": {
      "category": "pooling",
      "color": "#ff9800",
      "params": [
        { "name": "output_size", "type": "string", "required": false, "default": "1" }
      ]
    },
    "Linear": {
      "category": "linear",
      "color": "#4a90d9",
      "params": [
        { "name": "in_features", "type": "number", "required": true, "default": null },
        { "name": "out_features", "type": "number", "required": true, "default": null },
        { "name": "bias", "type": "boolean", "required": false, "default": true }
      ]
    },
    "Identity": {
      "category": "linear",
      "color": "#4a90d9",
      "params": []
    },
    "Dropout": {
      "category": "dropout",
      "color": "#9c27b0",
      "params": [
        { "name": "p", "type": "number", "required": false, "default": 0.5 },
        { "name": "inplace", "type": "boolean", "required": false, "default": false }
      ]
    },
    "Dropout2d": {
      "category": "dropout",
      "color": "#9c27b0",
      "params": [
        { "name": "p", "type": "number", "required": false, "default": 0.5 },
        { "name": "inplace", "type": "boolean", "required": false, "default": false }
      ]
    },
    "LSTM": {
      "category": "recurrent",
      "color": "#795548",
      "params": [
        { "name": "input_size", "type": "number", "required": true, "default": null },
        { "name": "hidden_size", "type": "number", "required": true, "default": null },
        { "name": "num_layers", "type": "number", "required": false, "default": 1 },
        { "name": "bias", "type": "boolean", "required": false, "default": true },
        { "name": "dropout", "type": "number", "required": false, "default": 0 }
      ]
    },
    "GRU": {
      "category": "recurrent",
      "color": "#795548",
      "params": [
        { "name": "input_size", "type": "number", "required": true, "default": null },
        { "name": "hidden_size", "type": "number", "required": true, "default": null },
        { "name": "num_layers", "type": "number", "required": false, "default": 1 },
        { "name": "bias", "type": "boolean", "required": false, "default": true },
        { "name": "dropout", "type": "number", "required": false, "default": 0 }
      ]
    },
    "Embedding": {
      "category": "embedding",
      "color": "#009688",
      "params": [
        { "name": "num_embeddings", "type": "number", "required": true, "default": null },
        { "name": "embedding_dim", "type": "number", "required": true, "default": null }
      ]
    },
    "MultiheadAttention": {
      "category": "attention",
      "color": "#e91e63",
      "params": [
        { "name": "embed_dim", "type": "number", "required": true, "default": null },
        { "name": "num_heads", "type": "number", "required": true, "default": null },
        { "name": "dropout", "type": "number", "required": false, "default": 0 },
        { "name": "bias", "type": "boolean", "required": false, "default": true }
      ]
    }
  }
}
```

Write this to `layer-catalog.json` at the project root.

- [ ] **Step 2: Verify JSON is valid**

```bash
python3 -c "import json; data = json.load(open('layer-catalog.json')); assert 'layers' in data; print(f'OK: {len(data[\"layers\"])} layers')"
```

Expected: `OK: 26 layers`

- [ ] **Step 3: Add resolveJsonModule to tsconfig.node.json**

In `tsconfig.node.json`, add `"resolveJsonModule": true` to `compilerOptions`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./out",
    "declaration": true,
    "composite": true,
    "types": ["electron-vite/node"]
  },
  "include": ["src/main/**/*.ts", "src/preload/**/*.ts", "electron.vite.config.ts"]
}
```

- [ ] **Step 4: Commit**

```bash
git add layer-catalog.json tsconfig.node.json
git commit -m "$(cat <<'EOF'
feat: add layer-catalog.json as single source of truth for preset layers

Extract all 26 preset layer definitions from layer-catalog.ts into a
JSON file at project root. Enable resolveJsonModule in tsconfig so
TypeScript can import JSON directly.
EOF
)"
```

---

### Task 2: Create list_preset_layers.py script

**Files:**
- Create: `skills/network-graph/scripts/list_preset_layers.py`
- Create: `skills/network-graph/tests/test_list_preset_layers.py`

**Depends on:** Task 1 (needs layer-catalog.json to exist)

- [ ] **Step 1: Create the Python script**

Write `skills/network-graph/scripts/list_preset_layers.py`:

```python
#!/usr/bin/env python3
"""List all preset layer types and their parameter definitions from layer-catalog.json."""
import json, os, sys
from pathlib import Path


def find_catalog_path():
    """Find layer-catalog.json starting from project root (CWD)."""
    cwd = Path.cwd()
    candidate = cwd / "layer-catalog.json"
    if candidate.exists():
        return str(candidate)
    print(json.dumps({"ok": False, "error": "layer-catalog.json not found in project root"}))
    sys.exit(1)


def main():
    path = find_catalog_path()
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    layers = data.get("layers", {})
    result = {
        "ok": True,
        "layers": {
            name: {
                "category": defn["category"],
                "params": [
                    {
                        "name": p["name"],
                        "type": p["type"],
                        "required": p.get("required", False),
                        "default": p.get("default"),
                    }
                    for p in defn["params"]
                ]
            }
            for name, defn in layers.items()
        },
        "total": len(layers)
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run script to verify it works**

```bash
python3 skills/network-graph/scripts/list_preset_layers.py | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['ok']; assert d['total']==26; assert 'Conv2d' in d['layers']; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Create test file**

Write `skills/network-graph/tests/test_list_preset_layers.py`:

```python
import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def run_script():
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "list_preset_layers.py")],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip()


def test_returns_all_layers():
    code, out = run_script()
    assert code == 0
    result = json.loads(out)
    assert result["ok"] is True
    assert result["total"] == 26
    layers = result["layers"]
    # Spot-check a few layer types
    assert "Conv2d" in layers
    assert "BatchNorm2d" in layers
    assert "ReLU" in layers
    assert "LSTM" in layers
    assert "MultiheadAttention" in layers


def test_layer_has_params():
    code, out = run_script()
    result = json.loads(out)
    conv2d = result["layers"]["Conv2d"]
    assert conv2d["category"] == "convolution"
    param_names = [p["name"] for p in conv2d["params"]]
    assert "in_channels" in param_names
    assert "out_channels" in param_names
    assert "kernel_size" in param_names


def test_param_structure():
    code, out = run_script()
    result = json.loads(out)
    # Check a param with required=true and no default
    in_ch = [p for p in result["layers"]["Conv2d"]["params"] if p["name"] == "in_channels"][0]
    assert in_ch["type"] == "number"
    assert in_ch["required"] is True
    assert in_ch["default"] is None

    # Check a param with default
    ks = [p for p in result["layers"]["Conv2d"]["params"] if p["name"] == "kernel_size"][0]
    assert ks["default"] == 3


def test_activation_has_no_params():
    code, out = run_script()
    result = json.loads(out)
    assert result["layers"]["GELU"]["params"] == []
    assert result["layers"]["Sigmoid"]["params"] == []
```

- [ ] **Step 4: Run tests**

```bash
python3 -m pytest skills/network-graph/tests/test_list_preset_layers.py -v
```

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add skills/network-graph/scripts/list_preset_layers.py skills/network-graph/tests/test_list_preset_layers.py
git commit -m "$(cat <<'EOF'
feat: add list_preset_layers.py script with tests

Reads layer-catalog.json and outputs all preset layer types with their
parameter definitions. Agent will use this via a registered tool.
EOF
)"
```

---

### Task 3: Update layer-catalog.ts to import from JSON

**Files:**
- Modify: `src/main/schemas/layer-catalog.ts`

**Depends on:** Task 1 (needs layer-catalog.json + resolveJsonModule)

- [ ] **Step 1: Replace BUILTIN_LAYERS with JSON import**

In `src/main/schemas/layer-catalog.ts`:

1. Add import at top (after existing imports/interface declarations):

```typescript
import layerCatalogJson from '../../../layer-catalog.json'
```

2. Replace the entire `BUILTIN_LAYERS` constant (lines 19-225, which contain all hardcoded layer definitions) with:

```typescript
export const BUILTIN_LAYERS: Record<string, LayerDef> =
  layerCatalogJson.layers as Record<string, LayerDef>
```

Keep all other code unchanged: `LayerParamDef`, `LayerDef`, `LayerCatalogOverrides` interfaces, `deepMerge()`, `resolveLayerCatalog()`, `getLayerDef()` functions.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --project tsconfig.node.json --noEmit 2>&1 | head -20
```

Expected: no errors related to layer-catalog.ts

- [ ] **Step 3: Verify resolveLayerCatalog still works**

```bash
python3 -c "
import json
# Compare JSON keys with what BUILTIN_LAYERS had (spot check)
data = json.load(open('layer-catalog.json'))
names = sorted(data['layers'].keys())
expected = ['AdaptiveAvgPool2d', 'AvgPool2d', 'BatchNorm1d', 'BatchNorm2d', 'Conv1d', 'Conv2d', 'Conv3d', 'ConvTranspose2d', 'Dropout', 'Dropout2d', 'Embedding', 'GELU', 'GRU', 'Identity', 'InstanceNorm2d', 'LSTM', 'LayerNorm', 'LeakyReLU', 'Linear', 'MaxPool2d', 'MultiheadAttention', 'ReLU', 'Sigmoid', 'Softmax', 'Tanh']
assert sorted(data['layers'].keys()) == expected, f'Mismatch: {set(names) ^ set(expected)}'
print('OK: all 26 layer names match')
"
```

Expected: `OK: all 26 layer names match`

- [ ] **Step 4: Commit**

```bash
git add src/main/schemas/layer-catalog.ts
git commit -m "$(cat <<'EOF'
refactor: replace hardcoded BUILTIN_LAYERS with JSON import

layer-catalog.ts now imports from layer-catalog.json instead of
maintaining a duplicate hardcoded layer list. Single source of truth.
EOF
)"
```

---

### Task 4: Register list_preset_layers agent tool + update context

**Files:**
- Modify: `agent/tools/network_tools.py`
- Modify: `agent/context.py`

**Depends on:** Task 2 (needs list_preset_layers.py script)

- [ ] **Step 1: Register list_preset_layers tool**

In `agent/tools/network_tools.py`, add a new tool registration inside `register_network_tools()`, after the existing `add_layer` registration:

```python
    registry.register(
        name="list_preset_layers",
        description="List all available preset layer types and their parameter definitions for neural network graphs",
        parameters={
            "type": "object",
            "properties": {},
            "required": [],
        },
        handler=lambda: _run_skill_script("network-graph/scripts/list_preset_layers.py"),
    )
```

- [ ] **Step 2: Update context.py**

In `agent/context.py`, change the Network graphs line from:

```
- **Network graphs**: create_network, add_layer, add_block, add_connection, update_node, delete_node — create .net.json documents for neural network architecture diagrams
```

to:

```
- **Network graphs**: create_network, add_layer, add_block, add_connection, update_node, delete_node, list_preset_layers — create .net.json documents for neural network architecture diagrams. Use list_preset_layers to see available preset layer types and their parameters before adding layers.
```

- [ ] **Step 3: Verify agent tools load without errors**

```bash
python3 -c "
import sys
sys.path.insert(0, '.')
from agent.tools.registry import ToolRegistry
from agent.tools.network_tools import register_network_tools
r = ToolRegistry()
register_network_tools(r)
names = list(r.tools.keys())
assert 'list_preset_layers' in names
assert 'add_layer' in names
print(f'OK: {len(names)} tools registered: {names}')
"
```

Expected: `list_preset_layers` in tool list

- [ ] **Step 4: Run all existing network-graph tests to ensure no regressions**

```bash
python3 -m pytest skills/network-graph/tests/ -v
```

Expected: all tests PASS (including new list_preset_layers tests)

- [ ] **Step 5: Commit**

```bash
git add agent/tools/network_tools.py agent/context.py
git commit -m "$(cat <<'EOF'
feat(agent): register list_preset_layers tool for network graph skill

Agent can now query available preset layer types and their parameter
definitions before building network architecture diagrams. Context
updated to mention the new tool.
EOF
)"
```

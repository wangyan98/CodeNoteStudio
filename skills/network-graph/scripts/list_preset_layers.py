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

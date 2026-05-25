#!/bin/bash
set -e

GRAMMAR_DIR="assets/tree-sitter"
mkdir -p "$GRAMMAR_DIR"

download_grammar() {
  local name="$1"
  local url="$2"
  local output="$GRAMMAR_DIR/${name}.wasm"

  if [ -f "$output" ]; then
    echo "$name already exists, skipping"
    return 0
  fi

  echo "Downloading $name..."
  if curl -L --connect-timeout 10 --max-time 30 "$url" -o "$output" 2>/dev/null; then
    echo "  OK"
  else
    echo "  WARNING: failed to download $name (may need manual setup)"
    rm -f "$output"
  fi
}

# JavaScript
download_grammar "tree-sitter-javascript" \
  "https://github.com/tree-sitter/tree-sitter-javascript/releases/download/v0.23.0/tree-sitter-javascript.wasm"

# TypeScript
download_grammar "tree-sitter-typescript" \
  "https://github.com/tree-sitter/tree-sitter-typescript/releases/download/v0.23.0/tree-sitter-typescript.wasm"

# TSX
download_grammar "tree-sitter-tsx" \
  "https://github.com/tree-sitter/tree-sitter-typescript/releases/download/v0.23.0/tree-sitter-tsx.wasm"

# Python
download_grammar "tree-sitter-python" \
  "https://github.com/tree-sitter/tree-sitter-python/releases/download/v0.23.0/tree-sitter-python.wasm"

# Rust
download_grammar "tree-sitter-rust" \
  "https://github.com/tree-sitter/tree-sitter-rust/releases/download/v0.23.0/tree-sitter-rust.wasm"

# Go
download_grammar "tree-sitter-go" \
  "https://github.com/tree-sitter/tree-sitter-go/releases/download/v0.23.0/tree-sitter-go.wasm"

# C
download_grammar "tree-sitter-c" \
  "https://github.com/tree-sitter/tree-sitter-c/releases/download/v0.23.0/tree-sitter-c.wasm"

# C++
download_grammar "tree-sitter-cpp" \
  "https://github.com/tree-sitter/tree-sitter-cpp/releases/download/v0.23.0/tree-sitter-cpp.wasm"

echo ""
echo "Grammar files in $GRAMMAR_DIR:"
ls -la "$GRAMMAR_DIR" 2>/dev/null || echo "  (empty)"

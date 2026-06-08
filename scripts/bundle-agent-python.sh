#!/bin/bash
set -euo pipefail

# Install agent pip dependencies into agent/.deps/ for bundling.
# Tries pip install first; falls back to copying from site-packages if offline.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENT_DIR="$PROJECT_DIR/agent"
DEPS_DIR="$AGENT_DIR/.deps"

echo "==> Installing agent dependencies to $DEPS_DIR"

rm -rf "$DEPS_DIR"
mkdir -p "$DEPS_DIR"

# Try pip first
if python3 -m pip install --target "$DEPS_DIR" --no-cache-dir -r "$AGENT_DIR/requirements.txt" 2>/dev/null; then
  echo "==> Installed via pip"
else
  echo "==> pip unavailable (offline?), copying from local site-packages"
  SITE_PKGS=$(python3 -c 'import site; print(site.getsitepackages()[0])')
  echo "==> Source: $SITE_PKGS"

  # Core packages from requirements.txt
  for pkg_dir in fastapi uvicorn httpx starlette pydantic pydantic_core anyio sniffio; do
    if [ -d "$SITE_PKGS/$pkg_dir" ]; then
      cp -R "$SITE_PKGS/$pkg_dir" "$DEPS_DIR/"
      echo "  copied $pkg_dir"
    fi
  done

  # Copy .dist-info for all transitive deps
  for pkg in fastapi uvicorn httpx starlette pydantic pydantic_core anyio sniffio idna h11 certifi httpcore; do
    for dist in "$SITE_PKGS/$pkg"*.dist-info; do
      if [ -d "$dist" ]; then
        cp -R "$dist" "$DEPS_DIR/"
        echo "  copied $(basename "$dist")"
      fi
    done
  done
fi

echo "==> Cleaning __pycache__"
find "$AGENT_DIR" -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
find "$AGENT_DIR" -type f -name '*.pyc' -delete 2>/dev/null || true
find "$DEPS_DIR" -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

echo "==> Done. Dependencies in $DEPS_DIR:"
ls "$DEPS_DIR" | head -20

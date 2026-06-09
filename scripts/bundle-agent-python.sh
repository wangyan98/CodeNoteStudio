#!/bin/bash
set -euo pipefail

# Install agent pip dependencies into agent/.deps/ for bundling.
# Also downloads a relocatable Python runtime (python-build-standalone) so
# end users don't need a system Python installation.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENT_DIR="$PROJECT_DIR/agent"
DEPS_DIR="$AGENT_DIR/.deps"
PYTHON_DIR="$AGENT_DIR/.python"

PYTHON_RELEASE="20260602"
PYTHON_VERSION="3.14.5"
DOWNLOAD_BASE="${PYTHON_BUILD_STANDALONE_URL:-https://github.com/indygreg/python-build-standalone/releases/download}"

# ---- detect arch ----
ARCH=$(uname -m)
case "$ARCH" in
  arm64)  PBS_ARCH="aarch64" ;;
  x86_64) PBS_ARCH="x86_64" ;;
  *)
    echo "==> Unknown arch: $ARCH, falling back to system python3"
    PBS_ARCH=""
    ;;
esac

# ---- download & extract python runtime ----
PYTHON_BIN=""
if [ -n "$PBS_ARCH" ]; then
  PYTHON_TARBALL="cpython-${PYTHON_VERSION}+${PYTHON_RELEASE}-${PBS_ARCH}-apple-darwin-install_only.tar.gz"
  PYTHON_URL="${DOWNLOAD_BASE}/${PYTHON_RELEASE}/${PYTHON_TARBALL}"

  echo "==> Downloading Python runtime ($PBS_ARCH)..."
  TMP_DIR="$(mktemp -d)"

  if curl -fsSL --connect-timeout 30 --retry 3 -o "$TMP_DIR/$PYTHON_TARBALL" "$PYTHON_URL"; then
    rm -rf "$PYTHON_DIR"
    mkdir -p "$PYTHON_DIR"
    tar xzf "$TMP_DIR/$PYTHON_TARBALL" -C "$PYTHON_DIR" --strip-components=1
    rm -rf "$TMP_DIR"
    PYTHON_BIN="$PYTHON_DIR/bin/python3"
    echo "==> Python runtime installed at $PYTHON_BIN"

    # python-build-standalone install_only tarballs are missing some stdlib
    # modules. Copy any missing .py files from the system Python's stdlib.
    SYSTEM_STDLIB="$(python3 -c 'import os, sys; print(os.path.dirname(os.__file__))' 2>/dev/null)" || true
    BUNDLED_STDLIB="$PYTHON_DIR/lib/python${PYTHON_VERSION%.*}"
    if [ -n "$SYSTEM_STDLIB" ] && [ -d "$SYSTEM_STDLIB" ]; then
      for pyfile in "$SYSTEM_STDLIB"/*.py; do
        name="$(basename "$pyfile")"
        if [ ! -f "$BUNDLED_STDLIB/$name" ]; then
          cp "$pyfile" "$BUNDLED_STDLIB/"
          echo "==> Patched: copied $name into bundled Python"
        fi
      done
    fi
  else
    rm -rf "$TMP_DIR"
    echo "==> Failed to download Python runtime, falling back to system python3"
  fi
fi

# fallback to system python3
if [ -z "$PYTHON_BIN" ] || [ ! -f "$PYTHON_BIN" ]; then
  PYTHON_BIN="python3"
fi

# ---- install pip deps ----
echo "==> Installing agent dependencies to $DEPS_DIR (using $PYTHON_BIN)"

rm -rf "$DEPS_DIR"
mkdir -p "$DEPS_DIR"

if "$PYTHON_BIN" -m pip install --target "$DEPS_DIR" --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple -r "$AGENT_DIR/requirements.txt" 2>/dev/null; then
  echo "==> Installed via pip"
else
  echo "==> pip unavailable, copying from local site-packages"
  SITE_PKGS=$(python3 -c 'import site; print(site.getsitepackages()[0])')
  echo "==> Source: $SITE_PKGS"

  for pkg_dir in fastapi uvicorn httpx starlette pydantic pydantic_core anyio sniffio; do
    if [ -d "$SITE_PKGS/$pkg_dir" ]; then
      cp -R "$SITE_PKGS/$pkg_dir" "$DEPS_DIR/"
      echo "  copied $pkg_dir"
    fi
  done

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
find "$PYTHON_DIR" -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

echo "==> Done. Dependencies in $DEPS_DIR:"
ls "$DEPS_DIR" | head -20

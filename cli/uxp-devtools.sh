#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TOOL_DIR="$ROOT_DIR/.codex-local/uxp-devtools-cli"
NODE_VERSION="20.20.1"
NODE_DIST="node-v${NODE_VERSION}-darwin-x64"
NODE_ARCHIVE="${NODE_DIST}.tar.gz"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ARCHIVE}"
NODE_ROOT="$TOOL_DIR/$NODE_DIST"
NODE_BIN="$NODE_ROOT/bin/node"
NPM_BIN="$NODE_ROOT/bin/npm"
CLI_ENTRY="$TOOL_DIR/node_modules/@adobe/uxp-devtools-cli/src/uxp.js"
HELPER_SETUP="$TOOL_DIR/node_modules/@adobe/uxp-devtools-helper/scripts/devtools_setup.js"
HELPER_BINDING="$TOOL_DIR/node_modules/@adobe/uxp-devtools-helper/build/Release/node-napi.node"
DEFAULT_PLUGIN_DIR="$ROOT_DIR/premiere-bridge-uxp"
DEFAULT_MANIFEST="$DEFAULT_PLUGIN_DIR/manifest.json"

usage() {
  cat <<EOF
Usage: ./cli/uxp-devtools.sh <command> [args]

Commands:
  setup
      Download x64 Node and install the Adobe UXP CLI into .codex-local/.
  apps
      List host apps currently connected to the UXP DevTools service.
  service-start [uxp args...]
      Start the UXP DevTools service if you need a local service instance.
  load [manifest_path] [uxp args...]
      Load the plugin using the manifest. Defaults to premiere-bridge-uxp/manifest.json.
  reload [plugin_dir] [uxp args...]
      Reload the plugin using the .uxprc session in the plugin directory.
      Defaults to premiere-bridge-uxp/.
  raw [working_dir] -- <uxp args...>
      Run an arbitrary uxp CLI command from a specific working directory.

Examples:
  ./cli/uxp-devtools.sh apps
  ./cli/uxp-devtools.sh load
  ./cli/uxp-devtools.sh reload
  ./cli/uxp-devtools.sh raw ./premiere-bridge-uxp -- plugin unload --apps premierepro@26.0.1
EOF
}

die() {
  echo "$*" >&2
  exit 1
}

require_macos() {
  [[ "$(uname -s)" == "Darwin" ]] || die "This helper only supports macOS."
}

require_rosetta() {
  pkgutil --pkg-info com.apple.pkg.RosettaUpdateAuto >/dev/null 2>&1 || die "Rosetta is required. Install it with: softwareupdate --install-rosetta"
}

resolve_dir() {
  local dir="$1"
  (cd "$dir" && pwd)
}

resolve_file() {
  local file="$1"
  local dir
  dir="$(resolve_dir "$(dirname "$file")")"
  echo "$dir/$(basename "$file")"
}

run_x64() {
  arch -x86_64 "$@"
}

download_node() {
  mkdir -p "$TOOL_DIR"
  if [[ -x "$NODE_BIN" ]]; then
    return
  fi

  local archive_path="$TOOL_DIR/$NODE_ARCHIVE"
  rm -f "$archive_path"
  curl -L "$NODE_URL" -o "$archive_path"
  tar -xzf "$archive_path" -C "$TOOL_DIR"
  rm -f "$archive_path"
}

install_cli() {
  mkdir -p "$TOOL_DIR"

  if [[ -f "$CLI_ENTRY" && -f "$HELPER_BINDING" ]]; then
    return
  fi

  rm -rf "$TOOL_DIR/node_modules" "$TOOL_DIR/package-lock.json"
  printf '{\n  "private": true\n}\n' > "$TOOL_DIR/package.json"

  (
    cd "$TOOL_DIR"
    run_x64 "$NPM_BIN" install --ignore-scripts tar @adobe/uxp-devtools-helper @adobe/uxp-devtools-cli
  )
  run_x64 "$NODE_BIN" "$HELPER_SETUP"
}

ensure_toolchain() {
  require_macos
  require_rosetta
  download_node
  install_cli
}

run_uxp() {
  local cwd="$1"
  shift
  (
    cd "$cwd"
    run_x64 "$NODE_BIN" "$CLI_ENTRY" "$@"
  )
}

cmd="${1:-help}"
if [[ $# -gt 0 ]]; then
  shift
fi

case "$cmd" in
  setup)
    ensure_toolchain
    ;;
  apps)
    ensure_toolchain
    run_uxp "$ROOT_DIR" apps list "$@"
    ;;
  service-start)
    ensure_toolchain
    run_uxp "$ROOT_DIR" service start "$@"
    ;;
  load)
    ensure_toolchain
    manifest_path="$DEFAULT_MANIFEST"
    if [[ $# -gt 0 && "${1}" != --* ]]; then
      manifest_path="$1"
      shift
    fi
    manifest_path="$(resolve_file "$manifest_path")"
    plugin_dir="$(resolve_dir "$(dirname "$manifest_path")")"
    run_uxp "$plugin_dir" plugin load --manifest "$manifest_path" "$@"
    ;;
  reload)
    ensure_toolchain
    plugin_dir="$DEFAULT_PLUGIN_DIR"
    if [[ $# -gt 0 && "${1}" != --* ]]; then
      plugin_dir="$1"
      shift
    fi
    plugin_dir="$(resolve_dir "$plugin_dir")"
    run_uxp "$plugin_dir" plugin reload "$@"
    ;;
  raw)
    ensure_toolchain
    working_dir="$ROOT_DIR"
    if [[ $# -gt 0 && "${1}" != "--" ]]; then
      working_dir="$1"
      shift
    fi
    if [[ "${1:-}" == "--" ]]; then
      shift
    fi
    [[ $# -gt 0 ]] || die "raw requires a uxp CLI command after --"
    working_dir="$(resolve_dir "$working_dir")"
    run_uxp "$working_dir" "$@"
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    usage
    die "Unknown command: $cmd"
    ;;
esac

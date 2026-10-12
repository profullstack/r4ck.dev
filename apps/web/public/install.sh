#!/bin/sh
# Install r4ck, the r4ck.dev CLI and MCP bridge (npm: @profullstack/r4ck).
#
#   curl -fsSL https://r4ck.dev/install.sh | sh
#
# Uses bun if present, otherwise npm (Node >= 22). When the global npm prefix
# is not writable it installs into ~/.local instead of asking for sudo.
# Re-running it upgrades to the latest version.
set -eu

PKG="@profullstack/r4ck"
BIN="r4ck"

say() { printf '%s\n' "$*"; }
die() { printf 'r4ck install: %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

say "Installing r4ck (the server search engine for agents)..."

if have bun; then
  bun add -g "$PKG@latest"
  BIN_DIR="${BUN_INSTALL:-$HOME/.bun}/bin"
elif have npm && have node; then
  major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  [ "$major" -ge 22 ] || die "Node >= 22 required (found $(node -v)). Upgrade Node or install bun: https://bun.sh"
  prefix=$(npm config get prefix)
  modules="$prefix/lib/node_modules"
  [ -d "$modules" ] || modules="$prefix/lib"
  if [ -w "$modules" ] && [ -w "$prefix/bin" ]; then
    npm install -g "$PKG@latest"
    BIN_DIR="$prefix/bin"
  else
    BIN_DIR="$HOME/.local/bin"
    say "npm prefix $prefix is not writable; installing into $HOME/.local"
    npm install -g --prefix "$HOME/.local" "$PKG@latest"
  fi
else
  die "needs bun (https://bun.sh) or Node >= 22 with npm (https://nodejs.org)"
fi

say ""
if have "$BIN"; then
  say "r4ck $("$BIN" --version 2>/dev/null || true) installed."
else
  say "r4ck installed to $BIN_DIR, which is not on your PATH. Add it:"
  say "  export PATH=\"$BIN_DIR:\$PATH\""
fi
say ""
say "Next:"
say "  r4ck search \"2 vcpu 4gb under \$10 in eu\""
say "  r4ck login                        # paste a free key from https://r4ck.dev/settings"
say "  claude mcp add r4ck -- r4ck mcp   # every tool in Claude Code"
say "  r4ck --help"

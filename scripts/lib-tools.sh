# Shared helpers for quality-gate.sh and security-scan.sh. Source it, don't
# run it. Expects ROOT_DIR to be set and the caller to have cd'd there.

VENV_DIR="$ROOT_DIR/.venv-tools"
TOOLS_REQUIREMENTS="$ROOT_DIR/scripts/requirements-tools.txt"
OUT_DIR="$ROOT_DIR/.quality"

# Creates/refreshes .venv-tools/ when it's missing or requirements changed.
ensure_tools_venv() {
  local stamp="$VENV_DIR/.requirements-stamp"
  if [ -x "$VENV_DIR/bin/python" ] && [ -f "$stamp" ] \
    && [ -z "$(find "$TOOLS_REQUIREMENTS" "$ROOT_DIR/backend/imdb-data-python/requirements"*.txt -newer "$stamp" 2>/dev/null)" ]; then
    return 0
  fi
  echo "Setting up Python tools in .venv-tools/ ..."
  python3 -m venv "$VENV_DIR" || return 1
  "$VENV_DIR/bin/pip" install -q --upgrade pip || return 1
  "$VENV_DIR/bin/pip" install -q -r "$TOOLS_REQUIREMENTS" || return 1
  touch "$stamp"
}

# Echoes the merge-base of HEAD and the given ref, or fails loudly.
resolve_base() {
  local ref="$1"
  if ! git rev-parse --verify -q "$ref^{commit}" >/dev/null; then
    echo "Base ref '$ref' not found (try --base origin/main or a commit SHA)." >&2
    return 1
  fi
  git merge-base "$ref" HEAD
}

# Files changed since the base commit: committed, staged, unstaged, and
# untracked (not ignored).
changed_files() {
  { git diff --name-only "$1"; git ls-files --others --exclude-standard; } | sort -u
}

# Maps changed files to component names: posts, frontend, loaders.
touched_components() {
  local files="$1" comps=""
  echo "$files" | grep -q '^backend/posts/' && comps="$comps posts"
  echo "$files" | grep -q '^frontend/imdb-ui-angular/' && comps="$comps frontend"
  echo "$files" | grep -q '^backend/imdb-data-python/' && comps="$comps loaders"
  echo "$comps"
}

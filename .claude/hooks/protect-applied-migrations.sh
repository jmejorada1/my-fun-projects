#!/usr/bin/env bash
# PreToolUse hook (Edit|Write, see .claude/settings.json): blocks changes to a
# Flyway migration that is already on main, since it may have been applied.

file=$(jq -r '.tool_input.file_path // empty')
case "$file" in
  */db/migration/V*__*.sql) ;;
  *) exit 0 ;;
esac

dir=$(dirname "$file")
prefix=$(git -C "$dir" rev-parse --show-prefix 2>/dev/null) || exit 0
rel="$prefix$(basename "$file")"
for ref in main origin/main; do
  if git -C "$dir" cat-file -e "$ref:$rel" 2>/dev/null; then
    echo "$rel is already on $ref and may have been applied. Add a new V<next>__ migration instead (see .claude/rules/flyway-migrations.md)." >&2
    exit 2
  fi
done

#!/bin/sh
exec bash -s "$0" "$@" <<'C2_BUILD_GATE_BASH'
SCRIPT_PATH="$1"
shift
ROOT_DIR="$(cd "$(dirname "$SCRIPT_PATH")/.." && pwd)"
BUILD_ACTION="$ROOT_DIR/src/cli/commands/build-action.ts"

[[ -f "$BUILD_ACTION" ]] || {
	printf 'c2-build-gate: missing %s\n' "$BUILD_ACTION" >&2
	exit 1
}

core_imports="$(rg -n "from ['\"]\.\./\.\./core/" "$BUILD_ACTION" | wc -l | tr -d ' ')"
theme_only="$(rg -n "from ['\"].*theme-service\.ts['\"]" "$BUILD_ACTION" | wc -l | tr -d ' ')"
lines="$(wc -l < "$BUILD_ACTION" | tr -d ' ')"

printf 'CORE_IMPORTS=%s\n' "$core_imports"
printf 'THEME_ONLY=%s\n' "$theme_only"
printf 'LINES=%s\n' "$lines"

[[ "$core_imports" -eq 1 ]] || exit 1
[[ "$theme_only" -eq 1 ]] || exit 1
[[ "$lines" -le 100 ]] || exit 1
C2_BUILD_GATE_BASH

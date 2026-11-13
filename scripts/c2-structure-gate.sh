#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

fail() {
	printf 'c2-structure-gate: %s\n' "$1" >&2
	exit 1
}

contains() {
	grep -Fq -- "$1" "$2"
}

show="$ROOT_DIR/src/cli/commands/show-action.ts"
profile="$ROOT_DIR/src/cli/commands/dt-new-profile-action.ts"
doctor="$ROOT_DIR/src/cli/commands/doctor-action.ts"

contains 'core/inspect/resource-service.ts' "$show" || fail 'show action does not import inspect service'
contains 'showResource(' "$show" || fail 'show action does not call inspect service'
contains 'core/pipeline/profile-create.ts' "$profile" || fail 'profile action does not import profile service'
contains 'createProfile(' "$profile" || fail 'profile action does not call profile service'
contains 'core/doctor/wcag-service.ts' "$doctor" || fail 'doctor action does not import wcag service'
contains 'runDesignTokenContrastCheckService(' "$doctor" || fail 'doctor action does not call wcag service'

for symbol in findResource loadResourceMatch showResource; do
	if grep -Eq "^(async )?function ${symbol}[[:space:]]*\\(" "$show"; then
		fail "show action still defines ${symbol}"
	fi
done

for symbol in planSourceOutput writeSourceOutput; do
	if contains "$symbol" "$profile"; then fail "profile action still references $symbol"; fi
done

wcag_start="$(grep -n '^async function runDesignTokenContrastCheck(' "$doctor" | cut -d: -f1)"
wcag_end="$(grep -n '^export interface DoctorCommandOptions' "$doctor" | cut -d: -f1)"
if [ -z "$wcag_start" ] || [ -z "$wcag_end" ]; then fail 'unable to locate wcag action boundary'; fi
if sed -n "${wcag_start},${wcag_end}p" "$doctor" | grep -Fq 'loadDesignTokenSource'; then
	fail 'wcag action still orchestrates loadDesignTokenSource'
fi

printf 'c2-structure-gate: PASS\n'

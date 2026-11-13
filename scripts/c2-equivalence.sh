#!/bin/sh
exec bash -s "$0" "$@" <<'C2_EQUIVALENCE_BASH'
SCRIPT_PATH="$1"
shift
ROOT_DIR="$(cd "$(dirname "$SCRIPT_PATH")/.." && pwd)"
BASELINE_DIR="$ROOT_DIR/docs/island/plans/2026-11-12-c2-equivalence"
MANIFEST="$BASELINE_DIR/manifest.json"
REPLAY_ROOT="/tmp/c2-replay-v4"
CREATE_ROOT="/tmp/c2-eq-create-b2"
NOPAIRS_PATH="/tmp/c2-nopairs.yaml"
RESULT_ROOT="${C2_RESULT_ROOT:-/tmp/c2-equivalence-results}"
FREEZE_SHA="${FREEZE_SHA:-}"

die() {
	printf 'c2-equivalence: %s\n' "$*" >&2
	exit 1
}

usage() {
	cat >&2 <<'EOF'
Usage: sh scripts/c2-equivalence.sh {replay|capture|compare}

  replay  Re-run the manifest cases and compare them with the frozen oracle.
  capture Re-run the manifest cases and write a fresh result tree.
  compare Prove replay first, then compare the captured result tree with the oracle.
EOF
	exit 2
}

require_command() {
	command -v "$1" >/dev/null 2>&1 || die "missing command: $1"
}

require_command git
require_command jq
require_command python3
require_command mise

[[ -f "$MANIFEST" ]] || die "manifest not found: $MANIFEST"

assert_baseline_pristine() {
	if ! git -C "$ROOT_DIR" diff --quiet -- "$BASELINE_DIR"; then
		die 'baseline has unstaged changes'
	fi
	if ! git -C "$ROOT_DIR" diff --cached --quiet -- "$BASELINE_DIR"; then
		die 'baseline has staged changes'
	fi
	if [[ -n "$FREEZE_SHA" ]]; then
		git -C "$ROOT_DIR" cat-file -e "$FREEZE_SHA^{commit}" 2>/dev/null \
			|| die "FREEZE_SHA is not a commit: $FREEZE_SHA"
		if [[ -n "$(git -C "$ROOT_DIR" diff --name-only "$FREEZE_SHA" HEAD -- "$BASELINE_DIR")" ]]; then
			die "baseline changed after FREEZE_SHA=$FREEZE_SHA"
		fi
	fi
}

assert_allowed_worktree() {
	local allowed dirty path
	allowed=$'scripts/c2-equivalence.sh\nscripts/c2-build-gate.sh\nscripts/c2-structure-gate.sh'
	if [[ -n "${C2_ALLOWED_PATHS:-}" ]]; then
		allowed+=$'\n'"${C2_ALLOWED_PATHS//$' ':/$'\n'}"
	fi
	while IFS= read -r path; do
		[[ -z "$path" ]] && continue
		case "$path" in
			src/core/inspect/*|src/core/pipeline/profile-create.ts|src/core/doctor/wcag-service.ts|\
			src/cli/commands/show-action.ts|src/cli/commands/dt-new-profile-action.ts|\
			src/cli/commands/doctor-action.ts|tests/c2-* )
				continue
				;;
		esac
		if ! grep -Fqx "$path" <<<"$allowed"; then
			die "unexpected worktree change: $path"
		fi
	done < <(
		{
			git -C "$ROOT_DIR" diff --name-only
			git -C "$ROOT_DIR" diff --cached --name-only
			git -C "$ROOT_DIR" ls-files --others --exclude-standard
		} | sort -u
	)

	if [[ -n "$FREEZE_SHA" ]]; then
		dirty="$(git -C "$ROOT_DIR" diff --name-only "$FREEZE_SHA" HEAD -- tests/ | grep -v '^tests/c2-' || true)"
		[[ -z "$dirty" ]] || die "non-c2 test changed since FREEZE_SHA=$FREEZE_SHA:$'\n'$dirty"
	fi
}

fixture_hash() {
	python3 - "$1" <<'PY'
import hashlib
import pathlib
import sys

target = pathlib.Path(sys.argv[1])
if target.is_file():
    print(hashlib.sha256(target.read_bytes()).hexdigest())
    raise SystemExit

digest = hashlib.sha256()
for path in sorted(p for p in target.rglob('*') if p.is_file()):
    digest.update(path.relative_to(target).as_posix().encode())
    digest.update(b'\n')
    digest.update(path.read_bytes())
print(digest.hexdigest())
PY
}

validate_manifest() {
	local case_count setup_count replay_count name expected actual
	case_count="$(jq '.cases | length' "$MANIFEST")"
	setup_count="$(jq '[.cases[] | select(.argv == ["token", "ids", "--write", "--allow-dirty", "-f", "/tmp/c2-eq-create-b2/std/main.yaml"])] | length' "$MANIFEST")"
	replay_count=$((case_count - setup_count))
	[[ "$case_count" -eq 34 ]] || die "manifest case count drifted: $case_count (expected 34)"
	[[ "$setup_count" -eq 1 ]] || die "manifest SETUP count drifted: $setup_count (expected 1)"
	[[ "$replay_count" -eq 33 ]] || die "manifest replay count drifted: $replay_count (expected 33)"

	while IFS= read -r name; do
		[[ -n "$name" ]] || continue
		jq -e --arg case "$name" '.cases[$case].argv | type == "array" and length > 0' "$MANIFEST" >/dev/null \
			|| die "invalid argv schema for case: $name"
		if jq -e --arg case "$name" '.cases[$case].argv[] | strings | test("[<>]")' "$MANIFEST" >/dev/null; then
			die "placeholder found in argv for case: $name"
		fi
		jq -e --arg case "$name" '.cases[$case] | has("files")' "$MANIFEST" >/dev/null \
			|| die "missing files dimension for case: $name"
		if [[ "$name" == create-write ]]; then
			jq -e --arg case "$name" '.cases[$case].files == "create-write.file.yaml (normalized)"' "$MANIFEST" >/dev/null \
				|| die 'create-write files dimension is not the frozen normalized form'
		else
			jq -e --arg case "$name" '.cases[$case].files | type == "array"' "$MANIFEST" >/dev/null \
				|| die "files dimension is not an array for case: $name"
		fi
	done < <(jq -r '.cases | keys[]' "$MANIFEST")

	expected='191ea2e52965828c213ba7e1bf0a2d5d894b9773076828133508970dabc9e615'
	actual="$(fixture_hash "$BASELINE_DIR/fixtures/std-with-ids")"
	[[ "$actual" == "$expected" ]] || die "std-with-ids fixture hash mismatch: $actual"
	expected='0d84b5afd7aa59f3be73f03af386e90b83977bda30494ae2f510ff03212631a7'
	actual="$(fixture_hash "$BASELINE_DIR/fixtures/std-no-ids")"
	[[ "$actual" == "$expected" ]] || die "std-no-ids fixture hash mismatch: $actual"
	expected='40f2f908e1dcc00e40e8319b48abc31c3bcc8142ca89b8407adfd5108d281a1b'
	actual="$(fixture_hash "$BASELINE_DIR/fixtures/nopairs.yaml")"
	[[ "$actual" == "$expected" ]] || die "nopairs fixture hash mismatch: $actual"

	for name in $(jq -r '.cases | keys[]' "$MANIFEST"); do
		for suffix in out err exit; do
			[[ -f "$BASELINE_DIR/$name.$suffix" ]] || die "orphan or missing baseline artifact: $name.$suffix"
		done
	done
	[[ -f "$BASELINE_DIR/create-write.file.yaml" ]] || die 'missing create-write file oracle'
	python3 - "$BASELINE_DIR" "$MANIFEST" <<'PY'
import json
import pathlib
import sys

baseline = pathlib.Path(sys.argv[1])
manifest = json.loads(pathlib.Path(sys.argv[2]).read_text())
expected = {
    f"{name}.{suffix}"
    for name in manifest["cases"]
    for suffix in ("out", "err", "exit")
}
expected.add("create-write.file.yaml")
actual = {
    path.name
    for path in baseline.iterdir()
    if path.is_file() and path.suffix in {".out", ".err", ".exit", ".yaml"}
}
orphan = sorted(actual - expected)
if orphan:
    raise SystemExit(f"orphan baseline artifacts: {', '.join(orphan)}")
PY
}

remove_dir_guarded() {
	local target="$1"
	if [[ -L "$target" || ( -e "$target" && ! -d "$target" ) ]]; then
		die "refusing to remove unexpected non-directory target: $target"
	fi
	rm -rf "$target"
	mkdir -p "$target"
}

remove_file_guarded() {
	local target="$1"
	if [[ -L "$target" || ( -e "$target" && ! -f "$target" ) ]]; then
		die "refusing to remove unexpected non-file target: $target"
	fi
	rm -f "$target"
}

prepare_canonical_paths() {
	remove_dir_guarded "$REPLAY_ROOT"
	remove_dir_guarded "$CREATE_ROOT"
	mkdir "$REPLAY_ROOT/std"
	mkdir "$CREATE_ROOT/std" "$CREATE_ROOT/noid"
	cp -R "$BASELINE_DIR/fixtures/std-with-ids/." "$REPLAY_ROOT/std/"
	cp -R "$BASELINE_DIR/fixtures/std-with-ids/." "$CREATE_ROOT/std/"
	cp "$BASELINE_DIR/fixtures/std-no-ids/main.yaml" "$CREATE_ROOT/noid/main.yaml"
	remove_file_guarded "$NOPAIRS_PATH"
	cp "$BASELINE_DIR/fixtures/nopairs.yaml" "$NOPAIRS_PATH"

	[[ "$(fixture_hash "$REPLAY_ROOT/std")" == "191ea2e52965828c213ba7e1bf0a2d5d894b9773076828133508970dabc9e615" ]] \
		|| die 'replay fixture copy failed byte verification'
	[[ "$(fixture_hash "$CREATE_ROOT/std")" == "191ea2e52965828c213ba7e1bf0a2d5d894b9773076828133508970dabc9e615" ]] \
		|| die 'create fixture copy failed byte verification'
	[[ "$(fixture_hash "$CREATE_ROOT/noid")" == "0d84b5afd7aa59f3be73f03af386e90b83977bda30494ae2f510ff03212631a7" ]] \
		|| die 'no-id fixture copy failed byte verification'
	[[ "$(fixture_hash "$NOPAIRS_PATH")" == "40f2f908e1dcc00e40e8319b48abc31c3bcc8142ca89b8407adfd5108d281a1b" ]] \
		|| die 'nopairs fixture copy failed byte verification'

	[[ ! -e /tmp/nonexistent ]] || die 'guard path exists: /tmp/nonexistent'
	[[ ! -e /tmp/c2-nonexistent.yaml ]] || die 'guard path exists: /tmp/c2-nonexistent.yaml'
	[[ ! -e /tmp/c2-nodir-b2 ]] || die 'guard path exists: /tmp/c2-nodir-b2'
}

snapshot_paths() {
	{
		for path in "$REPLAY_ROOT" "$CREATE_ROOT"; do
			if [[ -d "$path" ]]; then
				find "$path" -type f -print
			fi
		done
		[[ -f "$NOPAIRS_PATH" ]] && printf '%s\n' "$NOPAIRS_PATH"
	} | sort
}

case_names() {
	{
		printf '%s\n' create-write create-exists
		jq -r '.cases | keys[]' "$MANIFEST" | while IFS= read -r name; do
			case "$name" in
				create-write|create-exists|create-ids-write) ;;
				*) printf '%s\n' "$name" ;;
			esac
		done
	} | awk '!seen[$0]++'
}

run_case() {
	local name="$1" result_dir="$2" before after status actual_file normalized_actual
	local -a argv
	mapfile -t argv < <(jq -r --arg case "$name" '.cases[$case].argv[]' "$MANIFEST")
	before="$(mktemp)"
	after="$(mktemp)"
	snapshot_paths >"$before"
	set +e
	(
		cd "$ROOT_DIR"
		mise exec bun@1.3.6 -- bun run src/index.ts "${argv[@]}"
	) >"$result_dir/$name.out" 2>"$result_dir/$name.err"
	status=$?
	set -e
	printf '%s\n' "$status" >"$result_dir/$name.exit"
	snapshot_paths >"$after"

	if [[ "$name" == create-write ]]; then
		actual_file="$REPLAY_ROOT/std/profiles/writeprofile.yaml"
		[[ -f "$actual_file" ]] || die 'create-write did not produce the expected profile file'
		if [[ "$(comm -13 "$before" "$after")" != "$actual_file" ]]; then
			die 'create-write file dimension drifted'
		fi
		normalized_actual="$result_dir/create-write.file.yaml"
		sed -E 's/^\$id: [0-9a-f]{32}$/\$id: <profile-id>/' "$actual_file" >"$normalized_actual"
	else
		if ! cmp -s "$before" "$after"; then
			die "case $name produced an unexpected file side effect"
		fi
	fi
	rm -f "$before" "$after"
}

run_suite() {
	local result_dir="$1" name
	prepare_canonical_paths
	rm -rf "$result_dir"
	mkdir -p "$result_dir"
	while IFS= read -r name; do
		[[ -n "$name" ]] || continue
		run_case "$name" "$result_dir"
	done < <(case_names)
}

compare_suite() {
	local result_dir="$1" name
	while IFS= read -r name; do
		[[ -n "$name" ]] || continue
		cmp -s "$BASELINE_DIR/$name.out" "$result_dir/$name.out" \
			|| die "stdout mismatch: $name"
		cmp -s "$BASELINE_DIR/$name.err" "$result_dir/$name.err" \
			|| die "stderr mismatch: $name"
		cmp -s "$BASELINE_DIR/$name.exit" "$result_dir/$name.exit" \
			|| die "exit mismatch: $name"
		if [[ "$name" == create-write ]]; then
			cmp -s "$BASELINE_DIR/create-write.file.yaml" "$result_dir/create-write.file.yaml" \
				|| die 'create-write file mismatch'
		fi
	done < <(case_names)
}

run_replay() {
	local result_dir="$1"
	assert_baseline_pristine
	assert_allowed_worktree
	validate_manifest
	run_suite "$result_dir"
	compare_suite "$result_dir"
	printf 'c2-equivalence: replay PASS (33 cases; SETUP excluded)\n'
}

mode="${1:-}"
case "$mode" in
	replay)
		run_replay "$RESULT_ROOT/replay"
		;;
	capture)
		assert_baseline_pristine
		assert_allowed_worktree
		validate_manifest
		run_suite "$RESULT_ROOT/capture"
		printf 'c2-equivalence: capture PASS (%s)\n' "$RESULT_ROOT/capture"
		;;
	compare)
		assert_baseline_pristine
		assert_allowed_worktree
		validate_manifest
		run_replay "$RESULT_ROOT/prereq-replay"
		run_suite "$RESULT_ROOT/compare"
		compare_suite "$RESULT_ROOT/compare"
		printf 'c2-equivalence: compare PASS (33 cases; SETUP excluded)\n'
		;;
	*)
		usage
		;;
esac
C2_EQUIVALENCE_BASH

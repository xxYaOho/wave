#!/usr/bin/env sh
# P1b capture protocol (spike: 3 iterations via --iterations; frozen protocol: 30)
# Usage:
#   scripts/capture-p1b-statistics.sh --anchor <commit|HEAD> --run-id <id> \
#     --evidence-dir <dir> [--iterations N] [--warmup N]
set -euo pipefail

ANCHOR=""
RUN_ID=""
EVIDENCE_DIR=""
ITERATIONS=30
WARMUP=3
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

while [ $# -gt 0 ]; do
	case "$1" in
	--anchor)
		[ "$#" -ge 2 ] || { echo "--anchor requires a value" >&2; exit 2; }
		ANCHOR="$2"
		shift 2
		;;
	--run-id)
		[ "$#" -ge 2 ] || { echo "--run-id requires a value" >&2; exit 2; }
		RUN_ID="$2"
		shift 2
		;;
	--evidence-dir)
		[ "$#" -ge 2 ] || { echo "--evidence-dir requires a value" >&2; exit 2; }
		EVIDENCE_DIR="$2"
		shift 2
		;;
	--iterations)
		[ "$#" -ge 2 ] || { echo "--iterations requires a value" >&2; exit 2; }
		ITERATIONS="$2"
		shift 2
		;;
	--warmup)
		[ "$#" -ge 2 ] || { echo "--warmup requires a value" >&2; exit 2; }
		WARMUP="$2"
		shift 2
		;;
	*)
		echo "unknown argument: $1" >&2
		exit 2
		;;
	esac
done

[ -n "$ANCHOR" ] || {
	echo "--anchor required" >&2
	exit 2
}
[ -n "$RUN_ID" ] || {
	echo "--run-id required" >&2
	exit 2
}
[ -n "$EVIDENCE_DIR" ] || {
	echo "--evidence-dir required" >&2
	exit 2
}

WORK_DIR="/private/tmp/p1b-capture-$RUN_ID"
RESULTS_DIR="$WORK_DIR/reports"

if [ "$ANCHOR" = "HEAD" ]; then
	SOURCE_DIR="$REPO_ROOT"
else
	SOURCE_DIR="$WORK_DIR/anchor"
	if [ -d "$SOURCE_DIR" ]; then
		echo "FAIL: anchor worktree already exists: $SOURCE_DIR (stale)" >&2
		exit 1
	fi
	git -C "$REPO_ROOT" worktree add "$SOURCE_DIR" "$ANCHOR"
fi

cd "$SOURCE_DIR"

# tracked-clean assertion (recorded)
if ! git diff --quiet || ! git diff --cached --quiet; then
	echo "FAIL: tracked files dirty at $SOURCE_DIR" >&2
	exit 1
fi
echo "OK: tracked-clean at $SOURCE_DIR"

# host load sampled at capture start AND end (Darwin+Linux robust probes)
load_now() {
	LOAD_VALUE="$(sysctl -n vm.loadavg 2>/dev/null | tr -d '{}' | awk '{print $1}' | tr -d ' ' || true)"
	if [ -z "$LOAD_VALUE" ] && [ -r /proc/loadavg ]; then
		LOAD_VALUE="$(awk '{print $1}' /proc/loadavg 2>/dev/null || true)"
	fi
	printf '%s' "$LOAD_VALUE"
}
LOAD_START="$(load_now)"
[ -n "$LOAD_START" ] || {
	echo "FAIL: host load probe returned empty value at capture start" >&2
	exit 1
}
echo "OK: host load1m at start = $LOAD_START"

mise exec bun@1.3.6 -- pnpm install --frozen-lockfile >/dev/null
echo "OK: install --frozen-lockfile"

ACTUAL_LOCK_HASH="$(shasum -a 256 pnpm-lock.yaml | cut -d' ' -f1)"
EXPECTED_LOCK_HASH="$(git show "$ANCHOR":pnpm-lock.yaml 2>/dev/null | shasum -a 256 | cut -d' ' -f1 || true)"
if [ "$ANCHOR" = "HEAD" ]; then
	EXPECTED_LOCK_HASH="$(git show HEAD:pnpm-lock.yaml | shasum -a 256 | cut -d' ' -f1)"
fi
if [ "$ACTUAL_LOCK_HASH" != "$EXPECTED_LOCK_HASH" ]; then
	echo "FAIL: lockfile hash mismatch (actual=$ACTUAL_LOCK_HASH expected=$EXPECTED_LOCK_HASH)" >&2
	exit 1
fi
echo "OK: lockfile hash match $ACTUAL_LOCK_HASH"

mise exec bun@1.3.6 -- pnpm build >/dev/null
echo "OK: build"

if ! git diff --quiet || ! git diff --cached --quiet; then
	echo "FAIL: build dirtied tracked files" >&2
	exit 1
fi

mkdir -p "$RESULTS_DIR"
mise exec bun@1.3.6 -- bun benchmarks/run.ts \
	--iterations "$ITERATIONS" \
	--warmup "$WARMUP" \
	--run-id "$RUN_ID" \
	--domain token-single-profile \
	--domain token-multi-profile \
	--domain night \
	--results-dir "$RESULTS_DIR"
echo "OK: benchmark run complete"

REPORT_PATH="$RESULTS_DIR/$RUN_ID.json"
[ -f "$REPORT_PATH" ] || {
	echo "FAIL: report missing: $REPORT_PATH" >&2
	exit 1
}

REPORT_NODE="$(mise exec bun@1.3.6 -- bun -e 'const report = JSON.parse(await Bun.file(process.argv[1]).text()); const node = report.environment?.node; if (typeof node !== "string" || node.length === 0) process.exit(1); console.log(node);' "$REPORT_PATH")" || {
	echo "FAIL: report environment.node missing: $REPORT_PATH" >&2
	exit 1
}
NODE_VERSION="$(mise exec bun@1.3.6 -- bun -e 'console.log(process.version)')" || {
	echo "FAIL: runtime node probe failed" >&2
	exit 1
}
[ "$NODE_VERSION" = "$REPORT_NODE" ] || {
	echo "FAIL: manifest runtime.node must match report environment.node (runtime=$NODE_VERSION report=$REPORT_NODE)" >&2
	exit 1
}
REPORT_BUN="$(mise exec bun@1.3.6 -- bun -e 'const report = JSON.parse(await Bun.file(process.argv[1]).text()); const bun = report.environment?.bun; if (typeof bun !== "string" || bun.length === 0) process.exit(1); console.log(bun);' "$REPORT_PATH")" || {
	echo "FAIL: report environment.bun missing: $REPORT_PATH" >&2
	exit 1
}
[ "$REPORT_BUN" = "1.3.6" ] || {
	echo "FAIL: manifest runtime.bun must match report environment.bun (runtime=1.3.6 report=$REPORT_BUN)" >&2
	exit 1
}

# equivalence-on smoke at EVERY anchor (spec contract; design-token harness exists at all anchors)
mise exec bun@1.3.6 -- bun benchmarks/design-token/run.ts --mode default --iterations 1 --warmup 0 >/dev/null
echo "OK: equivalence-on smoke at anchor $ANCHOR"

if ! git diff --quiet || ! git diff --cached --quiet; then
	echo "FAIL: tracked files dirty after capture" >&2
	exit 1
fi

HEAD_COMMIT="$(git rev-parse HEAD)"
ANCHOR_COMMIT="$(git rev-parse "$ANCHOR" 2>/dev/null || echo "$ANCHOR")"
LOAD_END="$(load_now)"
[ -n "$LOAD_END" ] || {
	echo "FAIL: host load probe returned empty value at capture end" >&2
	exit 1
}

mkdir -p "$EVIDENCE_DIR"
[ -e "$EVIDENCE_DIR/$RUN_ID.json" ] && {
	echo "FAIL: evidence file already exists: $EVIDENCE_DIR/$RUN_ID.json (stale guard)" >&2
	exit 1
}
[ -e "$EVIDENCE_DIR/$RUN_ID.capture-manifest.json" ] && {
	echo "FAIL: evidence manifest already exists: $EVIDENCE_DIR/$RUN_ID.capture-manifest.json (stale guard)" >&2
	exit 1
}
cp "$REPORT_PATH" "$EVIDENCE_DIR/"

cat > "$EVIDENCE_DIR/$RUN_ID.capture-manifest.json" <<MANIFEST
{
  "runId": "$RUN_ID",
  "anchorArg": "$ANCHOR",
  "anchorCommit": "$ANCHOR_COMMIT",
  "headCommit": "$HEAD_COMMIT",
  "iterations": $ITERATIONS,
  "warmup": $WARMUP,
  "lockfileHash": "$ACTUAL_LOCK_HASH",
  "sourceDir": "$SOURCE_DIR",
  "runtime": { "bun": "1.3.6", "node": "$NODE_VERSION", "platform": "$(uname -s)", "arch": "$(uname -m)" },
  "hostLoad": { "load1mStart": "$LOAD_START", "load1mEnd": "$LOAD_END", "note": "no parallel agents during capture (orchestrator serial execution)" },
  "report": "$RUN_ID.json"
}
MANIFEST
echo "OK: evidence + capture manifest written to $EVIDENCE_DIR/"
echo "DONE anchor=$ANCHOR run-id=$RUN_ID"

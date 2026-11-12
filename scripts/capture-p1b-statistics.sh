#!/usr/bin/env sh
# P1b capture protocol (spike: 3 iterations via --iterations; frozen protocol: 30)
# Usage:
#   scripts/capture-p1b-statistics.sh --anchor <commit|HEAD> --run-id <id> \
#     --evidence-dir <dir> [--iterations N] [--warmup N] [--repo-root <dir>]
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
		ANCHOR="$2"
		shift 2
		;;
	--run-id)
		RUN_ID="$2"
		shift 2
		;;
	--evidence-dir)
		EVIDENCE_DIR="$2"
		shift 2
		;;
	--iterations)
		ITERATIONS="$2"
		shift 2
		;;
	--warmup)
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

# equivalence-on smoke (source repo only; anchor worktrees skip — proven at HEAD)
if [ "$ANCHOR" = "HEAD" ]; then
	mise exec bun@1.3.6 -- bun benchmarks/design-token/run.ts --mode default --iterations 1 --warmup 0 >/dev/null
	echo "OK: equivalence-on smoke"
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
	echo "FAIL: tracked files dirty after capture" >&2
	exit 1
fi

mkdir -p "$EVIDENCE_DIR"
cp "$REPORT_PATH" "$EVIDENCE_DIR/"
echo "OK: evidence copied to $EVIDENCE_DIR/$RUN_ID.json"
echo "DONE anchor=$ANCHOR run-id=$RUN_ID"

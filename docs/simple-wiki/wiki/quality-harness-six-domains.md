---
title: benchmarks 六域契约与重放基线
type: concept
created: 2026-11-13
updated: 2026-11-13
sources: [../raw/2026-11-13-c2-review-ledgers.md]
topic: 施工工具链事实
tags: [benchmark, quality-harness, 基线, 重放, manifest]
context: 2
status: current
---

# benchmarks 六域契约与重放基线

Quality Harness（`benchmarks/`）六域：design-token、cold-start、token-single-profile、token-multi-profile、night、compress、manual（入口 `benchmarks/run.ts`，旗标 `--iterations/--warmup/--run-id/--tmp-root/--results-dir/--domain`；字面命令中未知的 `<>` 占位符会被 shell 当重定向——用 `git rev-parse --short=8` 变量代入）。

## 重放基线 manifest 合同（C2 基线 v4 实证，35 案 = 34 重放 + 1 SETUP）

- 每案记录**字面 argv**（零 `<>` 占位符——路径已在捕获时烙进 stdout，重放按原样执行 + 预置表把 fixture 放回**捕获时的精确 /tmp 路径**，stdout 逐字节一致 by construction）。
- `files` 维度全案显式（`[]` = 断言临时目录无额外文件，防 dry-run 偷写）。
- 有序依赖用例冻结顺序（如 create-write 首跑 exit 0 → create-exists 二跑 exit 5）。
- SETUP 用例（stdout 含随机 id）仅比对退出码。
- fixture 快照入库 + SHA256（算法随哈希入库：相对路径排序 + 路径 NUL + 内容聚合）。[C2 审查台账](../raw/2026-11-13-c2-review-ledgers.md)

## 陷阱

- 快照泄漏先前运行产物（如 profiles/writeprofile.yaml）会让有序重放首案直接撞 already-exists——快照必须从洁净源重建。
- 断言守卫 `git diff tests/ -- ':!tests/c2-*'` 语法非法（exit 128），且只比 commit 树（staged/unstaged 逃逸）——改用 FREEZE_SHA 冻结点 + `git diff --name-only $SHA HEAD -- <dir>` + grep 白名单。

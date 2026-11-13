---
title: Biome 生成物证据边界
type: decision
created: 2026-11-13
updated: 2026-11-13
sources: [../raw/2026-11-13-m1-review-ledger.md]
topic: 验收范式与飞轮治理
tags: [biome, 生成物, 配置边界, 格式门, 证据]
context: 1
status: current
---

# Biome 生成物证据边界

机器生成的证据目录（行为基线、等价 manifest、统计 JSON）不满足 Biome 格式规则，却**不该被格式化或改动**（内容即证据）。解法：`biome.json` 的 `files.includes` 追加 `!docs/island/plans/<证据目录>/**` 配置边界排除——格式门不降级，证据不被污染。

## 实例（三度，P1a 先例沿用）

- `!docs/island/plans/2026-11-11-p1-baseline/**`
- `!docs/island/plans/2026-11-12-c2-equivalence/**`
- `!docs/island/plans/2026-11-12-p1b-statistics/**`

## 要点

- 新建证据目录时**同步加排除**（否则 check:ci 的 check:style 段会失败——生成 JSON 不符合格式规则）。
- 目录哈希若入 manifest（如 fixturesSha256），**算法定义须随哈希入库**（相对路径排序 + 路径 NUL + 内容聚合），否则不可独立复算。[M1 审查台账](../raw/2026-11-13-m1-review-ledger.md)

---
title: 预注册测量裁决
type: decision
created: 2026-11-13
updated: 2026-11-13
sources: [../raw/2026-11-13-p1b-review-ledger.md]
topic: 验收范式与飞轮治理
tags: [预注册, 测量, 裁决, benchmark, 性能]
context: 2
status: current
---

# 预注册测量裁决

性能/收益类「保留还是撤回」的判定，规则必须**先于测量锁定**，测完不可调整（防动机性调参）。实测样本：P1b 缓存收益裁决（statistics.json，30 迭代 × 3 域配对）。[P1b 审查台账](../raw/2026-11-13-p1b-review-ledger.md)

## 合同要点

1. **配对比较**：同任务 pre/post 逐次配对，RI = median{−dᵢ/preᵢ : preᵢ>0}（偶数基数取中间两值均值）；PR = p95 相对回归。
2. **规则结构**：分域阈值 + 命中佐证（机制确实在运行）+ 全局安全地板（任一域灾难回归 → 直接 escalate，价值立场不豁免）。
3. **verdict 优先级封版**：validity（捕获有效性）任一失败 → invalid，**不做规则裁决**；safety-floor 仅在 valid 时评估。两形态不可同时合法。
4. **测量真实性绑定**：provenance（runtime 版本/负载采样/哈希）从真实运行环境取值并逐字核对——环境采错会让整个测量不可信（实测：ambient node ≠ Bun 内嵌 process.version）。

## 结果

P1b verdict = escalate（全域回归 −22%～−60%，安全地板击穿）→ Human 逐层撤回裁决。预注册让这个结论无可争辩：规则是测量前定的。

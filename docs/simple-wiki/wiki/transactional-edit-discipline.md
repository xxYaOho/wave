---
title: 事务式编辑纪律
type: pitfall
created: 2026-11-13
updated: 2026-11-13
sources: [../raw/2026-11-13-m1-review-ledger.md]
topic: 流程教训
tags: [编辑, 断言, 事务, 纪律, python]
context: 1
status: current
---

# 事务式编辑纪律

多锚点批量编辑（python/sed 对 SPEC 多处复述合同做替换）在任一锚点断言失败时**全量丢失**——先应用的替换不落盘，后锚点又未执行；且替换文本写盘时被截断会直接造成语法损坏。实测：M1 SPEC 的 en-only 残留三度复发、C2 的 M4/M5 编辑整批丢失、脚本文件截断语法错误。

## 纪律

1. 批量替换**先验证全部锚点存在**（每个 old 断言 in 检查），全部通过后单次写盘。
2. 写盘后**逐项 grep 验证**（新文本命中数 + 旧文本残留数 = 0）。
3. 长内容用 Write 工具落脚本文件再执行，不走 heredoc（长 heredoc 会被截断）。
4. 合同在 SPEC 多处复述时，修正一处契约 = **grep 全文该契约的每一处复述**，逐处修正逐处验证。

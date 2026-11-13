---
title: gate 脚本只用 POSIX 工具
type: pitfall
created: 2026-11-13
updated: 2026-11-13
sources: [../raw/2026-11-13-c2-review-ledgers.md]
topic: 施工工具链事实
tags: [gate, posix, grep, rg, 可移植性]
context: 1
status: current
---

# gate 脚本只用 POSIX 工具

gate/验收脚本若依赖非 POSIX 工具（如 `rg`/ripgrep），在未安装该工具的环境里**观测值全零、误报架构失败**（实测：c2-build-gate.sh 用 rg 统计 import，环境无 rg → CORE_IMPORTS=0 → FAIL，实际应为 1）。

## 规则

1. gate 脚本只用 POSIX 保证项：`grep -c`/`grep -E`、`wc -l`、`cmp`、`shasum`、`sed -E`。
2. 观测值必须与 SPEC 预写冻结数字比对（脚本自身可写，不作 oracle——SPEC 即 oracle）。
3. 工具缺失时的正确形态是**误报 FAIL**（保守），但更优是脚本开头探测依赖并在缺失时显式报「工具缺失」而非输出 0 值。

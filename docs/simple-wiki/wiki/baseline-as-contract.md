---
title: 基线即合同
type: decision
created: 2026-11-13
updated: 2026-11-13
sources: [../raw/2026-11-13-c2-review-ledgers.md]
topic: 验收范式与飞轮治理
tags: [验收范式, baseline, equivalence, gate, behavior-preservation]
context: 2
status: current
---

# 基线即合同

行为保持类改造（重构/服务下沉/等价性能改造）的验收不由纸面形状预冻结，而由**改动前捕获的行为基线**承载。

## 范式

改动前捕获基线（N 案 × stdout/stderr/exit/产物文件四项），验收 = 改动后重放逐字节复现基线。分支语义、消息枚举、结果形状**住代码与基线，不住散文**——散文分支表无法穷尽源码分支，每轮 fresh 审查都会揭出新表述缺口（C2 十轮三范式实测：FATAL 轨迹 6→5→7→2→5→3→2→4→4→3）。[C2 审查台账](../raw/2026-11-13-c2-review-ledgers.md)

## 三道前置

1. **基线捕获于改动前状态**，基线目录与 manifest 施工期只读。
2. **重放自校验**：未改动树上 replay 必须逐字节复现基线——证明 oracle 自身可靠后，提取/改造的 compare 才有意义。
3. **委托证明门**：行为等价是必要非充分（零代码变更也全绿）——需静态断言「提取真的发生」：正向（action 含服务调用）+ 负向（被移编排的私有定义消失）+ 服务 API smoke（独立 import + 最小调用）。

## 陷阱与边界

- 基线捕获的 stdout 会烙印临时路径：capture 与 replay 必须用**同一规范根路径**（重放按录制 argv 字面执行，零替换；预置表把 fixture 放回收捕获时的精确路径）。
- dry-run 类用例显式 `files: []` 并断言临时目录无额外文件（防偷写副作用）。
- 仅适用行为保持类；新行为无基线可捕，走常规 SPEC。

实例：cli_wave C2（35 案基线 v4 + c2-equivalence.sh 三模式，FULL-8 一轮通过）。

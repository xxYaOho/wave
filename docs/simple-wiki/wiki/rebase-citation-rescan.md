---
title: rebase 后重核 SPEC 引用
type: pitfall
created: 2026-11-13
updated: 2026-11-13
sources: [../raw/2026-11-13-m1-review-ledger.md, ../raw/2026-11-13-p1b-review-ledger.md]
topic: 流程教训
tags: [rebase, SPEC, 引用, 行号, 纪律]
context: 1
status: current
---

# rebase 后重核 SPEC 引用

rebase 会换入新文件版图：行号漂移、函数迁移（如 doctor 编排移入 *-action.ts）、哈希变更。SPEC 在 rebase 前写就的 file:line 引用与事实断言**全部失效**——三实例：doctor 编排真身迁移（SPEC 仍指旧位置）、基线哈希漂移、行号失真被 reviewer 逐条抓出。

## 规则

1. rebase/merge 落地后，SPEC 内全部 `file:line` 引用**逐条重核**（grep 验证内容仍在该处）。
2. 事实断言（行数阈值、import 计数、哈希）重算。
3. 长生命周期 SPEC 引用相对事实（函数名/结构）优于行号。

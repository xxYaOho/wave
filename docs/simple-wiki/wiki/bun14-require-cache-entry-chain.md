---
title: Bun 1.4.0 require.cache 丢失入口链登记
type: pitfall
created: 2026-11-13
updated: 2026-11-13
sources: [../raw/2026-11-13-bun14-spike-report.md]
topic: 施工工具链事实
tags: [bun, 1.4.0, require-cache, 可观测性, 懒加载, 升级]
context: 2
status: current
---

# Bun 1.4.0 require.cache 丢失入口链登记

Bun 从 1.3.6 升到 1.4.0 后，`require.cache`/`createRequire().cache` 在**特定退出路径**下不登记入口链两个模块——破坏的是「证据通道」，**不是懒加载不变量本身**。

## 精确症状（spike 实测，6/6 确定性复现）

- 进程 exit 时 dump 缓存表：1.3.6 有 34 个 repo 条目，1.4.0 有 32 个——缺失**恰好且仅**为入口 `src/index.ts` 与其直接导入 `src/cli/index.ts` 两个 key（逐项 diff，无新增无前缀变体）。
- **触发规律**：commander 的 help/version 退出路径（纯微任务收尾的 top-level await）→ 两模块缺席；真实命令路径（如 `token show palette`：142=142 条目零 diff）与 `-m` 手册路径 → 与 1.3.6 完全一致。synthetic 链条无法复现，触发依赖 commander 消费真实 argv 的 help/version 退出。

## 不变量仍然成立（关键好消息）

1.4.0 下故意 import 业务模块（theme-service）后**正常登记**（279 vs 277 条目，仍只差那 2 个）——文档路径零业务模块加载的懒加载事实在 1.4.0 下**依然成立**。坏的只是「exit 时缓存表完整反映入口链」这一条采样通道。

## 破坏面（cli_wave 实测）

1324 tests 中 25 fail **全部**位于 cli-loading.test.ts（24 个 `-h` 文档路径加载证据 + 1 个阳性对照 sanity `toContain('src/cli/index.ts')`）；其余 102 文件零失败。测试失败方式为诚实失败（sanity 中止，业务断言未执行）。App 层完全正常（help 输出两版本逐字节一致，真实命令 exit 0）。

## 升级协议方向

加载证据协议改为版本无关：**preload tracer**（`bun --preload tracer.ts` 挂模块解析 hook，写 trace 文件；preload 需绝对路径），exit 时不再以 require.cache 含入口模块作 sanity——业务模块可检测性在 1.4.0 下成立。风险提示：入口链缺席的内部机制未定位，任何依赖「exit 时缓存表完整反映 ESM 图」的采样点都应视为不可靠。

证据：/tmp/bun14-spike/{probe,probe-raw}.mjs 与 mods-{1.3.6,1.4.0}.txt 条目清单（spike 现场保留）。

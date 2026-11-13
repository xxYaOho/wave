---
class: evidence
ingested: true
integrated: true
metadata:
  spike: bun-1.3.6-to-1.4.0 breakage surface
  date: 2026-11-13
---

# Bun 1.4.0 破坏面 spike 报告（原始材料）

诊断完毕，未修复；现场保留于 /tmp/bun14-spike，跟踪源码经 git diff 验证未被污染。

## 一、测试破坏面

- 基线 1.3.6：1324 pass / 0 fail（103 文件，连跑两次全绿；首次冷跑曾 3 fail + 1 error，属一次性噪声）。
- 1.4.0：1299 pass / 25 fail，总数不变（1324 / 103 文件）。
- 失败集中度：25 个全部位于 tests/cli-loading.test.ts（36 pass / 25 fail），其中 24 个为 `-h` 文档路径「loads zero business modules, repeatably」+ 1 个阳性对照。`-m` 手册路径变体全部通过。**加载证据类 25，其他类 0**——其他 102 个文件零失败。

## 二、最小探针结论（probe.mjs / probe-raw.mjs，复现命令 `bun --preload tests/fixtures/cli-loading/probe.ts src/index.ts -h`，preload 需绝对路径）

- 1.4.0 的缓存表**不是空表、也不是不登记 ESM**：`.ts`/`.mjs`、node_modules CJS/ESM、动态 import 的业务模块（show-action.ts、theme-service.ts、resolver/**）全部照常登记。
- 精确差异：exit 时 dump，1.3.6 有 34 个 repo 条目，1.4.0 有 32 个，缺失的**恰好且仅**为入口 `src/index.ts` 与其直接导入 `src/cli/index.ts` 两个 key（diff 逐项核验，无新增无前缀变体——已排除 /tmp→/private/tmp 符号链接假象）。
- 触发规律（确定性，6/6 复现，非竞速：入口后加 10ms await 仍复现）：commander 的 help/version 退出路径（纯微任务收尾的 top-level await）→ 这两个模块缺席；真实命令路径（`token show palette`：142=142 条目零 diff）、`-m` 手册路径（真实异步工作）、`parseAsync([])` → 与 1.3.6 完全一致。synthetic 链条（含 TLA/shebang/commander）均无法复现，触发点依赖 commander 消费真实 argv 的 help/version 退出。Bun 内部根因未定位（超出 spike 范围），上述为可复现行为定律。
- 阳性对照关键事实：1.4.0 下故意 `import` theme-service 后该模块**正常登记**（279 vs 277 条目，仍只差那 2 个）——即懒加载不变量本身在 1.4.0 下依然成立（文档路径确实零业务模块加载），坏的只是 require.cache 对入口链的可观测性这一条「证据通道」。测试失败方式是诚实失败（断言在 cli-loading.test.ts:88 的 sanity 检查 `toContain('src/cli/index.ts')` 处中止，业务断言未执行到）。

## 三、App 层

完全正常：`bun src/index.ts --help` 两版本输出逐字节一致（807B，exit 0）；`token build -f tests/fixtures/themes/standard/main.yaml` exit 0 正常完成。结论是「仅测试可观测性坏，App 无损」。

## 四、升级决策输入

破坏面仅此一类。若协议改为版本无关（如 preload tracer 走模块解析 hook 写 trace 文件，exit 时不再以 require.cache 含入口模块作 sanity），1.4.0 下不受阻——「业务模块可检测」仍成立（阳性对照登记正常）。风险提示：入口链缺席的内部机制未明，任何依赖「exit 时缓存表完整反映 ESM 图」的采样点都应视为不可靠。

## 证据文件

/tmp/bun14-spike/{probe,probe2,probe-raw,probe-inrepo}.mjs；日志 /tmp/bun14-spike-baseline{,2}.log、/tmp/bun14-spike-bun140.log；条目清单 /tmp/mods-{1.3.6,1.4.0}.txt、/tmp/mods-palette-{1.3.6,1.4.0}.txt

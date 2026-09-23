---
date: 2026-09-23
state: 已交付（strict 复核 PASS，治理决策待 Human）
scope: cli_wave 全仓
auditor: chatgpt@sonnet(xhigh)（3 实例，前两实例中断，第三实例完成）
reviewer: deepseek-flash（Critic Strict，Round 1 / FULL / report 模式）→ PASS
---

# Wave 全仓质量审计报告

## VERDICT

整体可构建且测试全绿，但输出规划、压缩提交语义、手册静态服务边界和 resolver 收敛策略存在高爆炸半径技术债；健康度：有条件通过。

## ADHERENCE

遵守只读纪律；已执行 typecheck、bun test、受控 dt build；未使用 `--fix` / 格式化 / 快照 / 迁移 / 网络 / DB；在途计划覆盖项（sketch v2、CSS typography shorthand、`$extensions`、dt ids、doctor）标注为已覆盖，不重复列债。

## CRITICAL

- `src/core/pipeline/output-plan.ts:26-46`（inherited，前轮实例复现）：ownerByPath 仅做完全相同 filePath 的 Map 查重，不做 file-vs-directory 前缀冲突；前轮 `bun -e` 复现规划 ok=true，后续写入必然 file/dir 冲突。方向：规范化路径后做前缀 trie / 排序扫描并在规划阶段拒绝。成本：中。
  - 复核修正：触发需要病态 `$config.theme` 名（如 `demo.json/x`，自然命名无法产生——文件名恒为 `${themeName}<ext>`）；实际损害 = 写入期裸 ENOTDIR/EEXIST + 已写文件残留（误导性失败，非数据损坏）。**定级修正：CRITICAL → MAJOR 加固项**；排期前重跑并披露最小可达触发。补 `tests/output-plan.test.ts` 前缀用例。
- `src/core/compress/index.ts:261-285`（inherited，前轮实例复现）：递归 visitor 对 Dirent 目录项再 fs.stat，跟随嵌套 symlink，无 realpath/visited；可越界扫描或循环递归。补充事实：`entry.isDirectory()` 对 symlink 为 false，非递归模式也会下潜 symlink 目录；环形链接 = 无界递归崩溃（非可读错误）。方向：lstat / 显式 symlink 策略 + realpath root containment + visited。成本：中。

## MAJOR

- `src/core/resolver/reference-resolution.ts:55-80`：内部引用解析硬编码 maxIterations=10，每轮解一层；有效链 ≥11 层被误报 resolution exhausted（10,000 层链复现）。fail-closed + 结构化 UnresolvedReferenceError，无静默坏输出；真实资产未证实触发。方向：按引用图 DFS/topological 解析或按图规模动态收敛。成本：中高。**定级：加固项，不阻塞 sketch v2**（复核修正）。
- `src/core/compress/index.ts:156-235, 438-445`（复现：第二 PNG 失败时 a-output=true / b-output=false）：逐 candidate 即时 copyFile 到 outDir，后续失败直接 throw 不回滚。方向：全部写入临时 staging，全部成功后原子 commit；失败清理。成本：中。**合并工作项**：generator 侧同病（token-generator.ts:180-186 逐文件 Bun.write 不清理）并入本项。
- `src/core/compress/index.ts:301-318, 209`（复现裸 EEXIST）：输出校验只查最终文件存在，不查 outDir 本身为普通文件。方向：预检 outDir 类型及前缀冲突，返回结构化 issue。成本：低中。
- `src/core/motion/motion.ts:375-401`（复现 broken symlink 裸 ENOENT）：目录项 fs.stat 在 PNG 读取 try/catch 外。方向：lstat / 逐项 catch 转 WMG issue。成本：低中。
- `src/core/manual/server.ts:36-75`（复现 /leak.txt 200）：safeJoin 纯词法 containment，Bun.file 未 realpath，appDir 内 symlink 可越界。边界事实：appDir 由 cwd 优先 `dist/manual-app`（不可信仓库内执行即服务该目录）；默认 host=127.0.0.1，对外暴露需显式 `--host 0.0.0.0`。方向：realpath containment 或拒绝 symlink。成本：低中。**定级修正：本地加固项**，不与 compress 数据面并列最高优先级。附带静态判定：safeJoin 与 fetch 均无 try/catch，malformed %-序列抛 URIError → 500（原 UNVERIFIED 移出）。

## MINOR

- `getFilteredName`/filterLayer 逻辑复制于 `src/core/generator/formats/css.ts:28-34`、`flat.ts:8-14`、`sketch.ts:474-480`——投影规则漂移风险，抽共享 helper。成本低。
- `src/core/transformer/theme-transformer.ts` 单文件 1233 行（transformToken@765 / walk@1061）承载类型转换、legacy 扩展、Sketch 元数据、派生值、lineage——按 extension/type pass 拆分并固定中间合同。成本中。
- 测试缺口：压缩 staging 回滚、outDir 为文件、motion broken symlink、manual symlink containment、resolver 深链回归、output-plan 前缀用例。

## SIGNALS

- `pnpm typecheck` 通过（exit 0）
- `bun test`：865 pass / 0 fail / 63 files / 3116 expect
- `pnpm dev -- dt build -f tests/fixtures/themes/standard/main.yaml --out <tmp>` 通过（仅既有 theme.dimension migration warning）
- 审计前后 `git status` 一致，无审计新增仓库痕迹

## UNVERIFIED

- manual server 对 malformed percent-encoding 的 decodeURIComponent 异常路径——已静态判定（safeJoin 与 fetch 均无 try/catch，malformed %-序列抛 URIError → 500）
- generator 第二个 Bun.write 失败后的部分输出——已并入「输出提交原子性」工作项

## ESCALATE

1. 「输出提交原子性」「compress symlink 策略」两项排最高优先级（含 generator 侧合并）
2. resolver 深链与 output-plan 前缀为加固项，不阻塞在途 v2 计划；但 v2 的 sketch v2 重写前建议锁定 resolver/formatter 中间合同与全格式前缀冲突规则
3. 保留当前 dirty worktree，不清理他人变更

## Strict 复核修正账本（Round 1 FULL → PASS）

| 复核发现 | 处置 |
|---|---|
| CRITICAL-1 缺可达性证据（触发需病态 theme 名） | 降档 CRITICAL → MAJOR 加固项；排期前重跑披露最小触发 |
| 溯源错位（inherited 未就地标注） | CRITICAL 逐条标注 inherited；排期前重跑复现 |
| resolver 项缺边界数据 | 给出最小失败深度 ≈11、fail-closed 事实；移出 sketch v2 前置 |
| 同类缺陷定级不一致 | generator 部分写并入「输出提交原子性」工作项 |
| MINOR 修正 | compress outDir 降档说明；manual 补最强可达性框架与 host 条件；decodeURIComponent 移出 UNVERIFIED；compress symlink 补非递归下潜事实 |

## 基线（治理后对照）

- `pnpm typecheck` exit 0
- `bun test`：865 pass / 0 fail / 63 files / 3116 expect
- 受控 dt build（standard fixture）：通过，仅既有 theme.dimension migration warning
- 已知真实实例缺口（在途 v2 计划已登记）：orca-test 快照 `--profiles all` 存在 sketch 输出路径前缀冲突（`shadow` vs `shadow/elevation-high`），root-cause 归 v2 M4

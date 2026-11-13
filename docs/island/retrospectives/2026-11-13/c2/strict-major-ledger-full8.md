# STRICT FULL-8 发现存档（FAIL 4F/4M/2m，2026-11-13）——基线即合同新生命周期 Round 1

审查立场良好：未以撤纸面冻结判 FAIL（范式条款被尊重），找到的是范式的**真实结构洞**——行为等价是必要非充分（F-4：零代码变更也能全绿，提取未被证明）。v9 消解：

| ID | 级别 | 发现 | v9 消解 |
| --- | --- | --- | --- |
| F-1 | FATAL | replay 非自包含（/tmp 残留、占位符、noid 派生未定义） | 字面 argv 原样重放 + 规范路径预置表（fixture 放回收捕获时的精确 /tmp 路径——stdout 烙印逐字节一致 by construction）；std-no-ids 快照入库（免派生）；/tmp/nonexistent 守卫 |
| F-2 | FATAL | 字节等价不可复现（捕获时 temp 路径烙印 stdout；固定路径无清理协议） | 规范重放根 /tmp/c2-replay-v4 = capture 与 replay 同一路径（逐字节一致 by construction）+ 重放前置清空重建 |
| F-3 | FATAL | oracle 完整性未绑闸门（只 compare 无 replay 前置/基线守卫/断言守卫） | Milestone 固定命令六条：replay 自校验前置 → compare → check:ci → 基线零变更（fixturesSha256）→ 断言零改（git diff）→ build gate |
| F-4 | FATAL | 提取纪律无可判定证据（零代码变更也全绿——User Story 1 未验收） | 委托证明门 c2-structure-gate.sh：正向（三 action 含服务调用）+ 负向（被移编排定义消失）+ 服务 API smoke（tests/c2-services-smoke.test.ts 独立可调用） |
| M-1 | MAJOR | dry-run 无产物维度（偷写不可见） | manifest files 维度 + 重放后临时目录无额外文件断言 |
| M-2 | MAJOR | --timeout 15000 vs check:ci 裸 test 口径漂移 | 口径区分（15000 限直接调用行；check:ci 内部裸命令） |
| M-3 | MAJOR | build 行为无对照（结构门禁可漏 receipt/退出码漂移） | build 行为回归由既有 token-build 测试套件承载（零断言变更）——SPEC 明示 |
| M-4 | MAJOR | 纯净度 grep 不查传递依赖 | 精确化：服务源文件直接引用禁 + 传递 core 依赖允许（边界服务级）+ API smoke 证独立性 |
| m-1 | MINOR | 1300+ pass 漂移数字 | 钉当前值 1304（冻结后只增不减） |
| m-2 | MINOR | SETUp 拼写 + fixture 无哈希 | 修正 + fixturesSha256 入 manifest |
| ESCALATE | — | 绝对路径跨 worktree 复用需裁决 | 规范重放根策略即答案（同路径重建，无需跨 worktree 复用裁决） |

v9/v9.1 后 fresh FULL-9（修正轮 1）。

## FULL-9 发现存档（FAIL 4F/1M/3m，2026-11-13）→ Human 最终轮授权

F-1 四占位 argv（create-missing-id2 及协议表 <> 引用）→ 字面化 + 移除重复案；F-2 预置表补三项（b2/std 预置、c2-nodir-b2 与 c2-nonexistent 守卫）；F-3 断言守卫命令 exit 128 修正（FREEZE_SHA 冻结点 + 全历史 diff 过滤 + c2-* 白名单，无逃逸）；F-4 结构门入写边界 + 闸门⑦；M-1 全案显式 files 维度 + dry 零副作用断言；m-1 状态头 FULL-10；m-2 计数口径统一（35 = 34 重放 + 1 SETUP）；m-3 哈希算法定义。**v10 = Human 最终轮授权（再 FAIL 即闸门兜底收场）**，fresh FULL-10。

## FULL-10 发现存档（FAIL 3F/2M/0m，2026-11-13）→ **Human 最终轮授权兑现：闸门兜底收场**

轨迹定案：6→5→7→2→5→3→2→4→4→3（十轮）。FULL-10 审查实测确认重放机制大体可用（24 非 /tmp 案实跑与基线全符）。**FAIL 即兜底**：以下 5 项转为施工交付的 harness 实现要求（gate 实证验收清单，非纸面契约）：

| ID | 级别 | 发现 | gate 验收要求（harness 实现必须满足，闸门实跑验证） |
| --- | --- | --- | --- |
| F-1 | FATAL | 计数不闭合（34≠35 口径、orphan create-missing-id2 三件套残留） | harness 运行时校验 cases 数与口径自洽；孤儿基线文件清除或并入；compare 输出报告重放集完整性 |
| F-2 | FATAL | fixturesSha256 与声明的相对路径算法不符（declared b8225053/e1f3728d 为错误路径基；reviewer 复算 191ea2e5/0d84b5af 为正确值） | manifest 哈希按算法重算修正；闸门复算一致 |
| F-3 | FATAL | 断言守卫只比 commit 树（staged/unstaged 逃逸 + 无洁净树检查） | harness 断言守卫三态覆盖（worktree diff + staged + FREEZE_SHA 全历史）+ 洁净树前置检查 |
| M-1 | MAJOR | files 维度无统一 schema（[] vs 字符串混用；dry-run 偷写不可见） | 统一 files schema（期望路径列表 + 规范化规则）+ 重放后逐案文件维度断言 |
| M-2 | MAJOR | replay→compare 交接与陈旧路径清理为散文 | harness 内置 prereq 链（replay 成功记录 → compare 前置校验）+ 复制前 remove/type guard |

**SPEC v10 冻结（2026-11-13），C2 施工派遣（harness Task-1 先行 + 中期检查点）。**

## M1 闸门（PASS，2026-11-13）

主代理独立复验：structure gate PASS / build gate PASS（观测值 = SPEC 冻结数字）/ compare PASS（33 案四项）/ check:ci 1307 pass 0 fail（零断言变更）/ 边界零越界。ESCALATE（基线 manifest Biome 格式门冲突）裁定基线遗留，按 P1a 先例生成物边界排除修复（b334028）。检查点修复（rg→POSIX grep，ed52b59）已验证。**C2 M1 闸门通过，pruner → 集成。**

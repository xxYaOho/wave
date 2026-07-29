# DTCG 标准类型优化复盘

Date: 2026-07-29
Status: retrospective note
Audience: Wave maintainers and implementation agents

## 背景

本轮工作起于 Orca 的 `$type: stockStyle` 拼写债务，最终扩展为 DTCG 2025.10 全部标准类型的端到端支持。权威产品合同仍以以下文件为准：

- `docs/superpowers/specs/2026-07-29-dtcg-standard-types-design.md`
- `docs/superpowers/plans/2026-07-29-dtcg-standard-types.md`
- `docs/SPEC.md`

本文只记录执行复盘，不新增产品合同。

## 结论

如果任务只修正 `stockStyle -> border`，工作量应限于 Orca 三处 YAML、object leakage 防线和真实 smoke。本轮耗时增加的主要原因是范围升级为完整标准类型支持；执行中又较晚引入真实 Orca 验证，并出现计划验收与 consumer 配置不一致，产生额外诊断和复审。

完整 DTCG 类型支持不是类型名称列表。它横跨：

```text
schema
-> typed reference
-> resolver
-> transformer
-> JSON/JSONC/CSS/Sketch
-> integration / Quality Harness
-> real consumer smoke
```

## 必要复杂度

以下工作属于目标本身，不能通过减少测试或跳过分层来消除：

- 13 个标准类型具有不同的 primitive、dimension-like 和 closed-shape composite 合同。
- complete-token alias 需要比较 effective type；property-level reference 需要按字段合同验证。
- DTCG 标准输入、Wave dimension 简写、typography extensions 和平台限制必须分层表达。
- `none` color、odd dashArray、gradient 端点补全和 shadow inset 需要跨平台一致的 transformer 语义。
- JSON/JSONC、CSS 和 Sketch 的 payload 与失败语义不同，不能共用通用字符串 fallback。
- 既有 Wave 方言和 consumer 仍需兼容，但不能伪装成 DTCG 标准。

## 可避免的耗时

### 重复确认执行方式

handoff 已记录用户批准 `yes-subagents` 全自动里程碑门禁，不应再次询问执行方式。后续先读 handoff 的“建议技能”和授权状态，只在出现判断性合同缺口时暂停。

### 真实 consumer 验证过晚

Orca 的 `theme.font.size` 错把引用 rem dimension 的 token 声明为 `number`。该问题直到最终 `--profiles all` smoke 才暴露，导致额外 debugger、源数据修正和 gate。

后续在 typed-reference 里程碑完成后立即运行只读 Orca parse/canary。真实 consumer 不应只出现在最终验收。

### handoff 验收未完整进入测试计划

初版 M4 只有 unknown object formatter 单测，漏掉 handoff 已要求的 build 级 `stockStyle` 负向 fixture。critic-gate 因此阻断，随后补充了以下合同：

- build 错误包含 `theme.border.antline` 与 `stockStyle`；
- 已有 sentinel bytes 不变；
- 输出目录文件集合不变；
- 不产生 JSON/CSS/Sketch 部分产物。

从 handoff 形成计划时，应逐条映射 acceptance criteria 到 fixture、test 和 smoke，不能只按实现模块分任务。

### 计划未核对真实 `sketch.skip`

计划要求 Orca Sketch 正向输出 antline 的 `dashArray` 和 `lineCap`，但三处 antline 原本都有 `sketch.skip: true`。正确验收是 CSS 正向断言、Sketch 负向断言。删除 skip 才是范围外行为变化。

后续在批准 consumer 验收前，先核对实际 `$config.parameterGroup`、profile selection 和 token extensions。测试预期必须来自真实配置，不能只从目标类型推断。

### 验证层级重复

执行单元、主代理和 critic 在相邻提交间重复运行了部分测试。后续按以下层级安排：

1. 执行单元运行拥有文件对应的 focused tests、typecheck 和 diff check。
2. 主代理在里程碑末尾运行一次 focused aggregate。
3. 每个里程碑只运行一次完整 `pnpm check:ci`。
4. 直接验证无法覆盖隐藏合同风险时，再运行独立 critic-gate。
5. critic 修正只复跑受影响的 focused tests；production 发生变化时再补完整 gate。

## 推荐执行顺序

后续标准类型或引用合同变更按以下顺序推进：

1. 建立一张唯一验收矩阵：类型、schema phase、reference 语义、transformer 语义、各平台 payload、失败合同、fixture。
2. 先完成 schema 与 typed-reference，并运行仓库测试和真实 consumer 只读 canary。
3. 完成 transformer 后验证跨平台共享语义，不在 formatter 重复归一化。
4. 分平台完成 formatter focused tests。
5. 添加 hermetic 全类型 fixture、build 级负向 fixture 和 Quality Harness case。
6. 核对真实 consumer 配置后编写 smoke 断言。
7. 运行一次完整 repository gate，再执行真实 consumer smoke。
8. 独立 critic-gate 只审查仍无法由直接验证覆盖的合同风险。

## 本轮关键证据

- Wave repository gate：816 tests、0 fail；typecheck、manual/CLI build、Biome 通过。
- DTCG focused aggregate：302 tests、0 fail。
- `stockStyle` build 负向 integration：49 tests、0 fail。
- Orca full-profile smoke：7 profiles、14 个产物；目标 CSS 均输出 border shorthand、`4px 8px` 和 `lineCap: butt`；无 `[object Object]`。
- Orca 三份 Sketch 输出按原有 `sketch.skip: true` 跳过 antline。
- Wave M4 与 Orca consumer migration 的独立 critic-gate 最终均为 `STATUS: PASS`。

相关提交：

- `68fcab9 test(tokens): cover all DTCG standard types`
- `19f037a docs(tokens): document DTCG standard type support`
- `cac7c04 test(tokens): reject stockStyle composite builds`
- Orca `8334fe8 fix(tokens): align Orca with DTCG types`

## 后续使用

开始相邻任务前先判断目标属于哪一层：标准类型合同、Wave 方言、平台投影或 consumer 数据迁移。不要因为一个真实样本同时触发多层问题，就把这些职责混成一个实现点。

若任务从局部债务扩展为完整标准支持，先明确宣布范围变化并重估里程碑。局部修复可以快速完成；类型系统升级必须按端到端合同管理。

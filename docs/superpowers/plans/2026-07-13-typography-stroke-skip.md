# Typography、虚线边框与 Sketch 跳过输出实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `yes-subagents` 组织实现；每个里程碑完成后必须由 `critic-gate` 审查到 PASS。

**Goal:** 落地 typography defaults、DTCG dashArray、Sketch 倍率行高与 token-following Sketch skip，同时保持既有输出兼容。

**Architecture:** schema 固化输入契约，resolver 解析 group extension 引用，transformer 只生成跨 formatter 的内部 metadata/value，平台差异分别留在 CSS 与 Sketch formatter。实现按 typography、Sketch skip、dashArray 三个端到端行为切片推进，最后用持久 fixture、真实 orca 与文档收尾；每个里程碑都产生可独立验证的完整行为。

**Tech Stack:** TypeScript strict ESM、Bun test、pnpm、现有 Wave resolver/transformer/generator。

---

## Milestone 1：Typography defaults 与平台字体/行高

### Task 1：锁定 typography schema 与 group extension resolver

**Files:**

- Modify: `tests/theme-schema.test.ts`
- Modify: `src/core/schema/theme.ts`
- Create: `src/core/typography-value.ts`
- Modify: `src/core/pipeline/theme-pipeline.ts`
- Modify: `src/core/doctor/theme-context.ts`
- Modify: `src/core/resolver/reference-token-external.ts`
- Modify: `src/core/resolver/reference-token-internal.ts`
- Modify: `src/core/resolver/reference-token-scan.ts`
- Modify: `tests/resource-resolver.test.ts`
- Modify: `tests/extends-resolver.test.ts`
- Modify: `tests/doctor-theme-context.test.ts`
- Modify: `tests/integration/theme-service.test.ts`

- [ ] 先写失败测试：defaults 仅允许五字段；token value 允许五字段加 legacy `color` 且其他字段错误；token/非 typography group 使用 defaults 错误；无本地 type 的 `$extends` group 在展开后按有效 type 判断。
- [ ] 先写 resolver 失败测试：group defaults 的 external/internal 引用、完整错误路径、残留引用与循环耗尽。
- [ ] raw schema 对 `$extends` 待定 type 延后判断；build 与 doctor 都在 `expandExtends()`、`resolveReferences()` 后执行 resolved schema error validation，避免合法继承被误拒绝并拒绝引用解析后的非法值。
- [ ] group `$extensions` 走与 token extension 相同的 nested external/internal resolver，并进入 `groupHasInternalReferences()` 与 `collectInternalReferences()`。
- [ ] 明确锁定 `$extends` 现有 namespace 整体覆盖：derived `typography` 替换 base `typography`，不做特例深合并。
- [ ] 在 `src/core/typography-value.ts` 提供 schema/transformer 共用的 defaults 浅合并、token override 与 missing required fields helper；parity tests 覆盖 nested group、显式 override、`$extends`。
- [ ] 运行 `bun test tests/theme-schema.test.ts tests/resource-resolver.test.ts tests/extends-resolver.test.ts`。

### Task 2：materialize typography defaults

**Files:**

- Modify: `src/types/index.ts`
- Modify: `src/core/transformer/theme-transformer.ts`
- Modify: `tests/transform-to-wave-tokens.test.ts`
- Modify: `tests/format-flat.test.ts`

- [ ] 将 `WaveTypographyValue.fontFamily` 扩为 `string | string[]`，新增 `TypographyDefaults` 内部类型。
- [ ] 先写失败测试：祖先/最近 group defaults 浅合并、token `$value` 胜出、非 typography 不应用、JSON/JSONC 输出 materialized value；legacy `color` 被保留但 CSS/Sketch 忽略；合并后五个必填字段缺一时报 token path。
- [ ] walker 继承 `typographyDefaults`；调用共享 helper，仅向有效 type 为 typography 且 `$value` 为 object 的 token浅合并；transformer 的完整性检查是绕过 schema API 时的防御性断言。
- [ ] resolved tree 保持 token 原始 `$value`，`WaveToken.value` 和所有生成格式使用合并结果。
- [ ] 运行 transformer 与 flat formatter 测试。

### Task 3：CSS font stack 与 Sketch 数值 typography

**Files:**

- Modify: `src/core/generator/formats/css.ts`
- Modify: `src/core/generator/formats/sketch.ts`
- Modify: `tests/format-css.test.ts`
- Modify: `tests/format-sketch.test.ts`
- Modify: `src/core/generator/token-generator.ts`
- Modify: `tests/token-generator.test.ts`

- [ ] 先写失败测试：数组 stack quoting/escaping/非法成员与控制字符、大小写不敏感 CSS-wide keyword quoting、字符串兼容；PingFang 优先、大小写 alias 过滤、首个 concrete fallback。
- [ ] 先写 typography 全字段失败测试：family trim 后非空且拒绝 C0/C1/DEL；fontSize/lineHeight/letterSpacing 只接受无单位、px、pt；统一 numeric string grammar拒绝加号/科学计数法/NaN/Infinity；fontSize/weight/lineHeight 有限正值；letterSpacing 有限且可为负；对象不得落入 `String(value)`。
- [ ] 先写 lineHeight 失败测试：defaults 提供 fontSize、number/string/`{value,unit}` fontSize、unitless multiplier、绝对 lineHeight、非法 multiplier/绝对值、缺 fontSize 错误、3 位小数。
- [ ] CSS 数组 family 去除一层配对引号、统一转义并以 `, ` 连接；simple identifier 裸输出但 CSS-wide keywords 强制加引号；字符串保持现有行为。
- [ ] CSS typography 使用 field-aware formatter：unitless fontSize/非零 letterSpacing 补 px，零 spacing 为 0，lineHeight multiplier 与 fontWeight 保持 unitless；回归覆盖旧的无效 CSS 被修正。
- [ ] Sketch 数组 family 先找 `PingFang SC`，否则选首个 concrete；只有 aliases 时省略 family。
- [ ] Sketch unitless lineHeight 乘 materialized fontSize；带单位取绝对数值；不可计算时抛含 token path 的错误。
- [ ] token generator 先收集所有目标平台的 `{ filename, out }`，全部 formatter 成功后才写输出文件；允许上层已创建空目录。测试 Sketch formatter 失败时 JSON/CSS 均未被新内容覆盖。
- [ ] 运行 `bun test tests/theme-schema.test.ts tests/resource-resolver.test.ts tests/extends-resolver.test.ts tests/doctor-theme-context.test.ts tests/integration/theme-service.test.ts tests/transform-to-wave-tokens.test.ts tests/format-flat.test.ts tests/format-css.test.ts tests/format-sketch.test.ts tests/token-generator.test.ts`；schema、build、doctor 都断言缺字段与解析后非法值错误。

### Milestone 1 Gate

- [ ] 运行 typography 的 schema/resolver/transformer/flat/CSS/Sketch tests 与 `pnpm typecheck`。
- [ ] 派遣 `critic-gate`，核验 typography 从输入到四种输出的完整行为；必须 `STATUS: PASS` 才进入 Milestone 2。
- [ ] 原子提交：`feat(dt): add inherited typography defaults`。

## Milestone 2：Sketch-only skip

### Task 4：完成 skip schema、继承与发射过滤

**Files:**

- Modify: `src/types/index.ts`
- Modify: `src/core/schema/theme.ts`
- Modify: `src/core/transformer/sketch-extension.ts`
- Modify: `src/core/transformer/theme-transformer.ts`
- Modify: `src/core/generator/formats/sketch.ts`
- Modify: `tests/sketch-extension-schema.test.ts`
- Modify: `tests/sketch-extension-transformer.test.ts`
- Modify: `tests/sketch-extension-format.test.ts`
- Modify: `tests/token-generator.test.ts`

- [ ] 先写失败测试：group/token boolean schema；group `skip:true` 继承；最近 group/token `skip:false` 恢复；composite child；path/property 兼容。
- [ ] 锁定 `$extends` 现有 sketch namespace 整体覆盖，避免误写成字段深合并。
- [ ] 扩展 `SketchExtension` 为 `skip?: boolean`，且 parser 必须保留显式 `false`。
- [ ] walker 继承 `sketchSkip`，token 显式值覆盖 inherited value。
- [ ] Sketch formatter 保留完整 `allTokens` 供 sibling/dependency 查询，只从 emission list 排除 skip token；过滤发生在 path/duplicate 检查前。
- [ ] 证明同一 token 在 CSS/JSON/JSONC 中仍存在，仅 Sketch 缺失；skip token 仍可作为 `inheritColor.siblingSlot` 来源。
- [ ] 运行所有 Sketch extension 与 token generator tests。

### Milestone 2 Gate

- [ ] 运行 Sketch extension schema/transformer/formatter/integration tests 与 `pnpm typecheck`。
- [ ] 派遣 `critic-gate`，核验继承优先级、显式 false、既有 Sketch metadata 兼容；必须 `STATUS: PASS`。
- [ ] 原子提交：`feat(dt): add token-following sketch skip`。

## Milestone 3：DTCG dashArray

### Task 5：完成 stroke-style schema、CSS 与 Sketch 输出

**Files:**

- Modify: `src/core/schema/theme.ts`
- Modify: `src/core/generator/formats/css.ts`
- Modify: `tests/format-css.test.ts`
- Modify: `tests/theme-schema.test.ts`
- Modify: `tests/format-sketch.test.ts`
- Modify: `tests/doctor-theme-context.test.ts`
- Modify: `tests/integration/theme-service.test.ts`

- [ ] 先写 schema 失败测试：字符串 style 兼容；非空且至少一个正值的 dashArray；number/alias/`{value,unit}`/length string；单位仅 `px|pt|rem|em|%`；负数、全零、NaN、科学计数法、空数组、非法成员拒绝。
- [ ] 先写 CSS 失败测试：无单位按 px、零为 0、显式/混合单位保留、dashed shorthand、companion variable、非法对象不字符串化、companion/真实 token key 冲突报错。
- [ ] 增加 border stroke-style 局部 validator，raw schema 允许引用，resolved schema 验证最终成员；测试引用解析为负数/非法对象时 build 与 doctor 同步失败。
- [ ] border formatter 返回结构化主值和 companion；预计算输出 key 集合并拒绝 reserved companion collision。
- [ ] Sketch 普通 border 继续从完整 token value 输出 `{ value: { style: { dashArray } } }`，不做 CSS 有损转换。
- [ ] 运行 schema、CSS、Sketch tests。

### Milestone 3 Gate

- [ ] 运行 border schema/CSS/Sketch/integration tests 与 `pnpm typecheck`。
- [ ] 派遣 `critic-gate`，核验 dashArray 端到端行为和字符串 style 兼容；必须 `STATUS: PASS`。
- [ ] 原子提交：`feat(dt): support dashed border stroke styles`。

## Milestone 4：持久回归、手册与全量验证

### Task 6：持久集成 fixture

**Files:**

- Modify: `tests/fixtures/themes/orca-realistic/main.yaml`
- Modify: `tests/integration/theme-service.test.ts`

- [ ] 将数组 fontFamily、defaults 引用、倍率/绝对 lineHeight、group skip + token false、dashArray 内化到持久 fixture。
- [ ] 贯穿 YAML → raw schema → expand → resolve → resolved schema → transformer → JSON/CSS/Sketch，断言四个平台合同。
- [ ] 运行集成测试并确认 fixture 不依赖用户目录。
- [ ] 原子提交：`test(dt): cover orca typography and border output`。

### Task 7：补齐用户说明和行为快照

**Files:**

- Modify: `manual/pages/design-token.md`
- Modify: `docs/SPEC.md`
- Modify as required: `tests/manual-loader.test.ts`
- Modify as required: `tests/manual-app.test.ts`

- [ ] 在现有未提交 manual 改动上增量编辑，不覆盖用户已有内容。
- [ ] 记录 `typography.defaults`、`sketch.skip`、倍率/绝对 lineHeight、fontFamily 平台差异和 dashArray CSS companion variable。
- [ ] 在 `docs/SPEC.md` 只补内部行为快照，不复制整份用户说明。
- [ ] 运行 manual tests 与 `pnpm manual:build`。
- [ ] 不自动 stage 现有 16 行 manual hunk；若执行提交，仅 stage 本轮新增 hunk，最终汇报保留的未提交内容。

### Task 8：真实 orca 验证与完整回归

**Files:**

- Runtime fixture: `/Users/teatao/Projects/my-color/orca/main.yaml`（只读，不修改）
- Generated temporary output: `.tmp/orca-*`

- [ ] 用当前 orca 输入执行 `pnpm dev -- dt build -f /Users/teatao/Projects/my-color/orca/main.yaml -o .tmp/orca-verify`。
- [ ] 断言生成 CSS 不含 `[object Object]`，包含 `--border-antline-dash-array: 4px 8px`，Sketch 保留 antline 结构。
- [ ] defaults、倍率 lineHeight 和 `sketch.skip` 以持久 `orca-realistic` fixture 为回归真相；不修改用户的 orca 源文件。
- [ ] 运行 `bun test`、`pnpm typecheck`、受影响文件的 Biome check、`pnpm manual:build`。
- [ ] 清理 `.tmp/orca-*`。

### Milestone 4 Gate

- [ ] 派遣最终 `critic-gate`，核验真实输出、测试、文档与 approved design 一致；必须 `STATUS: PASS`。
- [ ] 文档原子提交：`docs(dt): document typography and platform output controls`；fixture/integration 已在独立 `test(dt)` 提交中完成。

## 完成标准

- 所有四个里程碑均有独立 `critic-gate STATUS: PASS`。
- orca CSS 中不再出现 `[object Object]`。
- typography defaults、Sketch 字体选择、倍率行高和 token-local skip 均有 schema/transformer/formatter 回归测试。
- CSS、JSON/JSONC、Sketch 的职责边界没有交叉污染。

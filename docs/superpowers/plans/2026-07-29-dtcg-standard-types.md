# DTCG Standard Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Wave 补齐 DTCG 2025.10 全部标准类型的输入、引用、归一化和 JSON/JSONC、CSS、Sketch 输出合同，同时移除伪 `opacity` 类型并修复 Orca 的 `stockStyle` 拼写债务。

**Architecture:** 保持 `parser -> raw schema -> extends -> typed reference validation -> resolution -> resolved schema -> transformer -> formatter` 分层。共享值合同放在 `src/core/token-values/`，schema 只负责标准值与 Wave 明示方言，transformer 统一物化跨平台语义，formatter 只处理平台投影与平台限制。未知自定义标量继续兼容，未知 object/array 在 CSS 输出前明确失败。

**Tech Stack:** TypeScript strict、ESM、Bun test、pnpm、Changesets、YAML fixtures。

---

## File Map

**新增文件**

- `src/core/token-values/dimension.ts`：统一解析、验证和格式化 standard/Wave dimension。
- `src/core/token-values/duration.ts`：DTCG duration 解析、验证和规范化。
- `src/core/token-values/font-weight.ts`：标准 fontWeight 名称、别名和数值映射。
- `src/core/token-values/stroke-style.ts`：标准 strokeStyle 校验及 odd dashArray 物化。
- `src/core/token-values/composites.ts`：border、transition、shadow、gradient、typography closed-shape 校验。
- `src/core/schema/dtcg-reference-types.ts`：完整 token alias 的 effective type 与目标类型校验。
- `tests/token-values.test.ts`：共享 primitive helper 的独立值合同。
- `tests/dtcg-reference-types.test.ts`：curly alias 与 JSON Pointer typed-reference 回归。
- `tests/fixtures/themes/dtcg-standard-types/main.yaml`：标准类型端到端 fixture。
- `.changeset/<generated-name>.md`：本次用户可见行为变更。

**主要修改文件**

- `src/types/index.ts`：补齐标准 value 类型，移除 token-type `opacity` 声明。
- `src/core/schema/theme.ts`：补齐 `KNOWN_TYPES`、分阶段值校验及 closed-shape composite 合同。
- `src/core/stroke-style.ts`：改为复用共享 strokeStyle helper，接受 `lineCap`。
- `src/core/typography-value.ts`：复用 dimension/fontWeight helper，保留 Wave typography 方言。
- `src/core/pipeline/theme-pipeline.ts`：在 extends 后、resolution 前执行 typed-reference 校验。
- `src/core/resolver/reference-{resolution,token-processor,value-internal,value-shared}.ts`：覆盖 internal/external 两 pass，并保留单元素 composite reference 语义。
- `src/core/transformer/{theme-transformer,color-value}.ts`：标准值归一化、nested composite color、gradient 和 dash 物化、`none` fallback。
- `src/core/generator/formats/{flat,css,sketch,utils}.ts`：锁定三平台 payload 与失败语义。
- `src/core/generator/token-generator.ts`：将新增 companion key 纳入碰撞预检，保持 format-before-write。
- `tests/{theme-schema,theme-transformer,color-value,color-space,format-flat,format-css,format-sketch,token-generator}.test.ts`：分层回归。
- `tests/integration/theme-service.test.ts`、`tests/quality-harness.test.ts`：fixture 端到端合同。
- `tests/fixtures/themes/orca-realistic/main.yaml`：使用合法 `border` antline fixture。
- `benchmarks/design-token/cases.ts`：注册全标准类型 Quality Harness case。
- `docs/SPEC.md`、`manual/pages/design-token-{main-yaml,color-typography,extensions-output}.md`：内部合同与用户手册同步。

**跨仓修改，最后单独执行**

- `/Users/teatao/Projects/my-color/orca/main.yaml`
- `/Users/teatao/Projects/my-color/orca/profiles/viz-jzy.yaml`
- `/Users/teatao/Projects/my-color/orca/profiles/example_viz.yaml`

## Milestone 1: 输入与引用合同

### Task 1: 建立共享 primitive value helpers

**Files:**
- Create: `src/core/token-values/dimension.ts`
- Create: `src/core/token-values/duration.ts`
- Create: `src/core/token-values/font-weight.ts`
- Create: `src/core/token-values/stroke-style.ts`
- Modify: `src/core/stroke-style.ts`
- Modify: `src/core/typography-value.ts`
- Test: `tests/token-values.test.ts`

- [ ] **Step 1: 写 dimension、duration、fontWeight 和 strokeStyle helper 的失败测试**

  覆盖：标准 `{ value, unit: px|rem }`；Wave 裸 number、numeric string、`px|rem|pt|em|%`；duration 只允许 `ms|s`；fontWeight 全部标准别名；strokeStyle object 必含 `dashArray` 与 `lineCap`，但 schema 不拒绝负数或全零 dash。

  ```ts
  expect(parseDimension(8, { defaultUnit: 'px' })).toEqual({
    ok: true, value: { value: 8, unit: 'px' },
  });
  expect(parseDuration({ value: 200, unit: 'px' }).ok).toBe(false);
  expect(normalizeFontWeight('demi-bold')).toEqual({ ok: true, value: 600 });
  ```

- [ ] **Step 2: 运行 focused tests，确认新合同尚未满足**

  Run: `bun test tests/token-values.test.ts`

  Expected: FAIL；helper 尚不存在或旧 strokeStyle helper 拒绝 `lineCap`。

- [ ] **Step 3: 实现共享 helper API**

  每个 helper 返回 discriminated result，不抛失去 path 的裸错误：

  ```ts
  type ParseResult<T> =
    | { ok: true; value: T }
    | { ok: false; message: string };

  parseDimension(value, options)
  parseDuration(value)
  normalizeFontWeight(value)
  normalizeStrokeStyle(value)
  ```

  dimension 默认单位只在 normalize 阶段补为 `px`；duration 不复用 dimension；typography `lineHeight` 继续走独立 `number | px | pt | rem` 分支。

- [ ] **Step 4: 让旧 helper 委托到新 helper，不复制规则**

  `src/core/stroke-style.ts` 保留现有 export surface；`src/core/typography-value.ts` 复用 dimension/fontWeight parser，但保留 defaults、baseFontSize 和 lineHeight 方言。

- [ ] **Step 5: 运行 focused tests**

  Run: `bun test tests/token-values.test.ts && pnpm typecheck`

  Expected: PASS。

- [ ] **Step 6: 提交 primitive helpers**

  ```bash
  git add src/core/token-values src/core/stroke-style.ts src/core/typography-value.ts tests/token-values.test.ts
  git commit -m "feat(tokens): add standard primitive value contracts"
  ```

### Task 2: 补齐标准类型 schema 与 closed-shape composites

**Files:**
- Create: `src/core/token-values/composites.ts`
- Modify: `src/types/index.ts`
- Modify: `src/core/schema/theme.ts`
- Test: `tests/theme-schema.test.ts`

- [ ] **Step 1: 写 `KNOWN_TYPES` 与 opacity removal 回归**

  精确断言 `fontWeight`、`duration`、`strokeStyle`、`transition` 无 warning；`$type: opacity` 变为 unknown warning，但 `inheritColor.opacity` 与 `$extensions.sketch.property.opacity` 仍合法。

- [ ] **Step 2: 写所有 standard composite 的 raw/resolved 失败矩阵**

  覆盖 border、transition、shadow、gradient、typography：必填字段、optional 字段、额外字段、子值类型、raw 引用占位、resolved concrete value。typography 仅额外允许 Wave `color` 与 `px|pt|rem` lineHeight；shadow 仅额外允许 `inset`。

  ```ts
  const result = validateThemeSchema({ theme: { bad: {
    $type: 'border',
    $value: { color: '#000', width: '1px', style: 'solid', extra: true },
  } } }, 'resolved');
  expect(result.issues.some((issue) => issue.path.endsWith('.extra'))).toBe(true);
  ```

  同时为 standalone dimension、duration、fontWeight、strokeStyle 写 schema 接线测试；这些测试只在本 Task 引入并通过。

- [ ] **Step 3: 运行 schema tests，确认失败**

  Run: `bun test tests/theme-schema.test.ts`

  Expected: FAIL；当前 schema 接受额外字段或漏报新增类型。

- [ ] **Step 4: 实现 phased standard value validation**

  `raw` 阶段允许完整 value reference；`resolved` 阶段要求具体值。所有 composite 使用 allowlist 检查 authored keys；内部 `_swatchName` 仅在 resolved cleanup/validation 的明确 metadata allowlist 中接受，不成为 authored standard 字段。

- [ ] **Step 5: 扩充 TypeScript value types并移除 token opacity type**

  仅移除代表 `$type: opacity` 的类型声明；不删除 `WaveToken.inheritColorOpacity` 或 Sketch property opacity。

- [ ] **Step 6: 运行 schema 与 typecheck**

  Run: `bun test tests/theme-schema.test.ts && pnpm typecheck`

  Expected: PASS。

- [ ] **Step 7: 提交 standard schema**

  ```bash
  git add src/types/index.ts src/core/schema/theme.ts src/core/token-values/composites.ts tests/theme-schema.test.ts
  git commit -m "feat(tokens): validate DTCG standard token types"
  ```

### Task 3: 验证 typed complete-token references

**Files:**
- Create: `src/core/schema/dtcg-reference-types.ts`
- Modify: `src/core/pipeline/theme-pipeline.ts`
- Modify: `src/core/resolver/reference-resolution.ts`
- Modify: `src/core/resolver/reference-token-processor.ts`
- Modify: `src/core/resolver/reference-value-internal.ts`
- Modify: `src/core/resolver/reference-value-shared.ts`
- Test: `tests/dtcg-reference-types.test.ts`
- Test: `tests/integration/theme-service.test.ts`

- [ ] **Step 1: 写 effective type 与 target type 的失败测试**

  覆盖显式 token `$type`、父 group `$type`、内部/外部 curly complete-token alias、内部/外部 JSON Pointer whole-token `$ref`；`border.style -> strokeStyle` 合法，`border.style -> duration` 必须失败。外部 resource 中 `$type: number` 的 `700` 不能被 `$type: fontWeight` consumer 仅凭 shape 接受。

- [ ] **Step 2: 写 array composite reference 语义测试**

  shadow/gradient 数组中的 `$ref` 只替换一个成员；引用数组导致嵌套数组时失败，不 flatten。

- [ ] **Step 3: 运行 reference tests，确认失败**

  Run: `bun test tests/dtcg-reference-types.test.ts tests/integration/theme-service.test.ts`

  Expected: FAIL；当前 resolver 只依赖 resolved shape。

- [ ] **Step 4: 实现 pre-resolution complete-token type validator**

  在 `expandExtends()` 后、`resolveReferences()` 前遍历 effective token graph。validator 同时接收 expanded tree 与 dependency sources，解析内部/外部 curly alias 和 JSON Pointer whole-token reference，比较 source effective type 与 target effective type；property-level `$ref` 留给 resolved schema 按字段合同验证。

- [ ] **Step 5: 保留单元素 composite reference provenance**

  在 `reference-resolution.ts` 统一持有 provenance side-table，并由 external/internal `reference-token-processor` 两 pass 传递；不得向 `WaveToken` 或任何 formatter 泄漏字段，也不得把数组引用 flatten。

- [ ] **Step 6: 运行 reference、schema 和 integration tests**

  Run: `bun test tests/dtcg-reference-types.test.ts tests/theme-schema.test.ts tests/integration/theme-service.test.ts`

  Expected: PASS；错误包含 consumer path、expected type、target path 和 actual type。

- [ ] **Step 7: 提交 typed references**

  ```bash
  git add src/core/schema/dtcg-reference-types.ts src/core/pipeline/theme-pipeline.ts src/core/resolver/reference-resolution.ts src/core/resolver/reference-token-processor.ts src/core/resolver/reference-value-internal.ts src/core/resolver/reference-value-shared.ts tests/dtcg-reference-types.test.ts tests/integration/theme-service.test.ts
  git commit -m "fix(tokens): enforce typed token references"
  ```

## Milestone 2: 跨平台语义归一化

### Task 4: 归一化 primitive、strokeStyle 与 nested composites

**Files:**
- Modify: `src/core/transformer/theme-transformer.ts`
- Modify: `src/core/typography-value.ts`
- Test: `tests/theme-transformer.test.ts`

- [ ] **Step 1: 写规范化失败测试**

  锁定：`dimension 8 -> "8px"`、fontWeight alias -> number、duration 保留单位、odd dashArray 重复一次、border/transition/shadow/typography 子字段递归归一化。

  ```ts
  expect(findToken(tokens, 'theme-line-ant').value).toEqual({
    dashArray: ['4px', '8px', '4px', '8px'],
    lineCap: 'butt',
  });
  ```

- [ ] **Step 2: 运行 transformer tests，确认失败**

  Run: `bun test tests/theme-transformer.test.ts`

  Expected: FAIL；当前 `processValue()` 对任意 `{ value, unit }` 泛化且未覆盖全部 nested field。

- [ ] **Step 3: 按 effective type 分派值归一化**

  移除“任何 `{value, unit}` 都转 string”的泛化判断。standalone 与 nested 字段都调用同一 helper；duration 保持独立；typography lineHeight 保持标准 number 或 Wave `px|pt|rem`。

- [ ] **Step 4: 实现 odd dashArray 与 nested field 物化**

  奇数数组使用 `normalized.concat(normalized)`；不改变偶数数组。border style、shadow dimensions、transition duration/delay/timingFunction 递归处理。

- [ ] **Step 5: 运行 transformer 与 typecheck**

  Run: `bun test tests/theme-transformer.test.ts && pnpm typecheck`

  Expected: PASS。

- [ ] **Step 6: 提交 transformer primitives**

  ```bash
  git add src/core/transformer/theme-transformer.ts src/core/typography-value.ts tests/theme-transformer.test.ts
  git commit -m "feat(tokens): normalize standard token values"
  ```

### Task 5: 完成 DTCG color `none` 与 composite color slots

**Files:**
- Modify: `src/core/transformer/color-value.ts`
- Modify: `src/core/transformer/theme-transformer.ts`
- Modify: `src/types/index.ts`
- Test: `tests/color-value.test.ts`
- Test: `tests/color-space.test.ts`
- Test: `tests/theme-transformer.test.ts`

- [ ] **Step 1: 写 `none`、optional hex 与 transformer 保留矩阵**

  覆盖可转换时输出 canonical string、`none` 使用合法 `hex` fallback、无 fallback 时保留 clean DTCG object。平台失败不属于本 Task，分别在 flat/CSS/Sketch formatter Task 验证。

- [ ] **Step 2: 写 border、shadow、gradient、typography color slot 递归测试**

  同一规则必须作用于 standalone color 和所有 composite color field，不能只修 standalone。

- [ ] **Step 3: 运行 color tests，确认失败**

  Run: `bun test tests/color-value.test.ts tests/color-space.test.ts tests/theme-transformer.test.ts`

  Expected: FAIL；当前 `none` 无 fallback 会在 transformer 提前失败。

- [ ] **Step 4: 将颜色归一化结果表示为可转换 string 或 clean DTCG object**

  clean object 仅含 `colorSpace`、`components`、optional `alpha`、optional `hex`。不得保留 `_swatchName` 等内部 metadata。

- [ ] **Step 5: 为 formatter 保留目标 colorSpace 上下文**

  transformer 不因 JSON/JSONC 可保留的标准 color object 失败。扩充 `WaveToken` internal metadata 为 `_targetColorSpace`，由 `transformToWaveTokens()` 在无法转换而保留 object 的 standalone/composite token 上写入；flat formatter 不输出该 metadata，CSS/Sketch 用它构造包含 target colorSpace 的平台错误。

- [ ] **Step 6: 运行 color、transformer 与 typecheck**

  Run: `bun test tests/color-value.test.ts tests/color-space.test.ts tests/theme-transformer.test.ts && pnpm typecheck`

  Expected: PASS。

- [ ] **Step 7: 提交 color contract**

  ```bash
  git add src/types/index.ts src/core/transformer/color-value.ts src/core/transformer/theme-transformer.ts tests/color-value.test.ts tests/color-space.test.ts tests/theme-transformer.test.ts
  git commit -m "feat(tokens): support DTCG none color components"
  ```

### Task 6: 物化 gradient endpoint 与 shadow inset

**Files:**
- Modify: `src/core/transformer/theme-transformer.ts`
- Test: `tests/theme-transformer.test.ts`

- [ ] **Step 1: 写 gradient clamp 与端点失败测试**

  覆盖 `<0 -> 0`、`>1 -> 1`、缺 0/1 时复制最近颜色、单 stop 物化为同色双端点；输出顺序稳定。

- [ ] **Step 2: 写 shadow `inset` 保留测试**

  transformer 后 value 必须保留显式 true/false；缺省时不擅自增加 authored field。

- [ ] **Step 3: 运行 transformer tests，确认失败**

  Run: `bun test tests/theme-transformer.test.ts`

  Expected: FAIL。

- [ ] **Step 4: 在 transformer 实现平台无关物化**

  formatter 后续不重复 clamp/补端点；本 Task 只负责生成已规范化的至少双 stop 数组。

- [ ] **Step 5: 运行 tests**

  Run: `bun test tests/theme-transformer.test.ts`

  Expected: PASS。

- [ ] **Step 6: 提交 composite materialization**

  ```bash
  git add src/core/transformer/theme-transformer.ts tests/theme-transformer.test.ts
  git commit -m "feat(tokens): materialize gradient and shadow semantics"
  ```

## Milestone 3: 平台 formatter

### Task 7: 锁定 JSON 与 JSONC payload

**Files:**
- Modify: `src/core/generator/formats/flat.ts`
- Test: `tests/format-flat.test.ts`

- [ ] **Step 1: 写设计规格平台矩阵的精确 output tests**

  每个 standard type 各一条 JSON 与 JSONC assertion。dimension 及所有 composite dimension slot 输出带单位 string；shadow 的 `0px` 保留为 `"0px"`；unknown custom object/array 原值保留；含 `none` 且无 fallback 的 standalone/nested color 保留 clean DTCG object，且不输出 `_targetColorSpace`。

- [ ] **Step 2: 运行 flat tests，确认失败**

  Run: `bun test tests/format-flat.test.ts`

  Expected: FAIL；当前 shadow 会移除单位。

- [ ] **Step 3: 删除 shadow `0px` 特判并按规范化 value 序列化**

  flat formatter 不再次推断 token type，不重写 transformer 已规范化的 composite shape。

- [ ] **Step 4: 运行 flat tests**

  Run: `bun test tests/format-flat.test.ts`

  Expected: PASS。

- [ ] **Step 5: 提交 flat formatters**

  ```bash
  git add src/core/generator/formats/flat.ts tests/format-flat.test.ts
  git commit -m "feat(tokens): emit standard flat token payloads"
  ```

### Task 8: 完成 CSS standard formatters 与 companion collision

**Files:**
- Modify: `src/core/generator/formats/css.ts`
- Modify: `src/core/generator/formats/utils.ts`
- Test: `tests/format-css.test.ts`
- Test: `tests/token-generator.test.ts`

- [ ] **Step 1: 写 scalar formatter tests**

  锁定 duration `200ms`、cubicBezier `cubic-bezier(...)`、fontWeight number、fontFamily CSS quoting/escaping、空 family 平台失败。

- [ ] **Step 2: 写 composite formatter tests**

  锁定 strokeStyle 主变量及 `-dash-array`/`-line-cap`、border shorthand 及两个 companion、transition 顺序、shadow inset、gradient 百分比、typography 既有 companions。

- [ ] **Step 3: 写平台限制和 unknown composite guard tests**

  字段级负数合同按设计规格执行。unknown scalar 继续输出；unknown object/array 抛错，错误含 path、type、shape，且输出不含 `[object Object]`。含 `none` color 在 CSS Color 4 可表达时输出；不可表达时错误含 token path、`css`、`_targetColorSpace` 和原因。

- [ ] **Step 4: 写 companion collision 与 no-write sentinel tests**

  主变量、`-dash-array`、`-line-cap` 都参与真实 token key collision。预先在目标文件写 sentinel；格式化或碰撞失败后 hash 不变，证明单次 generation 没有部分写入。

- [ ] **Step 5: 运行 CSS/generator tests，确认失败**

  Run: `bun test tests/format-css.test.ts tests/token-generator.test.ts`

  Expected: FAIL；当前 fallback 执行 `String(tokenValue)`，且 line-cap 未参与 companion 输出/碰撞。

- [ ] **Step 6: 实现 type-directed CSS formatter**

  `formatTokenValue()` 的最终 fallback 只接受 `string | number | boolean | null`；object/array 抛平台错误。standard composite 必须在 fallback 前全部消费。

- [ ] **Step 7: 扩充 CSS companion reservation 并验证 format-before-write**

  companion key reservation 保持在 `css.ts`，因为只有 CSS formatter 掌握 filterLayer 后的真实 key。`token-generator.ts` 不新增 reservation 抽象，仅用现有 generation test 证明其继续先格式化全部 pending output 再写盘。

- [ ] **Step 8: 运行 CSS/generator/typecheck**

  Run: `bun test tests/format-css.test.ts tests/token-generator.test.ts && pnpm typecheck`

  Expected: PASS。

- [ ] **Step 9: 提交 CSS formatters**

  ```bash
  git add src/core/generator/formats/css.ts src/core/generator/formats/utils.ts tests/format-css.test.ts tests/token-generator.test.ts
  git commit -m "feat(tokens): format standard CSS token types"
  ```

### Task 9: 完成 Sketch standard payload

**Files:**
- Modify: `src/core/generator/formats/sketch.ts`
- Test: `tests/format-sketch.test.ts`

- [ ] **Step 1: 写所有 standard type 的 exact payload tests**

  generic 类型使用 `{ value }`；strokeStyle 保留 dashArray/lineCap；border 保留 color reference、width/style；transition 使用规范化 object；shadow 输出 `inset`；gradient 输出已物化双端点。

- [ ] **Step 2: 写不可表达 dimension/color 的平台失败测试**

  generic dimension 可保留明确单位 string；映射到 Sketch 数值属性的 `em|rem|%` 在无既有 conversion contract 时失败。含 `none` 的 color 无 hex fallback 时失败，错误包含 token path、`sketch`、`_targetColorSpace` 和原因。

- [ ] **Step 3: 运行 Sketch tests，确认失败**

  Run: `bun test tests/format-sketch.test.ts`

  Expected: FAIL；当前 shadow 丢 inset，generic structured payload 未锁定。

- [ ] **Step 4: 实现 type-directed Sketch payload**

  复用规范化 value；不套用 CSS fallback，不声称下游 Sync Token 已消费新增 generic payload。

- [ ] **Step 5: 运行 Sketch tests 与 typecheck**

  Run: `bun test tests/format-sketch.test.ts && pnpm typecheck`

  Expected: PASS。

- [ ] **Step 6: 提交 Sketch formatters**

  ```bash
  git add src/core/generator/formats/sketch.ts tests/format-sketch.test.ts
  git commit -m "feat(tokens): emit standard Sketch token payloads"
  ```

## Milestone 4: 集成、文档与 Orca

### Task 10: 添加全标准 fixture 与 quality harness

**Files:**
- Create: `tests/fixtures/themes/dtcg-standard-types/main.yaml`
- Modify: `tests/fixtures/themes/orca-realistic/main.yaml`
- Modify: `benchmarks/design-token/cases.ts`
- Modify: `tests/integration/theme-service.test.ts`
- Modify: `tests/quality-harness.test.ts`

- [ ] **Step 1: 创建覆盖全部 standard type 的 hermetic fixture**

  fixture 同时包含标准值、Wave dimension 简写、typed alias、odd dashArray、gradient 缺端点、shadow inset、typography 标准字段和明确 Wave extension；不得依赖 Orca 仓库。

- [ ] **Step 2: 注册 Quality Harness case**

  在 `benchmarks/design-token/cases.ts` 添加 `dtcg-standard-types` case，声明 traceable source、标准类型风险与预期平台；`tests/quality-harness.test.ts` 断言 case 被注册并真正运行，不只检查 fixture 文件存在。

- [ ] **Step 3: 添加三平台 integration assertions**

  对 JSON/JSONC、CSS、Sketch 逐项断言关键 payload；CSS 全局断言不含 `[object Object]`。

- [ ] **Step 4: 更新 Orca realistic fixture**

  antline 使用 `$type: border`，style 为 `{ dashArray: [{value: 4, unit: px}, {value: 8, unit: px}], lineCap: butt }`。

- [ ] **Step 5: 运行 integration 与 quality harness**

  Run: `bun test tests/integration/theme-service.test.ts tests/quality-harness.test.ts`

  Expected: PASS；fixture 全程不访问真实 Orca。

- [ ] **Step 6: 提交 fixtures**

  ```bash
  git add tests/fixtures/themes/dtcg-standard-types tests/fixtures/themes/orca-realistic/main.yaml benchmarks/design-token/cases.ts tests/integration/theme-service.test.ts tests/quality-harness.test.ts
  git commit -m "test(tokens): cover all DTCG standard types"
  ```

### Task 11: 同步内部规格、用户手册与 changeset

**Files:**
- Modify: `docs/SPEC.md`
- Modify: `manual/pages/design-token-main-yaml.md`
- Modify: `manual/pages/design-token-color-typography.md`
- Modify: `manual/pages/design-token-extensions-output.md`
- Create: `.changeset/bright-waves-support-dtcg-types.md`

- [ ] **Step 1: 更新内部行为快照**

  `docs/SPEC.md` 写明标准类型集合、标准/Wave 方言边界、typed reference、unknown custom type、三平台投影与失败语义。不修改 `theme.*` taxonomy、public roots、`includeRootKeys` 或 `$config`。

- [ ] **Step 2: 更新用户手册**

  在 `design-token-main-yaml.md` 更新已知类型并删除 `$type: opacity`；在 `design-token-color-typography.md` 更新 dashArray/lineCap、typography 和 border；在 `design-token-extensions-output.md` 更新三平台输出。保留 inheritColor/Sketch property opacity 文档。

- [ ] **Step 3: 创建 minor changeset**

  创建确定文件 `.changeset/bright-waves-support-dtcg-types.md`，使用 `package.json` 的实际 package name 和 `minor`；摘要说明 DTCG standard types、dimension 简写、unknown CSS composite failure。不执行 version/publish。

- [ ] **Step 4: 构建用户手册并运行文档相关 tests**

  Run: `pnpm manual:build && bun test tests/manual-loader.test.ts tests/manual-app.test.ts tests/cli-manual.test.ts`

  Expected: PASS。

- [ ] **Step 5: 提交 docs 与 changeset**

  ```bash
  git add docs/SPEC.md manual/pages/design-token-main-yaml.md manual/pages/design-token-color-typography.md manual/pages/design-token-extensions-output.md .changeset/bright-waves-support-dtcg-types.md
  git commit -m "docs(tokens): document DTCG standard type support"
  ```

### Task 12: Wave 全量 gate 与工作区审计

**Files:**
- Verify only

- [ ] **Step 1: 运行 focused aggregate tests**

  Run: `bun test tests/theme-schema.test.ts tests/dtcg-reference-types.test.ts tests/theme-transformer.test.ts tests/color-value.test.ts tests/color-space.test.ts tests/format-flat.test.ts tests/format-css.test.ts tests/format-sketch.test.ts tests/token-generator.test.ts tests/integration/theme-service.test.ts tests/quality-harness.test.ts`

  Expected: PASS。

- [ ] **Step 2: 运行 repository gate**

  Run: `pnpm check:ci`

  Expected: typecheck、全部 tests、build、style 全部 PASS。

- [ ] **Step 3: 审计 object leakage 与配置边界**

  Run: `rg -n -- "\\[object Object\\]|stockStyle|\\$type: opacity" src tests docs manual`

  Expected: 无生成逻辑中的 `[object Object]`；`stockStyle` 只允许存在于明确的负向回归/历史说明；`$type: opacity` 只允许存在于 unknown-type 负向测试，不存在于支持列表或用户文档。

- [ ] **Step 4: 审计提交与用户改动**

  Run: `/opt/homebrew/bin/git status --short && /opt/homebrew/bin/git diff -- .gitignore`

  Expected: `.gitignore` 仍是用户原有未提交改动；本任务没有 stage 或改写它；本里程碑所有实现提交为原子 Conventional Commits。

### Task 13: 迁移真实 Orca 并做 smoke

**Files:**
- Modify: `/Users/teatao/Projects/my-color/orca/main.yaml`
- Modify: `/Users/teatao/Projects/my-color/orca/profiles/viz-jzy.yaml`
- Modify: `/Users/teatao/Projects/my-color/orca/profiles/example_viz.yaml`

- [ ] **Step 1: 获取 Orca 写权限并审计工作区**

  Run: `/opt/homebrew/bin/git -C /Users/teatao/Projects/my-color/orca status --short`

  Expected: 记录并保留 `.DS_Store`、`../mac/` 或其他用户原有改动；只修改并 stage 三个 YAML 文件。

- [ ] **Step 2: 将三处 stockStyle 改为 border**

  每处都补齐标准 border：保留原 color/width；style 增加 `lineCap: butt`；dashArray 两项增加 `unit: px`。

- [ ] **Step 3: 执行真实 Orca smoke**

  Run: `ORCA_SMOKE_DIR="$(mktemp -d /Users/teatao/Projects/my-color/orca/.tmp/wave-stock-style-smoke.XXXXXX)"`

  Run: `pnpm dev -- dt build -f /Users/teatao/Projects/my-color/orca/main.yaml --out "$ORCA_SMOKE_DIR"`

  Expected: light、named profile 与 Sketch parameter groups 全部成功；不通过覆盖 `--platform` 绕过既有互斥 group。

- [ ] **Step 4: 检查损坏输出**

  Run: `rg -n -- "\\[object Object\\]" "$ORCA_SMOKE_DIR"`

  Expected: exit 1，无匹配。生成 CSS 包含 border shorthand、`-dash-array` 和 `-line-cap`；Sketch payload 保留完整 border value。

  检查完成后只删除本步骤由 `mktemp` 创建的 `$ORCA_SMOKE_DIR`，不清理 Orca 的其他 `.tmp` 内容。

- [ ] **Step 5: 提交 Orca migration**

  ```bash
  /opt/homebrew/bin/git -C /Users/teatao/Projects/my-color/orca add main.yaml profiles/viz-jzy.yaml profiles/example_viz.yaml
  /opt/homebrew/bin/git -C /Users/teatao/Projects/my-color/orca commit -m "fix(tokens): migrate antline to border"
  ```

- [ ] **Step 6: 最终审计两个仓库**

  Run: `/opt/homebrew/bin/git status --short`

  Run: `/opt/homebrew/bin/git -C /Users/teatao/Projects/my-color/orca status --short`

  Expected: Wave 仅剩用户原有 `.gitignore` 改动；Orca 仅剩迁移前已存在的用户改动；不发布、不 tag、不 push。

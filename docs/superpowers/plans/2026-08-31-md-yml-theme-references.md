# md-yml Theme References Implementation Plan

> **For agentic workers:** 按 yes-subagents 的实施、Critic Gate 与 Pruner/Scout 工作流逐项执行；步骤使用 checkbox (`- [ ]`) 跟踪。

**Goal:** 让 `md-yml` 保留同一 payload 内可忠实表达的 `theme` token 引用，同时继续解析外部资源与运算型引用，并保持 JSON、JSONC、CSS、Sketch 行为不变。

**Architecture:** 保持 `resolver -> transformer -> WaveToken[] -> formatter` 主链路。Resolver 记录结构化 reference provenance；transformer 把仍可能对应 formatter-ready slot 的内部引用转换为模块私有 WeakMap lineage，并按现有 typography defaults 继承规则传播；md-yml formatter 先建立未符号化 base graph，再对 value 相等、target 已 emission 的 lineage 做 clone-on-write overlay。

**Tech Stack:** TypeScript strict、ESM、Bun test、js-yaml、pnpm。

**Authoritative baseline:** `docs/superpowers/specs/2026-08-31-md-yml-output-design.md`、`docs/superpowers/specs/2026-08-31-md-yml-theme-reference-design.md` 与本计划通过同一次 Critic Strict 后的精确 commit SHA。

---

## File Structure

- `src/core/schema/dtcg-reference-types.ts`：reference provenance 类型、结构化 locator 和记录入口。
- `src/core/resolver/reference-value-{shared,external,internal}.ts`：递归传递 consumer segments，记录 internal/external scope 与 pure/override 事实。
- `src/core/resolver/reference-token-{external,internal}.ts`：以真实 group/token segments 建立 value 与 extension consumer locator。
- `src/core/resolver/reference-resolution.ts`：返回 resolved tree、provenance 和 document root keys。
- `src/core/pipeline/theme-pipeline.ts`：把 provenance 与 root keys 交给 transformer，不暴露到 public result。
- `src/core/transformer/reference-lineage.ts`：把 resolver locator 映射为 token value slot；用模块私有 WeakMap 保存 lineage；处理 target token 定位和 typography default lineage。
- `src/core/transformer/theme-transformer.ts`：传播普通 token 与 typography defaults lineage，阻断 shape-changing transform 的候选。
- `src/core/generator/formats/md-yml.ts`：base graph、target index、等价性判断、引用 overlay 与完整性检查。
- `tests/dtcg-reference-types.test.ts`、`tests/resource-resolver.test.ts`：structured provenance 与 pure/override 合同。
- `tests/theme-transformer.test.ts`、`tests/transform-to-wave-tokens.test.ts`：普通 lineage、defaults 继承与 transform 阻断。
- `tests/format-md-yml.test.ts`：引用投影、fallback、alias chain、immutability 和其他平台 parity。
- `tests/fixtures/themes/md-yml-orca/main.yaml`、`tests/integration/theme-service.test.ts`：Orca-derived hermetic pipeline 回归。
- `docs/SPEC.md`、`manual/pages/design-token-extensions-output.md`、`.changeset/bright-md-yml-output.md`：用户合同与 release metadata。

## Milestone 1: Structured Reference Provenance

完成条件：resolver 对 internal/external、curly/JSON Pointer、object/array slot 和 `$ref` override 产生无字符串反解析的 structured provenance；现有 typed-reference 与 resolution tests 通过。

### Task 1: 为 provenance 增加结构化路径与语义

**Files:**
- Modify: `src/core/schema/dtcg-reference-types.ts`
- Modify: `src/core/resolver/reference-value-shared.ts`
- Modify: `src/core/resolver/reference-value-external.ts`
- Modify: `src/core/resolver/reference-value-internal.ts`
- Modify: `src/core/resolver/reference-token-external.ts`
- Modify: `src/core/resolver/reference-token-internal.ts`
- Modify: `src/core/resolver/reference-resolution.ts`
- Test: `tests/dtcg-reference-types.test.ts`
- Test: `tests/resource-resolver.test.ts`

- [ ] **Step 1: 写 structured provenance 失败测试**

  覆盖以下 exact fields：

  ```ts
  interface ReferenceProvenance {
    consumerPath: string;
    consumerSegments: readonly (string | number)[];
    reference: string;
    targetPath: string;
    targetSegments: readonly string[];
    resolvedTargetValueKind: 'array' | 'object' | 'scalar';
    scope: 'internal' | 'external';
    identity: boolean;
  }
  ```

  用 nested array、包含 RFC 6901 `~0` / `~1` 的 JSON Pointer、internal curly alias、external curly alias、pure `$ref` 和 `$ref + alpha` 断言 segments、scope 与 identity。现有 `consumerPath` / `targetPath` 文本保持原值。

- [ ] **Step 2: 运行失败测试**

  Run: `bun test tests/dtcg-reference-types.test.ts tests/resource-resolver.test.ts`

  Expected: FAIL；provenance 尚无 structured fields。

- [ ] **Step 3: 实现结构化 locator**

  增加只读 `ReferencePathSegment` 与 `ReferenceLocation`：

  ```ts
  export type ReferencePathSegment = string | number;

  export interface ReferenceLocation {
    label: string;
    segments: readonly ReferencePathSegment[];
  }
  ```

  `ReferenceLocation` 只是在 resolver recursion 内同步推进 label 与 segments 的 traversal carrier；`ReferenceProvenance.consumerSegments` / `targetSegments` 是跨层持久合同。Object append string key，array append numeric index。Group/token processor 使用真实 key 数组建立起点；不得通过 `consumerPath.split('.')` 或正则恢复 segments。

  `ReferenceProvenanceMap` 的 key 改为 `JSON.stringify(consumerSegments)` 生成的 canonical structured key，不能继续使用点连接 label；这样 `['a.b', 'c']` 与 `['a', 'b.c']` 不会覆盖。`consumerPath` 只用于兼容错误文本。

  `parseDtcgRef()` 的 decoded source/path 用作 target segments。Curly alias target 按其受限 dot grammar 分段。`resolveDtcgRef()` 在 overrides 为空时记录主 target `identity: true`，否则为 `false`；override 内部的独立 reference 继续按自己的 consumer segments 递归记录。Curly alias 记录 `identity: true`。Pass 1/Pass 2 分别记录 external/internal scope。

  同一 canonical consumer key 再次记录时，保留第一次的 `reference`、target、scope、identity 和 structured locator，只更新 `resolvedTargetValueKind`。增加 `A -> B -> C -> external` 多轮测试，精确断言 A 保持 direct target B、B 保持 C；同时用 transitive array target 断言 existing composite validation 仍看到最终 value kind。

  `identity: false` consumer 形成 structured computed-subtree barrier。记录 barrier 时删除 Map 中所有 strict descendant entries；此后 `recordReferenceProvenance()` 在写入前检查是否存在 segment-wise ancestor barrier，命中则忽略。不得使用 label/string prefix。Barrier 本身保留供诊断和 mapper 排除，且同一 consumer 后续轮次不能把它改回 `identity: true`。

  增加 shape-preserving custom object 回归：B direct alias 到 C；A 使用 `{ $ref: B, tag: 'x' }`。即使中间 resolved A 内出现对 C 的字符串，provenance 中 A root 保持 `identity:false` 且不存在 A descendants；这与 `$ref + alpha` 一起覆盖 computed reference。

- [ ] **Step 4: 保持现有 validator 兼容**

  `validateResolvedCompositeReferences()` 继续使用现有 string label 输出错误，但结构判断改用 `consumerSegments`，并读取 `resolvedTargetValueKind`，避免 array path regex 成为第二套 source of truth。现有错误文本与 typed-reference 行为不变。

  `ReferenceResolutionResult` 明确增加 `rootKeys: ReadonlySet<string>`；测试断言其内容来自当前 document roots，pipeline 不重新推断。

- [ ] **Step 5: 运行 resolver gate**

  Run: `bun test tests/dtcg-reference-types.test.ts tests/resource-resolver.test.ts tests/theme-schema.test.ts && pnpm typecheck`

  Expected: PASS。

- [ ] **Step 6: 提交 Milestone 1**

  ```bash
  git add src/core/schema/dtcg-reference-types.ts src/core/resolver/reference-value-shared.ts src/core/resolver/reference-value-external.ts src/core/resolver/reference-value-internal.ts src/core/resolver/reference-token-external.ts src/core/resolver/reference-token-internal.ts src/core/resolver/reference-resolution.ts tests/dtcg-reference-types.test.ts tests/resource-resolver.test.ts
  git commit -m "refactor(tokens): preserve structured reference provenance"
  ```

- [ ] **Step 7: Milestone 1 Critic Gate**

  以 reviewed spec/plan commit、Milestone 1 commit、focused tests 和 typecheck 为基线。要求核验 locator 不依赖 string parsing、canonical Map key 无 segment collision、RFC 6901 decode、first-origin target、computed-subtree barrier、internal/external scope、multi-pass provenance 与现有 validator 兼容；`STATUS: PASS` 后进入 Milestone 2。

## Milestone 2: Transformer Lineage and md-yml Overlay

完成条件：普通内部 direct reference 与 typography defaults lineage 通过 WeakMap 关联到对应 `WaveToken` identity，但不改变 token 对象；md-yml 只在 base values 等价且 target 已 emission 时输出 `{namespace.local-key}`；真实 Orca 生成通过。

### Task 2: 把 provenance 映射为 WaveToken lineage

**Files:**
- Create: `src/core/transformer/reference-lineage.ts`
- Modify: `src/core/transformer/theme-transformer.ts`
- Modify: `src/core/pipeline/theme-pipeline.ts`
- Modify: `src/core/generator/token-generator.ts`
- Test: `tests/theme-transformer.test.ts`
- Test: `tests/transform-to-wave-tokens.test.ts`
- Test: `tests/token-generator.test.ts`

- [ ] **Step 1: 写 transformer lineage 失败测试**

  在 `reference-lineage.ts` 定义内部 sidecar，不修改导出的 `WaveToken`：

  ```ts
  export interface TokenReferenceLineage {
    valuePath: readonly (string | number)[];
    targetPath: readonly string[];
  }

  const referencesByToken = new WeakMap<WaveToken, readonly TokenReferenceLineage[]>();

  export function setTokenReferenceLineage(
    token: WaveToken,
    lineage: readonly TokenReferenceLineage[],
  ): void;

  export function getTokenReferenceLineage(
    token: WaveToken,
  ): readonly TokenReferenceLineage[];
  ```

  该模块不从 `src/types/index.ts` 或公共 barrel 导出。断言 whole-token alias 使用 empty `valuePath`；typography、border、shadow、gradient 使用相对 `$value` slot；external 与 `identity: false` 不产生 candidate。

- [ ] **Step 2: 写 typography defaults 失败测试**

  建立 ancestor default、nearest default、token explicit override 三层 fixture。断言 default internal `fontFamily` lineage只传播给缺失字段；nearest default 覆盖 ancestor；token explicit literal 清除 inherited lineage；token explicit internal ref 使用自身 lineage。

- [ ] **Step 3: 实现 reference-lineage mapper**

  Mapper 只接收 structured provenance、resolved tree 和 root keys：

  - consumer prefix 为 `[...token.path, '$value']` 时，suffix 成为 `valuePath`；
  - consumer 位于 `[...group.path, '$extensions', 'typography', 'defaults', field]` 时，记录到该 group 的 default lineage；
  - target 只有在指向完整 token 或 token 的 `$value` 根时才成为 candidate；target value 内 property reference 保留最终值；
  - 只接受 `scope: 'internal'`、root 为 `theme`、`identity: true` 的 provenance。

  Mapper 不比较最终值，也不生成 md-yml path。

- [ ] **Step 4: 在 transformer 中传播 lineage**

  `transformToWaveTokens()` 增加最后一个 optional `referenceContext` 参数，包含 provenance 与 rootKeys；前三个既有参数和全部旧调用保持不变：

  ```ts
  export interface TransformReferenceContext {
    provenance: ReferenceProvenanceMap;
    rootKeys: ReadonlySet<string>;
  }
  ```

  Pipeline 在常规 transform 时传入 resolution metadata；无需 lineage 的测试与 Sketch HEX re-transform 继续省略该参数。

  `InheritedExtensions` 增加 typography default lineage map，与 `mergeTypographyDefaults()` 使用相同覆盖顺序。`transformToken()` 在 materialize 后附加有效 candidate。Token explicit field 存在时不继承同名 default lineage。

  逐项处理 value-changing branch：

  - `smoothShadow`、`smoothGradient`：阻断整个 token lineage；
  - standard gradient endpoint materialization：比较 materialize 前后 stop 数量，增加 stop 时阻断整个 gradient lineage，数量不变时保留 candidate 给 formatter equality gate；
  - `inheritColor`：阻断整个 token lineage；
  - legacy `currentColor`：只有实际执行 opacity/shadow value rewrite 时阻断整个 token lineage；
  - ordinary color-space、color object、dimension、fontWeight、strokeStyle、border 与 typography normalization：保留 candidate，最终由 slot existence 与 base-value equality 决定；
  - outline 与 Sketch-only metadata 不改变 value，不影响 lineage。

- [ ] **Step 5: 运行 transformer gate**

  增加 public-shape isolation 测试：对同一 resolved tree 分别调用无 `referenceContext` 与有 `referenceContext` 的 transform，断言每个 token 的 `Object.keys()`、`Reflect.ownKeys()`、spread、`JSON.stringify()` 和 deep enumerable snapshot 完全一致。

  Run: `bun test tests/theme-transformer.test.ts tests/transform-to-wave-tokens.test.ts tests/token-generator.test.ts && pnpm typecheck`

  Expected: PASS；现有 transformer output values 不变。

- [ ] **Step 6: 提交 transformer lineage**

  ```bash
  git add src/core/transformer/reference-lineage.ts src/core/transformer/theme-transformer.ts src/core/pipeline/theme-pipeline.ts src/core/generator/token-generator.ts tests/theme-transformer.test.ts tests/transform-to-wave-tokens.test.ts tests/token-generator.test.ts
  git commit -m "feat(tokens): carry internal reference lineage"
  ```

### Task 3: 在 md-yml 中投影内部引用

**Files:**
- Modify: `src/core/generator/formats/md-yml.ts`
- Modify: `tests/format-md-yml.test.ts`
- Modify: `tests/fixtures/themes/md-yml-orca/main.yaml`
- Modify: `tests/integration/theme-service.test.ts`

- [ ] **Step 1: 写 formatter 失败测试**

  覆盖 exact output：

  ```yaml
  font:
    font-family:
      - Inter
      - sans-serif
    heading-h1:
      color: "{color.text-emphasis}"
      fontFamily: "{font.font-family}"
      fontSize: 2.5rem
  ```

  同时覆盖 root scalar/composite alias、nested object/array slot、alias chain `A -> B -> external`、explicit composite consumer，以及 `filterLayer: 0/1` target projection。

- [ ] **Step 2: 写 fallback 与回归失败测试**

  覆盖 missing/non-emitted target、missing slot、base value mismatch、target property、`$ref + alpha`、shape-preserving custom object `$ref + override`、smoothShadow、smoothGradient、gradient endpoint insertion、inheritColor 与 legacy currentColor：均输出最终值，不生成 dangling reference。覆盖 root+nested、ancestor+descendant、重复同 target 和冲突 target，断言稳定优先级与 contradiction error。用 frozen inputs 分别运行 `[json, md-yml]` 与 `[md-yml, json]`，断言无 mutation。

  对同一 resolved tree 的无 context / 有 context transforms，分别运行 `flatJsonFormat`、`flatJsoncFormat`、`cssVariablesFormat` 和 `sketchFormat`，断言四个平台字节逐一相同。Sketch 用其真实 HEX re-transform 条件另加 integration case，避免只验证直接 formatter。

- [ ] **Step 3: 实现两阶段 base graph**

  保留现有 path/collision/ordering 与 YAML-safe validation。第一阶段为每个 direct token 建立：

  ```ts
  interface BaseEntry {
    sourcePath: readonly string[];
    value: unknown;
    references: readonly TokenReferenceLineage[];
  }
  ```

  Explicit composite child 作为 consumer 时保留其 lineage；它不是独立 target。Target index 只登记能独立产生 `namespace.local-key` 的 token entry。所有 target 比较使用未 overlay 的 base value。

- [ ] **Step 4: 实现等价性与 clone-on-write overlay**

  使用 YAML value domain 的递归 semantic equality：primitive 用 `Object.is`，array 按 index；plain/null-prototype object 先比较完整 own enumerable string key set，再逐 key 比较值，key insertion order 不影响相等性。不使用 `JSON.stringify`，不触发 accessor。

  Candidate 先按 `valuePath.length` 升序，再按 `JSON.stringify(valuePath)` 排序。相同 value path + target 去重；相同 value path 指向不同 target 时抛出包含 consumer 和两个 target 的 lineage contradiction error。Candidate 同时满足 target exists、consumer slot exists、base values equal 时，clone consumer 的沿途 array/object 并写入 `"{namespace.local-key}"`。Eligible ancestor（包括 root）覆盖 descendants；ancestor 不 eligible 时继续检查 descendants。Overlay 后检查所有生成引用都能命中 target index。结果不得依赖 WeakMap lineage array 或 resolver Map 的插入顺序。

  Object clone 使用 `Object.create(Object.getPrototypeOf(value))` 加 `Object.defineProperties()` 保留 plain/null prototype 与 own data descriptors；overlay write 使用 `Object.defineProperty()` 创建 enumerable、writable、configurable data property，禁止普通 assignment。Array 只 clone 已验证的 dense indices。增加 null-prototype consumer 和 `__proto__`、`constructor`、`prototype` nested paths 测试，断言 overlay 后 prototype 不变、keys/values 完整且全局 prototype 未污染。

- [ ] **Step 5: 运行 formatter gate**

  Run: `bun test tests/format-flat.test.ts tests/format-md-yml.test.ts tests/token-generator.test.ts && pnpm typecheck`

  Expected: PASS。

- [ ] **Step 6: 扩充 Orca-derived fixture**

  `tests/fixtures/themes/md-yml-orca/main.yaml` 增加：外部 fontFamily token、defaults 内部 alias、heading internal color、external fontSize、alpha override 和 smooth derived token。Integration 精确断言内部引用与最终值边界，并遍历所有 `{namespace.local-key}` 验证 payload target。

- [ ] **Step 7: 运行 pipeline integration**

  Run: `bun test tests/integration/theme-service.test.ts tests/parameter-group-pipeline.test.ts && pnpm typecheck`

  Expected: PASS；CLI `--platform` single-pass 与其他平台文件规划不变。

- [ ] **Step 8: 提交 md-yml overlay**

  ```bash
  git add src/core/generator/formats/md-yml.ts tests/format-md-yml.test.ts tests/fixtures/themes/md-yml-orca/main.yaml tests/integration/theme-service.test.ts
  git commit -m "feat(tokens): preserve md-yml theme references"
  ```

- [ ] **Step 9: 运行真实 Orca smoke**

  对 `/Users/teatao/Projects/my-color/orca/main.yaml` 与 `custom/corerain.yaml` 生成修改前 SHA-256。用任务独占 `mktemp -d` 执行：

  ```bash
  pnpm dev -- dt build \
    -f /Users/teatao/Projects/my-color/orca/main.yaml \
    --platform md-yml \
    --out <task-temp-dir>
  ```

  断言唯一输出 `orca2md.yml`，且：

  - `font.font-family` 是字体数组；
  - `font.heading-h1.fontFamily === '{font.font-family}'`；
  - `font.heading-h1.color === '{color.text-emphasis}'`；
  - `font.heading-h1.fontSize` 是最终 dimension；
  - 所有 `{namespace.local-key}` 命中同一 payload target；
  - 无 `{wave.*}`、`{tailwindcss.*}`、`{corerain.*}`、`[object Object]` 或 frontmatter delimiter；
  - source SHA-256 前后逐字一致。

  Hermetic exact-output test 已锁定 `yaml.dump({ noRefs: true })` 不生成 anchor/alias；真实 smoke 只用行级 YAML token regex 检查 js-yaml 的 `&ref_` / `*ref_` 标记，不扫描普通 quoted string。只删除本步骤创建的 temp directory。

- [ ] **Step 10: Milestone 2 Critic Gate**

  提供 reviewed baseline、两个实现 commit、focused tests、typecheck、真实 Orca artifact 检查和 source hash parity。要求核验 WeakMap 公共边界、first-origin multi-pass provenance、computed-subtree barrier、defaults lineage、branch inventory、prototype-safe overlay、base-value comparison、candidate precedence、alias chain、computed fallback、dangling prevention、immutability 和四个非 md-yml platform parity；`STATUS: PASS` 后进入 Milestone 3。

## Milestone 3: Documentation and Final Verification

完成条件：SPEC、用户手册与 changeset 描述新合同；full suite、CI gate 和最终真实 Orca smoke 通过；本次 touched files 完成 Pruner/Scout 收尾。

### Task 4: 更新用户合同

**Files:**
- Modify: `docs/SPEC.md`
- Modify: `manual/pages/design-token-extensions-output.md`
- Modify: `.changeset/bright-md-yml-output.md`

- [ ] **Step 1: 更新 SPEC**

  把“md-yml 输出 resolved final values”修订为：外部 resource 与 computed reference 输出最终值；同一 payload 内 direct theme reference 输出 `{namespace.local-key}`；typography defaults materialize 后可保留 inherited reference；其他 platform 不变。

- [ ] **Step 2: 完善用户手册**

  增加 fontFamily 示例，明确：

  ```yaml
  font:
    font-family: [Inter, sans-serif]
    heading-h1:
      fontFamily: "{font.font-family}"
  ```

  说明 palette/dimension/custom 外部引用仍解析；alpha/smooth 等 computed reference 输出最终值。删除“不保留 authored alias”的旧表述。

- [ ] **Step 3: 更新 changeset**

  在既有 minor changeset 中补充 md-yml 保留同一输出内 direct theme reference，以及外部/运算型引用仍 materialize。版本等级保持 minor，不新增第二份 changeset。

- [ ] **Step 4: 构建文档并提交**

  Run: `pnpm manual:build && pnpm check:style`

  Expected: PASS。

  ```bash
  git add docs/SPEC.md manual/pages/design-token-extensions-output.md .changeset/bright-md-yml-output.md
  git commit -m "docs(tokens): document md-yml theme references"
  ```

### Task 5: 最终验证与清理

**Files:**
- Verify only; Pruner 只能修改本计划触及文件，且必须先经 Scout 判定。

- [ ] **Step 1: 运行 focused contract suite**

  Run: `bun test tests/dtcg-reference-types.test.ts tests/resource-resolver.test.ts tests/theme-transformer.test.ts tests/transform-to-wave-tokens.test.ts tests/format-md-yml.test.ts tests/token-generator.test.ts tests/parameter-group-pipeline.test.ts tests/integration/theme-service.test.ts`

  Expected: PASS。

- [ ] **Step 2: 运行 repository gates**

  Run: `pnpm typecheck && bun test && pnpm check:ci`

  Expected: PASS。

- [ ] **Step 3: 重跑最终真实 Orca smoke**

  在全部代码、文档和清理 mutation 后重复 Milestone 2 的独占 temp build、payload assertions 与 source hash parity。此前 smoke 不替代本步骤。

- [ ] **Step 4: 执行 Pruner/Scout 收尾**

  Pruner 只扫描本计划 touched files，输出包含 file:line、动作和理由的候选；Scout 逐项判定 `SAFE | UNSAFE | UNCERTAIN`；Pruner 只执行 SAFE 项并重跑受影响 focused tests、typecheck 和 style。UNSAFE 放弃，UNCERTAIN 交给用户。

- [ ] **Step 5: 检查提交与工作树边界**

  Run: `/opt/homebrew/bin/git log --oneline --max-count=12 && /opt/homebrew/bin/git status --short && /opt/homebrew/bin/git diff --check`

  Expected: 本任务提交原子化；用户原有 `.gitignore`、`CLAUDE.md`、`docs/simple-wiki/` 保持不动；无任务临时目录或 artifact 残留。

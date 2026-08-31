# md-yml Design Token Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Wave 增加 `md-yml` design-token platform，输出 `<theme>2md.yml`，以一级 namespace 分组、组内 hyphen-join path，供用户复制到 Markdown frontmatter 并在内文引用。

**Architecture:** 保持 `resolver -> transformer -> WaveToken[] -> formatter -> generator` 分层。`md-yml` 与 flat JSON 共享 formatter-ready value 投影，但独立完成 path projection、YAML-safe value validation、冲突检测和确定性序列化；generator 只负责 platform 注册、文件规划和既有 format-before-write。Pipeline 在 CLI `--platform` 存在时基于 `$config.parameter` 建立单个 pass，不展开 parameter groups；未覆盖时保持现有 group passes。Map 只承担索引、顺序和冲突来源记录，最终转换为 null-prototype record 后交给 `js-yaml`。

**Tech Stack:** TypeScript strict、ESM、Bun test、pnpm、`js-yaml@4.1.1`、Zod、Changesets。

**Authoritative baseline:** 实施和 Critic Gate 必须使用同时包含 `docs/superpowers/specs/2026-08-31-md-yml-output-design.md` 与本计划的精确 reviewed commit SHA。该 SHA 由 orchestrator 在 Critic Strict 派遣和实施派遣中显式提供；`6722bdd`、`d9737fb` 仅为设计历史，不是实施基线。

---

## File Map

**新增文件**

- `src/core/generator/formats/flat-value.ts`：JSON-compatible formatter-ready value 投影，集中处理 `inheritColor`。
- `src/core/generator/formats/md-yml.ts`：md-yml path projection、安全值验证、冲突检测与序列化。
- `tests/format-md-yml.test.ts`：md-yml formatter 的结构、安全、顺序和失败合同。
- `tests/fixtures/themes/md-yml-orca/main.yaml`：Orca example-derived、无外部依赖的端到端 fixture。
- `.changeset/bright-md-yml-output.md`：新增用户可见输出平台的 minor changeset。

**修改文件**

- `src/core/generator/formats/flat.ts`：改用共享 value helper，保持 JSON/JSONC 字节合同。
- `src/core/generator/token-generator.ts`：注册 `md-yml` 和 `<theme>2md.yml`。
- `src/core/pipeline/theme-pipeline.ts`：CLI platform override 使用 base parameter single pass，未覆盖时保持 group expansion。
- `src/core/validator/design-token-config.ts`：允许 `$config.parameter.platform: [md-yml]`。
- `src/cli/commands/build.ts`、`src/cli/commands/dt.ts`：帮助文本列出 `md-yml`。
- `tests/format-flat.test.ts`：锁定共享 helper 抽取前后行为一致。
- `tests/token-generator.test.ts`：文件命名、multi-platform、失败原子性、supported list。
- `tests/design-token-config.test.ts`：config platform validation。
- `tests/cli-dt.test.ts`：module/build help 列出 `md-yml`。
- `tests/integration/theme-service.test.ts`：真实 pipeline、output planner 与 fixture 输出。
- `tests/parameter-group-pipeline.test.ts`：锁定 CLI platform single-pass 与 `--out` group-preserving 语义。
- `docs/SPEC.md`：当前系统行为、platform 列表、文件名和 md-yml 投影合同。
- `manual/pages/design-token-main-yaml.md`：配置字段支持 `md-yml`。
- `manual/pages/design-token-extensions-output.md`：输出格式表、结构、引用方式与限制。

**明确不改**

- `src/core/resolver/**`、`src/core/transformer/**`：不为 Markdown 增加消费侧逻辑。
- `src/cli/commands/dt-init.ts`：starter 默认 platform 保持 `json, css, sketch`，不自动增加新产物。
- `/Users/teatao/Projects/my-color/orca/**`：真实 consumer 不在本次提交中修改。

## Milestone 1: Formatter Contract

完成条件：共享 value helper 保持 JSON/JSONC 行为；`mdYamlFormat()` 的 namespace projection、explicit composite、YAML-safe value、特殊 key、顺序和错误测试全部通过。该里程碑不公开注册 platform。

### Task 1: 提取共享 formatter-ready value

**Files:**
- Create: `src/core/generator/formats/flat-value.ts`
- Modify: `src/core/generator/formats/flat.ts`
- Test: `tests/format-flat.test.ts`

- [ ] **Step 1: 运行 flat formatter characterization tests**

  Run: `bun test tests/format-flat.test.ts`

  Expected: PASS；记录当前 JSON/JSONC、explicit composite 和 `inheritColor` 行为基线。

  在 `tests/format-flat.test.ts` 增加同时含 alpha 与 opacity 的 characterization：

  ```ts
  expectFlatPayload(
    [makeToken({
      name: 'theme-color-overlay',
      inheritColor: true,
      inheritColorAlpha: 0.4,
      inheritColorOpacity: 0.6,
    })],
    {
      'theme-color-overlay': {
        color: '$COLOR_FOREGROUND',
        alpha: 0.4,
        opacity: 0.6,
      },
    },
  );
  ```

  Run: `bun test tests/format-flat.test.ts`

  Expected: PASS；该测试只补齐既有合同，不改变行为。

- [ ] **Step 2: 新增共享 value helper**

  `flat-value.ts` 只投影单个 `WaveToken` 的最终 value，不修改 token 或 nested value：

  ```ts
  import type { WaveToken } from '../../../types/index.ts';

  export function formatFlatTokenValue(token: WaveToken): unknown {
    if (token.inheritColor !== true) return token.value;

    const value: Record<string, unknown> = { color: '$COLOR_FOREGROUND' };
    if (typeof token.inheritColorAlpha === 'number') {
      value.alpha = token.inheritColorAlpha;
    }
    if (typeof token.inheritColorOpacity === 'number') {
      value.opacity = token.inheritColorOpacity;
    }
    return Object.keys(value).length === 1 ? '$COLOR_FOREGROUND' : value;
  }
  ```

- [ ] **Step 3: 让 flat JSON/JSONC 使用共享 helper**

  删除 `flat.ts` 内重复的 `isInheritColorToken()` / `formatInheritColorValue()`，在 JSON record 和 JSONC line emission 两处调用：

  ```ts
  const tokenValue = formatFlatTokenValue(token);
  ```

  保留现有 explicit composite grouping、key 生成和 JSON/JSONC comment 行为，不顺手重构。

- [ ] **Step 4: 验证抽取不改变现有输出**

  Run: `bun test tests/format-flat.test.ts && pnpm typecheck`

  Expected: PASS；现有 snapshots/assertions 无修改即可通过。

- [ ] **Step 5: 提交共享投影**

  ```bash
  git add src/core/generator/formats/flat-value.ts src/core/generator/formats/flat.ts tests/format-flat.test.ts
  git commit -m "refactor(tokens): share flat value projection"
  ```

### Task 2: 实现 md-yml formatter

**Files:**
- Create: `src/core/generator/formats/md-yml.ts`
- Test: `tests/format-md-yml.test.ts`

- [ ] **Step 1: 写 namespace projection 与 exact output 失败测试**

  使用 `filterLayer: 1` 锁定核心 shape：

  ```ts
  const tokens: WaveToken[] = [
    {
      name: 'theme-color-primary-main',
      path: ['theme', 'color', 'primary', 'main'],
      value: '#1a72f0',
      type: 'color',
      _order: 0,
    },
    {
      name: 'theme-radius-md',
      path: ['theme', 'radius', 'md'],
      value: '8px',
      type: 'dimension',
      _order: 1,
    },
  ];

  expect(mdYamlFormat(tokens, { filterLayer: 1 })).toBe(
    "color:\n  primary-main: '#1a72f0'\nradius:\n  md: 8px\n",
  );
  ```

  同时用 `yaml.load()` 断言解析结果为：

  ```ts
  {
    color: { 'primary-main': '#1a72f0' },
    radius: { md: '8px' },
  }
  ```

- [ ] **Step 2: 写 direct composite、explicit composite 与首次出现顺序测试**

  覆盖 standard typography object 原样作为 leaf；explicit composite 使用 child `token.path.slice(0, -1)` 作为 exact group segments，用最后 segment 作为 property。构造 direct token 与 composite child 交错的 `_order`，精确断言 composite 按第一个 child 占位，而不是最后追加。

  点号反例必须失败：

  ```ts
  ['theme', 'component', 'button.primary', 'fill']
  ```

  同时以 `['theme', 'component', 'button', 'primary', 'fill']` 作为无点号的合法多 segment control，断言输出 `component.button-primary-fill`；不得把合法 control 混入失败矩阵。

  md-yml 的 `.` 是 `{namespace.local-key}` 路径分隔符。namespace、local path 或 composite property 的 source segment 含 `.` 时必须报告具体 segment 后失败；formatter 不调用 `_composite.split('.')`，也不自动替换字符。

- [ ] **Step 3: 写 path、filterLayer 与 collision 失败矩阵**

  覆盖：

  ```ts
  for (const filterLayer of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => mdYamlFormat(tokens, { filterLayer })).toThrow(
      /md-yml.*filterLayer.*non-negative finite integer/,
    );
  }
  ```

  另覆盖过滤后不足两个 segment、空 segment、含 `.` segment、`color.primary-main` 与 `color.primary.main` 折叠冲突、direct/composite key 冲突、duplicate composite property，以及 `_composite !== childPathPrefix.join('.')` 的程序化错误。错误断言包含 target key 和全部 source path。

- [ ] **Step 4: 写 YAML-safe value 与 prototype key 测试**

  成功矩阵覆盖 null、string、boolean、finite number、dense nested array、plain/null-prototype object，以及 value 内合法的 `$type`、`$value`、`$description` property。

  失败矩阵覆盖：

  ```ts
  const unsafe = [
    undefined,
    { nested: undefined },
    [undefined],
    Array(1),
    Number.NaN,
    Number.POSITIVE_INFINITY,
    1n,
    Symbol('x'),
    () => 1,
    new Date(),
    new Map(),
    new Set(),
  ];
  ```

  再构造 cycle、symbol-key object、non-enumerable own property、getter/setter accessor，以及分别带 `extra` string own key 与 symbol own key 的 array。每项必须在 `yaml.dump()` 前失败，getter body 使用计数器并断言从未被调用；错误含 token path 和 nested value path。`__proto__`、`constructor`、`prototype` 作为 namespace、local key 或 composite property 时必须正常 round-trip。

- [ ] **Step 5: 实现安全值检查**

  在 `md-yml.ts` 内定义局部 guard，不扩大公共 types：

  ```ts
  function assertMdYamlSafeValue(
    value: unknown,
    tokenPath: string,
    valuePath = '$',
    ancestors = new Set<object>(),
  ): void;
  ```

  规则：string/boolean/null 直接通过；number 仅接受 `Number.isFinite()`；array 用 `Reflect.ownKeys()` 检查 own keys，只允许 `length` 与从 `0` 到 `length - 1` 的完整 canonical index，拒绝 hole、额外 string key 和 symbol key，再递归每个 element；object prototype 只接受 `Object.prototype` 或 null，使用 `Reflect.ownKeys()` 和 `Object.getOwnPropertyDescriptor()` 检查全部 own properties，拒绝 symbol key、non-enumerable property 和 accessor descriptor，只递归 enumerable data property 的 descriptor value，验证过程不读取 `object[key]`；`ancestors` 只追踪当前递归栈以拒绝 cycle，不把重复但非循环的引用误报为 cycle。

- [ ] **Step 6: 实现 prototype-safe ordered projection**

  导出 formatter：

  ```ts
  export const mdYamlFormat: WaveFormatFn = (tokens, options): string => {
    const filterLayer = (options?.filterLayer as number | undefined) ?? 0;
    assertFilterLayer(filterLayer);

    const ordered = tokens
      .map((token, inputIndex) => ({ token, inputIndex }))
      .sort((a, b) => a.token._order - b.token._order || a.inputIndex - b.inputIndex);

    const namespaces = new Map<string, NamespaceState>();
    // direct token: project token.path
    // explicit composite: project token.path.slice(0, -1), append last segment property
    // every insertion records exact source segments for collision errors

    const output = mapToNullPrototypeRecord(namespaces);
    return yaml.dump(output, {
      lineWidth: -1,
      noRefs: true,
      sortKeys: false,
    });
  };
  ```

  `Map` 不直接传入 `yaml.dump()`。`mapToNullPrototypeRecord()` 只转换 formatter 新建的 namespace/local/composite mappings；用户 value 保持只读引用，在序列化前已通过安全检查。

- [ ] **Step 7: 写 immutability 与 platform-order parity 测试**

  fixture 必须同时包含 direct token、explicit composite siblings 与 `inheritColor` token。deep-freeze token array 和 nested values，分别运行 `flatJsonFormat()` / `mdYamlFormat()` 的两种顺序，断言不抛 mutation error，且每个 formatter 两次输出字节一致。

  另让两个 direct leaf 的 value 指向同一个 plain object，断言 `yaml.load()` 后两处结构完整，raw YAML 不含 `&ref_` 或 `*ref_`，直接验证 `noRefs: true` 不生成 anchor/alias。

- [ ] **Step 8: 运行 formatter milestone gate**

  Run: `bun test tests/format-flat.test.ts tests/format-md-yml.test.ts && pnpm typecheck`

  Expected: PASS。

- [ ] **Step 9: 提交 md-yml formatter**

  ```bash
  git add src/core/generator/formats/md-yml.ts tests/format-md-yml.test.ts
  git commit -m "feat(tokens): add md-yml formatter"
  ```

- [ ] **Step 10: Milestone 1 Critic Gate**

  基线：design spec + 本计划 Milestone 1。提供 focused test 和 typecheck 输出；要求核验 path projection、dot segment、silent-loss guard、prototype key、immutability 与 JSON parity。`STATUS: PASS` 后进入 Milestone 2。

## Milestone 2: Public Platform Integration

完成条件：`md-yml` 可从 main config 与 CLI 选择，generator 写 `<theme>2md.yml`，global output planner 自动检测跨 pass 文件碰撞，format error 保持当前 pass 的其他文件不变。

### Task 3: 注册 config、generator 与 CLI

**Files:**
- Modify: `src/core/validator/design-token-config.ts`
- Modify: `src/core/generator/token-generator.ts`
- Modify: `src/core/pipeline/theme-pipeline.ts`
- Modify: `src/cli/commands/build.ts`
- Modify: `src/cli/commands/dt.ts`
- Test: `tests/design-token-config.test.ts`
- Test: `tests/cli-dt.test.ts`
- Test: `tests/token-generator.test.ts`
- Test: `tests/parameter-group-pipeline.test.ts`
- Test: `tests/integration/theme-service.test.ts`

- [ ] **Step 1: 写 config 与 generator 失败测试**

  `validateMainConfig()` 接受 `platform: ['md-yml']` 并归一化为 `md-yml`。`generateTokens()` 应生成 `demo2md.yml`，multi-platform result 同时包含 `demo.json` 与 `demo2md.yml`，unknown platform 错误精确更新为：

  ```text
  Unknown platform "unknown". Supported platforms: json, jsonc, css, sketch, md-yml
  ```

  先运行：

  Run: `bun test tests/design-token-config.test.ts tests/token-generator.test.ts`

  Expected: FAIL；platform 尚未注册。

- [ ] **Step 2: 注册 platform 与文件名**

  在 config validator 的 enum 尾部加入 `md-yml`。在 generator 中：

  ```ts
  import { mdYamlFormat } from './formats/md-yml.ts';

  const PLATFORMS = {
    // existing definitions unchanged
    'md-yml': {
      format: mdYamlFormat,
      filename: (name: string) => `${name}2md.yml`,
    },
  } satisfies Record<string, PlatformDefinition>;
  ```

  不添加 `includeRootKeys`，不走 Sketch hex re-transform；md-yml 使用当前 pass 的同一 transformed tokens 与 colorSpace。

- [ ] **Step 3: 更新并测试 CLI help**

  `build.ts` 与 `dt.ts` 的 platform 列表尾部加入 `md-yml`。不修改 CLI option parser 或默认 platform。在 `tests/cli-dt.test.ts` 断言 `dt --help` 与 `dt build --help` 都含 `md-yml`，且 `design-token --help` 继续与 `dt --help` 字节一致。

  再通过 CLI command handler 的既有测试入口传入 `--platform md-yml`，使用含 `css`、`sketch` parameter groups 且 base `filterLayer: 1` 的 fixture，断言 override 实际只生成一个 `<theme>2md.yml`，不生成 config 原 platform 文件，也不因两个 group 规划相同文件而碰撞。该测试验证选择链路，不只验证 help 文本。

- [ ] **Step 4: 纠正 CLI platform pass planning**

  在 `buildGroupPasses()` 入口增加 CLI platform 分支：

  ```ts
  if (cliPlatform !== undefined) {
    const resolved = resolveParameters(
      config.parameter,
      themeDir,
      cliOutput,
      cliPlatform,
    );
    if (!resolved.outputDir) resolved.outputDir = defaultOutputDir;
    return [resolved];
  }
  ```

  该分支必须位于 `parameterGroups.length` 判断之前。更新 `tests/parameter-group-pipeline.test.ts`：原“CLI platform overrides all groups”断言改为 single base pass；覆盖 base `filterLayer` / `colorSpace` 生效而 group 专属值不生效、`--platform css,sketch` 仍为一个 multi-platform pass、无 CLI platform 时 group passes 不变、仅 CLI output 时仍覆盖所有 groups。

- [ ] **Step 5: 写当前 pass format-before-write 回归**

  在 `tests/token-generator.test.ts` 预置 `demo.json` 和 `demo.css` marker，传入会触发 md-yml path collision 或 unsafe value 的 tokens，platform 顺序覆盖 `['json', 'md-yml', 'css']` 与 `['md-yml', 'json', 'css']`。两种情况都断言：result failure、markers 字节不变、`demo2md.yml` 不存在。

- [ ] **Step 6: 写 global output planner 集成回归**

  在 `tests/integration/theme-service.test.ts` 创建两个 parameter groups，均生成相同 `<theme>2md.yml`；断言 formatter 运行和目录创建前返回 `Output path collision`，已有 marker 不变。

  增加 `colorSpace: oklch` 的 pipeline case：同一 transformed token set 同时输出 JSON 与 md-yml，断言 md-yml color 与 JSON 的 oklch formatter-ready value 相同，并且不是 Sketch 专用 HEX8。由此锁定 md-yml 使用当前 pass 的 transformed tokens，不走 Sketch hex re-transform。

- [ ] **Step 7: 运行 platform integration tests**

  Run: `bun test tests/design-token-config.test.ts tests/cli-dt.test.ts tests/token-generator.test.ts tests/parameter-group-pipeline.test.ts tests/integration/theme-service.test.ts && pnpm typecheck`

  Expected: PASS。

- [ ] **Step 8: 提交 public platform integration**

  ```bash
  git add src/core/validator/design-token-config.ts src/core/generator/token-generator.ts src/core/pipeline/theme-pipeline.ts src/cli/commands/build.ts src/cli/commands/dt.ts tests/design-token-config.test.ts tests/cli-dt.test.ts tests/token-generator.test.ts tests/parameter-group-pipeline.test.ts tests/integration/theme-service.test.ts
  git commit -m "feat(tokens): expose md-yml output platform"
  ```

### Task 4: 增加 Orca-derived pipeline fixture

**Files:**
- Create: `tests/fixtures/themes/md-yml-orca/main.yaml`
- Modify: `tests/integration/theme-service.test.ts`

- [ ] **Step 1: 创建 hermetic fixture**

  Fixture 不引用外部 resource，固定：

  ```yaml
  $config:
    theme: orca-doc
    parameter:
      outputDir: ./out
      platform: [md-yml]
      filterLayer: 1
  theme:
    color:
      $type: color
      primary:
        main: { $value: "#1a72f0" }
        on-main: { $value: "#ffffff" }
    radius:
      $type: dimension
      md: { $value: { value: 8, unit: px } }
    font:
      $type: typography
      heading:
        h1:
          $value:
            fontFamily: Inter
            fontSize: { value: 40, unit: px }
            fontWeight: 700
            letterSpacing: { value: 0, unit: px }
            lineHeight: 1.2
  ```

- [ ] **Step 2: 写 pipeline output 断言**

  复制 fixture 到 temp workspace，运行 `generateTheme()`，读取 `out/orca-doc2md.yml`，用 `yaml.load()` 精确断言：

  ```ts
  expect(payload).toEqual({
    color: {
      'primary-main': '#1a72f0',
      'primary-on-main': '#ffffff',
    },
    radius: { md: '8px' },
    font: {
      'heading-h1': {
        fontFamily: 'Inter',
        fontSize: '40px',
        fontWeight: 700,
        letterSpacing: '0px',
        lineHeight: 1.2,
      },
    },
  });
  ```

  同时断言 raw 文件不以 `---` 开头、不包含 formatter-generated comments，`generatedFiles` 只含 `orca-doc2md.yml`。

- [ ] **Step 3: 运行 fixture integration test**

  Run: `bun test tests/integration/theme-service.test.ts`

  Expected: PASS。

- [ ] **Step 4: 提交 fixture**

  ```bash
  git add tests/fixtures/themes/md-yml-orca/main.yaml tests/integration/theme-service.test.ts
  git commit -m "test(tokens): cover md-yml pipeline output"
  ```

- [ ] **Step 5: 运行真实 Orca consumer smoke**

  对当前实例明确使用的两个 source `/Users/teatao/Projects/my-color/orca/main.yaml` 与 `/Users/teatao/Projects/my-color/orca/custom/corerain.yaml` 按上述固定顺序生成 SHA-256 清单；任一缺失、不是 regular file 或是 symlink 都直接失败。用 `mktemp -d` 创建任务独占输出目录，并运行：

  ```bash
  pnpm dev -- dt build \
    -f /Users/teatao/Projects/my-color/orca/main.yaml \
    --platform md-yml \
    --out <task-temp-dir>
  ```

  Expected: default profile 构建成功且只生成 `<task-temp-dir>/orca2md.yml`。用 `js-yaml.load()` 断言至少存在 `color.primary-main`、`color.primary-on-main`、`color.text-disabled`；raw YAML 不含 `[object Object]`、`&ref_`、`*ref_`，且不以 `---` 开头。再次生成相同 source 清单并逐字比较；最后只清理本步骤创建的 task temp directory。

  若真实 Orca 暴露缺口，先提炼仓库内 hermetic regression，再修复并重跑。真实 smoke 不可降级，也不得修改 Orca source。

- [ ] **Step 6: Milestone 2 Critic Gate**

  基线：design spec + 本计划 Milestone 2。提供 config/generator/integration test、typecheck、真实 Orca smoke 与 source hash parity；要求核验 filename、supported list、CLI platform single-pass、`--out` group-preserving、current-pass atomicity、global path planning、colorSpace、fixture shape 与真实 payload。`STATUS: PASS` 后进入 Milestone 3。

## Milestone 3: Documentation, Release Metadata, and Final Verification

完成条件：SPEC、用户手册和 changeset 与真实实现一致；focused tests、full suite、build、style 和 hermetic CLI smoke 全部通过；Milestone 2 已通过的真实 Orca smoke 在最终状态仍有有效证据。

### Task 5: 同步合同文档与 changeset

**Files:**
- Modify: `docs/SPEC.md`
- Modify: `manual/pages/design-token-main-yaml.md`
- Modify: `manual/pages/design-token-extensions-output.md`
- Create: `.changeset/bright-md-yml-output.md`

- [ ] **Step 1: 更新 SPEC 的所有 platform source-of-truth**

  更新 Mental Model 输出列表、CLI `--platform`、config enum、unknown platform supported list、输出格式章节和 multi-platform 示例。新增 md-yml 合同：`<theme>2md.yml`、一级 namespace、组内 hyphen-joined source path、resolved values、无 wrapper/comments/delimiter、explicit composite、安全值失败与当前 pass 原子性。同步纠正 CLI platform semantics：有 `--platform` 时基于 base parameter 建立 single pass；仅 `--out` 时仍覆盖所有 parameter groups。

- [ ] **Step 2: 更新用户手册配置与输出页**

  `design-token-main-yaml.md` 的 platform 表加入 `md-yml`。`design-token-extensions-output.md` 的格式表加入：

  ```markdown
  | `md-yml` | `{theme}2md.yml` | Markdown frontmatter 用 YAML token fragment |
  ```

  增加 Orca-derived 示例和 `{color.primary-main}` 内文引用；明确无 `---`、无 description 注释、不保留 authored alias，且 `filterLayer` 后至少保留 namespace + local key。

- [ ] **Step 3: 添加 minor changeset**

  ```markdown
  ---
  "wave": minor
  ---

  Add the `md-yml` design-token output platform for Markdown-friendly YAML token fragments.
  ```

- [ ] **Step 4: 构建用户手册并检查文档 diff**

  Run: `pnpm manual:build && pnpm check:style`

  Expected: PASS；生成的手册包含 md-yml 页面内容，无格式错误。

- [ ] **Step 5: 提交 docs 与 release metadata**

  ```bash
  git add docs/SPEC.md manual/pages/design-token-main-yaml.md manual/pages/design-token-extensions-output.md .changeset/bright-md-yml-output.md
  git commit -m "docs(tokens): document md-yml output"
  ```

### Task 6: 完成全量验证

**Files:**
- Verify only; no planned source changes.

- [ ] **Step 1: 运行 focused contract suite**

  Run: `bun test tests/format-flat.test.ts tests/format-md-yml.test.ts tests/design-token-config.test.ts tests/cli-dt.test.ts tests/token-generator.test.ts tests/parameter-group-pipeline.test.ts tests/integration/theme-service.test.ts`

  Expected: PASS。

- [ ] **Step 2: 运行 TypeScript 与全量测试**

  Run: `pnpm typecheck && bun test`

  Expected: PASS。

- [ ] **Step 3: 运行完整 CI gate**

  Run: `pnpm check:ci`

  Expected: PASS；包含 typecheck、full tests、manual/CLI build 和 style check。

- [ ] **Step 4: 运行 hermetic CLI smoke**

  先确认 `.tmp/md-yml-smoke` 不存在，再运行：

  ```bash
  pnpm dev -- dt build -f tests/fixtures/themes/md-yml-orca/main.yaml --out .tmp/md-yml-smoke
  ```

  Expected: success receipt；生成 `.tmp/md-yml-smoke/orca-doc2md.yml`。用 `js-yaml.load()` 验证 `color.primary-main`、`radius.md` 和 `font.heading-h1`；完成后只删除本步骤创建的 `.tmp/md-yml-smoke`。

- [ ] **Step 5: 检查提交与工作树边界**

  Run: `git log --oneline --max-count=8 && git status --short`

  Expected: 本计划产生 5 个原子提交；用户原有 `.gitignore`、`CLAUDE.md` 和 `docs/simple-wiki/` 修改仍原样存在，未进入本次提交。

- [ ] **Step 6: Milestone 3 Critic Gate**

  基线：reviewed commit 中的 design spec + 完整实施计划。提供 focused/full/check:ci、hermetic CLI smoke、真实 Orca smoke、source hash parity 证据和最终 diff；要求核验实现忠实度、现有 formatter 回归、文档真实性与 changeset。`STATUS: PASS` 后进入 yes-subagents 收尾整理。

## Post-Implementation Cleanup

全部里程碑 PASS 后：

1. 派遣 Pruner，只扫描本次触及文件，提出带 `file:line` 的清理候选；
2. 派遣 Scout 只读核验候选引用安全性；
3. Pruner 只执行 `SAFE` 项，放弃 `UNSAFE`，把 `UNCERTAIN` 交给 Human；
4. 执行清理后重新运行受影响 focused tests、typecheck 和 style check；
5. 不清理用户原有未提交文件，不扩展到存量技术债。

# Wave Quality Harness

Quality Harness 是 Wave 的质量基座。它不是单纯跑分工具，而是给维护者提供一组指标，用来判断什么时候应该做质量优化，以及优化是否破坏了正确性。

第一批接入对象是 `design-token`。不是所有 Wave 模块都需要 benchmark；只有当模块存在复杂解析、输出兼容、规模变化或重构风险时，才应该接入 Quality Harness。

## 目标

- 正确性：确认 benchmark 编排输出和真实 `generateTheme()` 输出等价。
- 可比性：固定 case、资源来源、临时 workspace 和报告格式。
- 定位能力：记录 `load`、`resource`、`groupPass`、`process`、`generate` 等阶段耗时。
- 决策参考：当耗时、输出规模或失败率出现变化时，帮助判断是否需要优化。

## 目录

```text
benchmarks/
  shared/          通用 harness 类型、统计、报告、文件和环境工具
  design-token/    design-token benchmark case、runner、suite 和 synthetic source
  .tmp/            运行时临时 workspace，已忽略
  .results/        JSON 报告输出，已忽略
```

## 命令

```bash
pnpm bench:smoke
pnpm bench
pnpm bench:baseline
pnpm bench:stress
pnpm bench:compare -- benchmarks/.results/base.json benchmarks/.results/current.json
```

`bench:smoke` 用于快速验证 harness 是否还能工作。`bench` 用于日常本地质量参考。`bench:baseline` 会生成固定 `runId` 的基准报告。`bench:stress` 用于手动观察较大 synthetic case，不应默认放入 CI。

## 指标解释

每个 case 报告包含：

- `status`：case 是否成功。
- `tokensCount`：本次处理的 WaveToken 数量。
- `outputFiles` / `outputBytes`：输出规模。
- `phases.prepareMs`：准备临时 workspace 和复制资源的时间，不计入 pipeline 对比。
- `phases.loadMs`：读取并解析 `main.yaml` 或 `themefile`。
- `phases.resourceMs`：解析 resource 依赖字典。
- `phases.groupPassMs`：解析输出分组。
- `phases.processMs`：解析 token、展开继承、解析引用并转换为 WaveToken。
- `phases.generateMs`：写出目标格式文件。
- `phases.pipelineDurationMs`：从 `loadThemefile()` 开始到输出写完，不包含 prepare 和 artifact collect。
- `stats.meanMs` / `minMs` / `maxMs` / `p95Ms`：多次 iteration 的 pipeline duration 统计。

## 资源隔离

design-token suite 不使用用户本机 resource cache。runner 会：

- 把 fixture 复制到 `benchmarks/.tmp/<runId>/<case>/<iteration>/workspace`。
- 把 repo 内 `src/resources/palettes/tailwindcss.yaml` 和 `src/resources/dimensions/wave.yaml` 复制到 workspace 的 `resources/`。
- 把 `$config.resource` 和 legacy `themefile` 中的 `tailwindcss` / `wave` 改写为 `./resources/*.yaml`。
- 设置隔离的 `WAVE_RESOURCE_CACHE_DIR`、`WAVE_RESOURCE_STATE_PATH`、`WAVE_RESOURCE_CONFIG_DIR`，并在结束后恢复环境变量。

## 何时该优化

优先看趋势，不要只看一次结果。以下情况通常值得进一步分析：

- `generateTheme` 等价性失败。
- `outputFiles` 或 `outputBytes` 非预期变化。
- `processMs` 随 token 数量增长明显失控。
- `resourceMs` 在没有资源变化时大幅上升。
- `generateMs` 在某个输出平台上持续占比过高。
- `bench:compare` 报告 `regressed`，且多次复跑仍稳定复现。

如果只是单次本机波动，不应立刻重构。先复跑，确认趋势，再定位阶段。

## 接入新模块的规则

新模块接入前先确认它确实需要 Quality Harness。接入时至少提供：

- 稳定 case registry。
- 隔离的临时 workspace。
- 可重复的输入来源。
- 产物收集和 hash。
- smoke suite。
- 文档说明指标含义和非目标。

不要把用户手册内容放进这里。Quality Harness 是维护者工具。

## 实例内化回路

当真实项目或实例文档暴露了常规测试没有覆盖的问题，不要只在本轮迭代里手动验证。应把实例提炼为 Quality Harness case，让它成为长期回归资产。

流程：

1. 记录来源：实例名、原始路径、触发命令、实际问题和期望差异。
2. 归因风险：标注它覆盖的是 resource、profile、legacy variant 迁移、parameter group、输出格式、Sketch 映射、warning、性能，还是产物语义漂移。
3. 提炼 fixture：不要直接依赖用户本机路径；把必要结构提炼到 `tests/fixtures/...`，保留能复现风险的最小真实形态。
4. 登记 case：在对应模块的 case registry 中把 `origin` 标为 `example-derived`，并填写 `example.sourceName`、`example.reason` 和 `example.risks`。
5. 加入 suite：默认优先加入 `default`。只有体积很小、能快速证明 harness 正常工作时，才加入 `smoke`。
6. 验证产物：至少断言输出文件清单、关键 hash 或关键语义；不要只断言命令退出码为 0。

`example-derived` case 的目标是防止“真实使用有问题，但测试全绿”。它不是完整复制用户项目，而是把真实项目中暴露风险的结构内化成稳定、可维护、可重复的测试资产。

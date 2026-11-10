# Wave / cli_wave

## 项目描述

Wave 是面向 UI/UX 设计师的本地设计交付 CLI。当前能力包含 design token 生成、本地素材压缩、PNG 帧动效生成和工具链诊断/安装。Design token 使用 `wave token` 模块，`-f` 可选择带有效 `$config` 的 `main.yaml`、包含它的目录或任意目录中的 Day profile。解析内置或自定义资源，完成引用解析、颜色转换、扩展 token 转换，并输出 `json`、`jsonc`、`css`、`sketch` 等格式。

## 愿景

为 UI&UX 设计师提供一把小巧精致的瑞士军刀。

这个项目来自日常设计工作的真实痛点：精心设计的样式难以长期管理，部分重复性设计处理交给脚本会事半功倍。

## 快速开始

先读 `graphify-out/GRAPH_REPORT.md` 了解系统社区和核心节点；注意本仓库实际目录名是 `graphify-out/`，不是 `graphify-output/`。再读 `docs/SPEC.md` 的 `Mental Model`，最后按任务进入对应源码目录。

## 路线图

正在进行瑞士军刀化重构，详情见 `docs/SWISS_KNIFE_REFACTOR.md`。

**规划中**

- `.wave/config.yaml` / `.env`：用于未来承载跨能力的本地项目配置或环境覆盖。
- `doctor --fix`：用于未来在明确安全边界后提供可自动修复的健康检查项。
- `safe/small` 模式切换：用于未来在默认安全压缩之外提供更激进的体积优先策略。

## 核心模型

- `main.yaml` 同时承载 `$config` 和 default profile token，是 base workspace 入口。
- Day profile 可位于 `profiles`、`themes`、`variants` 或其他目录；通过 `-f <profile.yaml>` 选择单文档，并从最近祖先目录定位 base main。批量 `--profiles all` 仍使用既有 workspace 发现规则。
- `$config.resource` 可选，只提供引用解析数据，不直接驱动输出。build 判断有效 token 图能否解析；Doctor 严格检查声明健康。
- `colorSpace` 在输出阶段介入，不改变引用解析过程。
- `wave token build` 的主链路是 `src/cli/commands/build.ts` -> `src/core/pipeline/theme-service.ts` -> `src/core/pipeline/theme-pipeline.ts` -> transformer -> generator。

## 核心路径

- `graphify-out/`：知识图谱产物，快速理解项目结构时先看这里。
- `docs/SPEC.md`：当前行为快照和 agent 必读心智模型。
- `benchmarks/`：Quality Harness；真实实例暴露的缺口要提炼为 `example-derived` case 内化到这里。
- `src/cli/commands/`：CLI 命令入口，包含 `build`、`dt`、`dt-init`、`doctor`、`show` 等模块。
- `src/core/pipeline/`：main workspace 加载、依赖字典、构建 pass 和生成编排。
- `src/core/schema/`：DTCG 标准类型、Wave 明示方言和 typed-reference 合同。
- `src/core/token-values/`：dimension、duration、fontWeight、strokeStyle 和 composite 的共享值合同。
- `src/core/resolver/`：`$extends`、curly alias 和 JSON Pointer 引用解析。
- `src/core/transformer/`：Wave 扩展与 token 转换。
- `src/core/generator/formats/`：输出格式实现。

## DTCG 类型变更护栏

- 增加标准 `$type` 不是扩充枚举。必须沿 `schema -> typed reference -> resolver -> transformer -> JSON/JSONC/CSS/Sketch -> integration` 检查完整合同。
- complete-token alias 必须匹配 source 与 target 的 effective type；property/value slot 按所在字段的 expected type 验证。不要因 resolved value 形状相似而放宽类型。
- DTCG schema 只校验标准合同和明确的 Wave 方言。CSS/Sketch 的非负值、非空 font stack、dash pattern 可表达性等限制留在 formatter，不能上升为 DTCG 输入限制。
- Wave dimension 简写和 typography extensions 是显式方言，不代表 DTCG 标准输入。`opacity` 只存在于 `inheritColor` 或 Sketch property 等 extension，不是标准 token `$type`。
- 未知自定义 scalar 可按平台合同兼容；未知 object/array 必须由专用 formatter 消费或明确失败，禁止生成 `[object Object]`。
- 修改 type/reference/formatter 合同时，在 schema/reference 里程碑后尽早运行真实 Orca canary，不要等到最终 smoke 才发现 consumer 类型债务。
- Orca 全 profile canary 使用 `--profiles all --output <guarded-temp-dir>`，保留配置中的互斥 parameter groups；不要添加全局 `--platform` 覆盖。断言 Sketch payload 前先检查 `sketch.skip`，被跳过的 token 应做负向断言。
- 真实 consumer 暴露的缺口要提炼成 hermetic fixture 和 Quality Harness case；真实仓库 smoke 不能替代仓库内回归，仓库内回归也不能替代真实 smoke。

## 必要命令

```bash
pnpm dev -- --help
pnpm dev -- token build -f tests/fixtures/themes/standard/main.yaml
pnpm dev -- token wcag -f tests/fixtures/themes/doctor-contrast-pass/main.yaml
pnpm typecheck
bun test
```

## 不要误改

- 避免把输出逻辑塞进 resource/parser；先确认它属于 pipeline、transformer 还是 generator。
- 不要绕过 `main.yaml` 直接从资源生成 token，除非任务明确是在修改兼容逻辑。
- 不要恢复 `themefile`、resource 或 Night overlay 作为 Day source；Day profile 则通过统一 `-f` 合同显式选择。

## Simple Wiki

只沉淀可复用知识, 一次性日志、临时命令输出、未经验证的猜测和普通 TODO 不应进入 wiki。

- `docs/simple-wiki/raw` 记录稳定原始材料：项目目标、决策、验证契约和研报等等。
- `docs/simple-wiki/wiki` 是给未来 agent 查阅的知识文档, `INDEX.md` 是目录导览, 优先从导览开始查阅。当某个改动产生会影响未来 agent 判断的知识时，同步更新这些页面。
- 大量查阅资料时, 使用 skill yes-swiki 专属子代理 swarm-reader 完成阅读; 候选页 context 总和阈值见 SCHEMA.md。
- `docs/simple-wiki/LINT.md` 记录查阅中确认的存疑文档及反馈：主体条目待 curator 核实，「ESCALATE」区块内待人工裁决. 查阅中发现存疑，先向 human 反馈，确认后才写入 LINT.md.

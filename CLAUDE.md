# Wave / cli_wave

## 项目描述

Wave 是面向 UI/UX 设计师的 Design Token CLI。它读取 `themefile` 和 `main.yaml`，解析内置或自定义资源，完成引用解析、颜色转换、扩展 token 转换，并输出 `json`、`jsonc`、`css`、`sketch` 等格式。核心目标是让设计师用少量配置生成可交付、可检查、可复用的设计令牌。

## 愿景

为 UI&UX 设计师提供一把小巧精致的瑞士军刀。

这个项目来自日常设计工作的真实痛点：精心设计的样式难以长期管理，部分重复性设计处理交给脚本会事半功倍。

## 快速开始

先读 `graphify-out/GRAPH_REPORT.md` 了解系统社区和核心节点；注意本仓库实际目录名是 `graphify-out/`，不是 `graphify-output/`。再读 `docs/SPEC.md` 的 `Mental Model`，最后按任务进入对应源码目录。

## 路线图

正在进行瑞士军刀化重构，详情见 `docs/SWISS_KNIFE_REFACTOR.md`。

**规划中**

- `.wave/config.yaml` / `.env`：用于未来承载跨能力的本地项目配置或环境覆盖。
- profile：用于未来表达项目、品牌或交付规范级别的可切换上下文。
- `doctor --fix`：用于未来在明确安全边界后提供可自动修复的健康检查项。
- `safe/small` 模式切换：用于未来在默认安全压缩之外提供更激进的体积优先策略。

## 核心模型

- `themefile` 只声明数据源和输出参数，不定义 token 内容。
- `main.yaml` 是 token 内容来源，使用 DTCG 风格结构。
- `RESOURCE` 只提供引用解析数据，不应直接驱动输出。
- `colorSpace` 在输出阶段介入，不改变引用解析过程。
- `wave create` 的主链路是 `src/cli/commands/create.ts` -> `src/core/pipeline/theme-service.ts` -> `src/core/pipeline/theme-pipeline.ts` -> transformer -> generator。

## 核心路径

- `graphify-out/`：知识图谱产物，快速理解项目结构时先看这里。
- `docs/SPEC.md`：当前行为快照和 agent 必读心智模型。
- `src/cli/commands/`：CLI 命令入口，包含 `create`、`doctor`、`init`、`show`。
- `src/core/pipeline/`：themefile 加载、依赖字典、构建 pass 和生成编排。
- `src/core/transformer/`：Wave 扩展与 token 转换。
- `src/core/generator/formats/`：输出格式实现。

## 必要命令

```bash
bun run dev -- --help
bun run dev -- create -f tests/fixtures/themes/standard/themefile
bun run dev -- doctor --contrast -f tests/fixtures/themes/doctor-contrast-pass/themefile
bun run typecheck
```

## 不要误改

- 避免把输出逻辑塞进 resource/parser；先确认它属于 pipeline、transformer 还是 generator。
- 不要绕过 `main.yaml` 直接从资源生成 token，除非任务明确是在修改兼容逻辑。

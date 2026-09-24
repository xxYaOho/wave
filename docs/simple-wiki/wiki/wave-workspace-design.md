---
title: Wave Workspace Design
type: decision
created: 2026-08-31
updated: 2026-08-31
sources: [raw/2026-06-01-workspace-design.md, raw/wave-dt-profile-model.md]
topic: Wave Workspace
tags: [workspace, TUI, configuration, receipt]
context: 1
status: current
---

# Wave Workspace Design

## 范围与入口

该设计把既有 `foldify-p` 工作流纳入 `wave workspace`，用于创建本地设计项目 workspace；media-library rename、workspace migration 和 global profile system 不在范围内。[Wave Workspace Design](../raw/2026-06-01-workspace-design.md)

`wave workspace` 是低记忆入口，与 `wave workspace create` 等价并启动 TUI。未来的 `config`、`doctor` 子命令不属于第一版。[Wave Workspace Design](../raw/2026-06-01-workspace-design.md)

这套 workspace profile 与 design-token 的 profile 是不同层级：前者是目录创建工作流，后者是 token 消费目标；design-token profile 的入口和选择规则见 [Wave DT Profile Model](wave-dt-profile-model.md) [Wave DT Profile Model Notes](../raw/wave-dt-profile-model.md)。

## 配置与命名

用户配置位于 `~/.config/wave/workspace.yaml`，缺失时使用内置默认值；测试可用 `WAVE_WORKSPACE_CONFIG` 指定隔离文件。`name.parts` 使用 bare keys，同时决定 TUI prompt 顺序和 workspace 名称顺序；禁用字段跳过，空的 optional 值不留下重复 separator。`title` 在 v1 必须启用且必填。[Wave Workspace Design](../raw/2026-06-01-workspace-design.md)

自定义 type 只对当前运行生效：输入 trim 后转大写，空格转 `_`，保留 letters、numbers、`_`、`-` 和 CJK，不写回配置。version prefix、bracket tags 和 type default 都有显式归一化/匹配规则；YAML typo 或未知 `name.parts` 必须报配置错误，不能猜测修复。[Wave Workspace Design](../raw/2026-06-01-workspace-design.md)

写入前必须展示最终 workspace name、目标路径和 folder count 的 preview，并由用户确认。这个确认是目录创建前的行为边界，不是创建后的可恢复机制。[Wave Workspace Design](../raw/2026-06-01-workspace-design.md)

## 创建与结果

确认后依次创建 base directory、目标 workspace、配置顺序中的 folders、可选 placeholder 和 `README.md`；目标目录已存在时拒绝继续，不覆盖已有 workspace。README 使用项目 title，并按配置与实际创建的 folder list 生成；Finder 只在 `openAfterCreate: true` 时打开，打开失败只发 warning，不回滚已创建文件。[Wave Workspace Design](../raw/2026-06-01-workspace-design.md)

receipt 只展示 workspace 名称、Type、Project、Workspace、FOLDERS 和完成状态，不展示 Config 或 placeholder files；version disabled 时也不展示 version。路径优先使用 cwd-relative、其次 `~/...`、最后 absolute path，并保持 CJK 名称下的对齐、padding 和 truncation。[Wave Workspace Design](../raw/2026-06-01-workspace-design.md)

## 安全边界

folder path 必须是相对路径且不得包含 `..`；config 中的空 type、无效 default、非法 title 和已存在 workspace 都有稳定 `WWK_*` 错误码。测试应隔离 HOME、config、output 和 Finder，不触碰真实用户环境。[Wave Workspace Design](../raw/2026-06-01-workspace-design.md)

本页记录的是 2026-06-01 设计合同；它描述入口、配置、创建和 receipt 语义，不单独证明当前 CLI 已实现所有细节。[Wave Workspace Design](../raw/2026-06-01-workspace-design.md)

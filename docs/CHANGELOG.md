# Changelog

All notable changes to wave will be documented in this file.

## v0.4.0 — 2026-04-01

> 新增 DTCG `$ref` 引用支持和色彩空间转换，实现完整的 Design Token 工作流

### Added

- **DTCG `$ref` 引用支持**：符合 DTCG 规范的 JSON Pointer 格式引用
  - 语法：`$ref: "#/theme/color/primary/$value"`
  - 支持属性合并（`$ref` + `alpha`/`color`）
  - 支持嵌套对象和数组中的引用
  - 自动循环引用检测
- **DTCG 色彩空间支持**：OKLCH、sRGB、HSL 格式转换
  - 支持 `PARAMETER colorSpace` 在 themefile 中配置全局输出色彩空间
  - hex 字符串自动转换为指定色彩空间格式
- **文档重构**：新建 `docs/GUIDE.md` 完整使用指南，简化 `README.md` 为快速入门

### Fixed

- OKLCH 输出精度优化（L: 1位小数，C: 3位小数，H: 2位小数）
- 灰度颜色（黑、白、透明）色相 NaN 处理，统一输出为 0
- 0 值格式化优化，去除冗余小数位和尾部零（`0.0%` → `0%`，`0.200` → `0.2`）

---

## v0.3.1 — 2026-02-28

> 修复 filterLayer 在 variant 主题中 key 格式与 main 不一致的问题

### Fixed

- filterLayer 在 variant 主题输出的 key 格式与 main 不一致（`color-transparent` → `transparent`）

---

## v0.3.0 — 2026-02-28

> 增强引用系统，支持文件内部嵌套引用和循环引用检测；项目正式更名为 wave

### Added

- 支持 `{theme.xxx}` 内部嵌套引用解析
- 循环引用检测，构建时报错并显示引用链路
- 未解析引用的友好错误提示，显示具体位置
- `$description` 备注位置优化：单行放同行末尾，多行放 token 上方
- 保持 token 输出顺序与 yaml 文件定义顺序一致

### Changed

- 项目更名：wave-v2 → wave

---

## v0.2.1 — 2026-02-27

> 实现 YAML 内容解析，支持通过 main.yaml 定义 DTCG 格式 design tokens 和跨数据源引用

### Added

- 支持 `main.yaml`、`main@night.yaml`、`variants/*.yaml` 主题配置解析
- 支持 DTCG 格式 token 引用解析（`{leonardo.xxx}` / `{wave.xxx}`）
- 支持 color+alpha 复合值转换为带透明度的 hex 颜色

### Fixed

- `resolveReference` 函数 if 语句结构错误导致编译失败
- 正则表达式不匹配引用路径中的数字段（如 `.600`）

---

## v0.2.0 — 2026-02-27

> 重构 CLI 签名，移除内置主题，修复多个 filterLayer 和 platform 输出 Bug

### Added

- `wave theme` 支持不带参数运行，自动读取当前目录的 themefile

### Changed

- 移除内置主题（`BUILTIN_THEMES = {}`），用户必须通过 themefile 指定 palette 和 dimension

### Fixed

- `filterLayer` 参数同时支持 `filter-layer`（连字符）和 `filterLayer`（驼峰）写法
- `filterLayer` options 传递位置从 platform 级别修正为 file 级别
- `themefile output` 参数未正确传递，现在正确输出到配置目录
- `platform=general/css` 正确控制输出格式
- `platform=undefined` 时错误显示 `.css` 文件的日志 Bug

---

## v0.1.0 — 2026-02-20

> MVP 版本，建立 CLI 骨架，实现内置主题生成、platform 参数、Night 模式和 Variants

### Added

- CLI 基础命令：`version`、`help`、`doctor`
- 内置 beluga 主题一键生成
- `platform` 参数控制输出格式（`general` / `css`）
- Night 模式自动检测，支持 `--no-night` 禁用
- Variants 变体自动检测，支持 `--variants` / `--no-variants` 控制
- 退出码规范：0 成功，2 无效命令，3 主题未找到，10 文件不存在

### Fixed

- JSONC 输出中 `undefined` 改为使用 `$value` 替代 `value`
- 无效命令退出码从 1 修正为 2（INVALID_COMMAND）
- `--file` 不存在退出码从 3 修正为 10（FILE_NOT_FOUND）
- Commander.js 对 `--no-variants` 选项的解析异常

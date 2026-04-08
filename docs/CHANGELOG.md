# Changelog

All notable changes to wave will be documented in this file.

## v0.10.3 — 2026-04-07

> 修复 flat-json 输出中内部字段泄露问题

### Fixed

- **过滤内部字段**: flat-json 输出时过滤内部使用的 `_color` 字段

---

## v0.10.2 — 2026-04-07

> 使用现代 CSS rgb() 语法

### Changed

- **CSS 输出格式**: 更新为现代 CSS Color Module Level 4 语法 `rgb(R G B / A)`

---

## v0.10.1 — 2026-04-07

> 修复 shadow 数组顺序以匹配 Sketch UI

### Fixed

- **Sketch shadow 顺序**: 反转 shadow 数组顺序，与 Sketch UI 中从下到上的层级顺序一致

---

## v0.10.0 — 2026-04-07

> 实现 Sketch API 兼容的分组输出格式

### Added

- **Sketch API 格式**: 新增 `{theme}2sketch.json` 输出，支持嵌套分组结构
  - 颜色按 `color/primary-main` 路径扁平化
  - style 组保留嵌套层级，包含 interaction、shadow、gradient
  - 完整保留层级关系，便于 Sketch 变量管理

### Changed

- **Sketch 格式重构**: 重写 sketch format transform，统一处理颜色 token
- **完整设计令牌支持**: Sketch 输出支持所有颜色相关设计令牌

---

## v0.9.2 — 2026-04-06

> shadow 输出内置清理 px 单位

### Changed

- **shadow 格式优化**: 自动清理 px 单位，输出干净数值

---

## v0.9.1 — 2026-04-06

> currentColor 扩展支持 shadow 子属性

### Added

- **shadow 引用支持**: currentColor 扩展现在支持 shadow 的 color 属性引用

---

## v0.9.0 — 2026-04-06

> 修复 $ref 覆盖时外部字符串引用解析问题

### Fixed

- **$ref 覆盖解析**: 修复 `$ref` override 中外部字符串引用（如 `{leonardo.xxx}`）未被正确解析的问题

---

## v0.8.0 — 2026-04-04

> 新增 list 和 show 命令用于查看内置资源

### Added

- **`wave list` 命令**: 列出所有内置调色板和尺寸系统
- **`wave show <name>` 命令**: 查看指定内置资源的详细内容
  - 支持 `--format flat-json|json|yaml` 输出格式
  - 自动合并 dimension 的 value 与 unit

---

## v0.7.0 — 2026-04-03

> 实现 smoothShadow shadow layer 平滑派生

### Added

- **smoothShadow 扩展**: 支持 shadow token 的平滑过渡派生
  - 通过 `$extensions.smoothShadow` 配置
  - 支持 cubic-bezier 曲线采样
  - 自动生成多层阴影实现平滑效果

---

## v0.6.0 — 2026-04-03

> RESOURCE 语法重构，引入 theme-service 架构

### Changed

- **CLI 架构重构**: 分离 CLI 编排逻辑与核心服务
- **统一退出策略**: 所有命令使用统一的退出码处理
- **引用失败策略**: 统一引用解析失败时的错误处理

### Added

- **RESOURCE 语法**: 统一使用 `RESOURCE <kind> <ref>` 声明资源
  - `kind`: palette, dimension, custom
  - 旧 PALETTE/DIMENSION 语法仍兼容但已弃用

---

## v0.5.0 — 2026-04-02

> 支持多平台输出，默认仅生成 json

### Changed

- **默认输出**: 默认仅生成 `json` 格式（之前生成全部格式）
- **platform 参数**: 支持 `json,jsonc,css,sketch` 多平台同时输出

### Added

- **Sketch 颜色调色板**: 初步支持 Sketch 颜色变量导出
- **YAML 结构校验**: 使用 Zod 添加主题 YAML 结构校验

---

## v0.4.3 — 2026-04-01

> 修复色彩空间转换不完整的问题

### Fixed

- **色彩空间转换修复**：`color+alpha` 复合值现在正确遵循 colorSpace 参数
  - 修复 `interaction-hover` 等带 alpha 的颜色输出为 hex 而非 hsl 的问题
  - `convertColorWithAlpha` 添加 `targetFormat` 参数支持色彩空间转换
  - `flat.ts` 优先使用 `token.value`（转换后）而非 `token.$value`（原始值）

---

## v0.4.1 — 2026-04-01

> 修复 CSS 输出中 shadow 和 gradient 格式错误，添加 DTCG shadow/gradient 类型解析支持

### Added

- **DTCG shadow 类型支持**：支持 `$type: shadow` 的复合值解析
  - 支持 `color` + `alpha` 组合
  - 支持 `offsetX`, `offsetY`, `blur`, `spread` 属性
- **DTCG gradient 类型支持**：支持 `$type: gradient` 的复合值解析
  - 支持颜色节点数组，每个节点可包含 `color`, `alpha`, `position`
  - 支持 `$ref` 引用在渐变节点中

### Fixed

- **CSS 输出格式修复**：shadow 和 gradient 类型在 CSS 变量中正确格式化
  - Shadow: 输出标准 CSS box-shadow 格式
  - Gradient: 输出标准 CSS gradient 格式

---

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

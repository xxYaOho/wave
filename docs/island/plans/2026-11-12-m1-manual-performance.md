---
date: 2026-11-12
state: 待 STRICT FULL（M1 首轮）
dispatch: 路线图计划 M1（依赖当前手册施工 + C1：均已交付集成；可与 C2 并行）；Human 裁决 2026-11-12 开启；路线图 Implementation Decision 7 明确点名 `-m` 为 M1 交付物（特定条款优先于路线图通用「不引入新参数」约束）
---

# Wave M1 Manual 性能 Plan

## Problem Statement

手册体验当前只有一条网页运行时路径：`wave manual` 起本地服务器（`core/manual/server.ts` startManualServer + 开浏览器）服务 vite 构建的 SPA。三个缺口：① 全部页面内容经 `manual-data.ts` 单模块打包（无路由级按需加载，首屏载入全部文档）；② 搜索无构建期索引（客户端全量扫描，随内容增长线性劣化）；③ 终端场景无文本直读——查一条命令的说明必须启动服务器与浏览器。路线图 M1：静态内容、构建时搜索索引、路由按需加载、`-m` 直接读取打包文本不启动网页运行时。

## Solution

构建期三件套 + 终端直读：① `buildManualData` 扩展产出构建期搜索索引与逐路由内容块（产物契约只增）；② SPA 路由按需加载（dynamic import 逐路由数据块，vite 分包）；③ `wave manual -m [query]` 文本模式——读取打包产物直接输出（页面文本或命中列表），零 server、零浏览器。server 交互路径保持不变（回归保护）。

## Rex 对话协议

主代理（Hyata，block `01a1c840-368d-74ed-a73a-ff1e89c91557`）编排与统一 gate；会话 `session:01a1ac63-3359-7305-a46f-01905fa5fd4b`。STRICT = m1-strict block `01a1cf4a-bcf3-7995-9866-9f35104918f2`（max，派遣前 /clear 校准）；CODER-PLUS = m1-coder-plus block `01a1cf4a-7257-7cd9-89e7-2d9e0c326b93`（high，派遣前 /clear 校准）。规则同 Q0 SPEC。

## User Stories

1. 作为设计师，我希望终端里 `-m` 直接读手册文本，以便不启动浏览器就能查到命令说明。
2. 作为设计师，我希望手册页面按需加载且搜索即时，以便首屏与检索不随内容增长劣化。

## Constraints

- 手册内容与信息架构不变：`manual/pages`、`pages-en`、`manual.config.yaml` 的内容零修改（本计划只改打包与消费方式）。
- server 交互路径行为不回归：`wave manual`（无 -m）的既有行为（端口、URL、浏览器、Ctrl+C 停止）保持。
- 视觉重设计不在本计划（路线图：M1 只承接性能与静态内容架构）。
- 写边界：`src/core/manual/*`（build/读取模块扩展）、`src/manual-app/src/*`（数据分包与路由）、`scripts/build-manual.ts`（如涉及）、`src/cli/commands/manual.ts`、`manual-action.ts`（-m 接线）、`tests/m1-*.test.ts`。禁动：`manual/pages*` 内容、其他 CLI 命令文件、C1 registry 架构。
- `-m` 为 manual 命令内新 option（`wave manual -m [query]`），不新增全局 alias 或独立命令。

## Implementation Decisions

1. **构建期索引与内容块**（`src/core/manual/build.ts` 扩展，产物契约只增）：`buildManualData` 在既有产物外增发——① 构建期搜索索引（标题/路径/正文词条，来源 `manual/pages*` Markdown 与 config，构建时一次生成）；② 逐路由内容块（每页独立可加载单元）。既有产物字段零修改（SPA 现有消费不破坏）。
2. **路由按需加载**（`src/manual-app/src/*`）：路由级 dynamic import 承接逐路由内容块；`manual-data.ts` 单模块聚合改为分发器（保持既有导出形状兼容或由消费方同步改接——以 vite 分包证据为准）；搜索消费构建期索引（不再客户端全量扫描）。
3. **`-m` 文本直读**（新 `src/core/manual/text-reader.ts` + CLI 接线）：`wave manual -m [query]`——无 query：输出页面目录（标题+路径列表）；有 query：索引命中列表（标题/路径/摘要）；精确页面名命中：输出该页 Markdown 渲染文本（打包产物内读取）。零 server、零浏览器、进程即时退出；exit 0 命中 / exit 1 无命中或产物缺失（产物缺失时给出 `pnpm manual:build` 提示）。
4. **产物依赖声明**：`-m` 与 server 同源消费 `dist/manual-app` 产物；dev 路径（`manual:dev` vite dev server）不在本计划范围。
5. 双层验证：构建产物断言（索引存在/逐路由块/chunk 分析）+ 运行时行为断言（-m 文本输出、server 回归、SPA 分包加载）。

## Testing Decisions

- 构建期：`pnpm manual:build` 后断言索引与逐路由块产物存在且覆盖 `manual.config.yaml` 全部路由；dist chunk 分析断言路由分包生效（无单一大块承载全部页面）。
- `-m` 行为：无 query 列目录；query 命中列表；精确页面输出正文文本（与源 Markdown 内容一致性抽样）；无命中 exit 1；产物缺失提示正确。
- server 回归：`wave manual --no-open` 起服、URL 可达、Ctrl+C 退出——既有测试全绿零断言变更。
- 质量门：`pnpm check:ci` 不退化（mise bun 1.3.6，`--timeout 15000`）。

## Out of Scope

- 不做视觉重设计；不改手册内容与信息架构；不改 manual:dev 工作流。
- 不引入全局 `-m` alias 或新命令（-m 挂在 manual 命令内）。
- 不做服务端渲染/SSG 站点（保持 vite SPA 架构，只做分包与索引）。
- 不引入持久缓存协议。

## Draft Plan

- 结构总览：构建期（build.ts：索引+内容块+数据分发）→ 产物（dist/manual-app：SPA + 索引 + 路由块）→ 双消费（SPA 路由按需加载 / `-m` 文本直读）。
- 关键契约：构建产物只增形状（索引 + 逐路由块）；`-m` 行为合同（三种模式 + 退出码）；路由分包证据标准。
- 文件结构：见 Constraints。
- 风险与未决：`buildManualData`/`manual-data.ts`/`App.tsx` 内部结构待施工方勘测后细化（本 SPEC 冻结行为契约，内部重排由 Task 勘测驱动——FULL-1 类教训：不对未核实内部立约）；索引分词口径（中英混排）在 Task 内以简单包含匹配起步，不预支复杂 NLP。无阻塞未决。
- 里程碑草案：单一 Milestone（构建期三件套 + -m + 双消费验证）。

## Implement Plan

worktree `m1-manual-performance`（已 FF 到 main @ f83196c）。顺序：Task-1 构建期产物扩展 → Task-2 SPA 分包与 -m 直读 → 闸门 → pruner → 集成。SPEC 通过 fresh FULL 后冻结；strict 不进施工期；gate = 主代理；单 Milestone 单派遣薄壳。

## Milestone-1

构建期索引、路由分包与 -m 直读

- 验证主题：构建产物三件套就位（索引/内容块/分包）；SPA 按需加载生效且搜索消费构建期索引；`-m` 三模式行为正确且零运行时依赖；server 路径不回归。
- 核验基线（固定命令）：`pnpm check:ci` exit 0；`bun test tests/m1-build-artifacts.test.ts tests/m1-text-reader.test.ts`（mise bun 1.3.6，`--timeout 15000`）；`pnpm manual:build` + 产物断言；`wave manual -m` 三模式实跑断言；`wave manual --no-open` 回归。
- 来源：User Stories 1–2；Implementation Decisions 全部；Testing Decisions 全部。

### Task-1

构建期索引与内容块（来源：User Story 2；Decisions 1）

- 验收标准：`buildManualData` 产物只增扩展就位（索引 + 逐路由块，既有字段零修改）；覆盖 config 全部路由；构建断言测试就位；勘测报告（build.ts/manual-data.ts/App.tsx 内部结构）写入 DELEGATION 供 Task-2 消费。
- 可动文件范围：`src/core/manual/build.ts`、`scripts/build-manual.ts`（如涉及）、`tests/m1-build-artifacts.test.ts`。
- 依赖：无。
- 固有风险：索引词条口径（中英混排包含匹配起步）；产物体积膨胀监测（超常需报告）。

- [ ] 产物只增扩展 + 构建断言测试。
- [ ] 内部结构勘测报告。

### Task-2

路由分包与 `-m` 直读（来源：User Story 1；Decisions 2/3/4；Testing Decisions 全部）

- 验收标准：SPA 路由 dynamic import + 分包证据（chunk 分析断言）；搜索消费构建期索引；`text-reader.ts` 三模式实现 + CLI 接线；`-m` 行为测试全绿；server 回归零断言变更；全量质量门绿。
- 可动文件范围：`src/manual-app/src/*`、`src/core/manual/text-reader.ts`（新）、`src/cli/commands/manual.ts`、`manual-action.ts`、`tests/m1-text-reader.test.ts`。
- 依赖：Task-1。
- 固有风险：manual-data 既有消费形状变更需与分包同步（消费方全部改接）；-m 文本渲染与 SPA 展示的内容一致性抽样。

- [ ] SPA 分包 + 索引消费改接。
- [ ] `-m` 实现、CLI 接线与全量验证。

> [!IMPORTANT]
> Milestone-1 闸门（唯一闸门）：主代理复核构建产物证据、chunk 分包证据、-m 实跑输出与 server 回归，通过后 pruner 收尾、按路线图集成 main。

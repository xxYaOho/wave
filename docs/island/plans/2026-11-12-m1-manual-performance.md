---
date: 2026-11-12
state: 待 fresh FULL-2（v2 修订）
dispatch: 路线图计划 M1（依赖当前手册施工 + C1：均已交付）；FULL-1 FAIL（3F/6M/1m）→ v2：`-m` 事实重定位（已存在全局手册页机制——index.ts 在 Commander 前拦截、manual-markdown.ts 渲染、编译 CLI 内嵌 WAVE_MANUAL_DATA；M1 缺口 = 手册页面级直读 + 构建期索引 + SPA 分包）、产物双轨契约冻结（legacy JSON 不变 + 新增路由块/索引 + 运行时回退）、-m 三模式可判定合同、server 回归测试实体化、编译 CLI 消费面纳入、分包门禁可证伪化、manual:dev 冒烟、Task-2 边界收窄
---

# Wave M1 Manual 性能 Plan

## Problem Statement

手册链路三个性能缺口（FULL-1 修正后的事实基面）：① 全部页面内容经单一 `manual-data.json` 打包，`App.tsx` 依赖每页完整 `searchText/html`——首屏载入全部文档，无路由级按需加载；② 搜索为客户端全量扫描（`App.tsx:632-638` 对选定 locale 的小写化 searchText 取前 8 条），无构建期索引；③ **`-m` 已存在但仅覆盖命令页**：`wave <command> -m` 由 `index.ts:48-59` 在 Commander 之前拦截（`resolveManualPath`/`renderManual`）、`manual-markdown.ts` 渲染该命令的手册页文本、编译 CLI 经 `WAVE_MANUAL_DATA` define 内嵌数据——手册**页面内容**（design-token 等全量页面）无终端直读路径。路线图 M1：静态内容、构建时搜索索引、路由按需加载、-m 直接读取打包文本。

## Solution

构建期双轨产物 + 三个消费改造：① `buildManualData` 产物只增——**legacy `manual-data.json` 形状零修改**（SPA 回退保证），新增逐路由内容块（`pages/<locale>/<route>.json`）与构建期搜索索引（`search-index.json`，记录形状冻结）；② SPA 路由 dynamic import 逐路由块 + 搜索消费构建期索引（legacy JSON 作回退通道）；③ `wave manual -m [query]` 扩展为手册页面级文本直读（三模式可判定合同）——经既有 `-m` 链（index.ts/manual-markdown.ts）实现，**语义变化范围仅限 manual 命令自身的 -m**（其他命令的 -m 行为零变化）。server 交互路径回归保护实体化为测试。

## Rex 对话协议

主代理（Hyata，block `01a1c840-368d-74ed-a73a-ff1e89c91557`）编排与统一 gate；会话 `session:01a1ac63-3359-7305-a46f-01905fa5fd4b`。STRICT = m1-strict block `01a1cf4a-bcf3-7995-9866-9f35104918f2`（max，派遣前 /clear 逐步捕获校准）；CODER-PLUS = m1-coder-plus block `01a1cf4a-7257-7cd9-89e7-2d9e0c326b93`（high，同前）。规则同 Q0 SPEC。

## User Stories

1. 作为设计师，我希望终端里 `-m` 直接读手册页面文本并搜索，以便不启动浏览器就能查手册。
2. 作为设计师，我希望手册页面按需加载且搜索即时，以便首屏与检索不随内容增长劣化。

## Constraints

- 手册内容与信息架构不变：`manual/pages`、`pages-en`、`manual.config.yaml` 内容零修改。
- **产物双轨契约（冻结，FULL-1 F-02）**：legacy `manual-data.json` 形状零修改（既有 SPA 消费保证）；新增产物全部只增——逐路由块 `pages/<locale>/<route>.json`（形状：`{ route, locale, title, html, searchText, …现状页面字段 }`）与 `search-index.json`（记录形状见 Implementation Decisions 2）。生成时序保持现状（vite build → buildManualData 追加写入）。
- **`-m` 语义变化范围（显式声明）**：仅 `manual` 命令自身的 `-m` 行为变化（命令页直读 → 手册直读三模式）；**其他所有命令的 `-m` 行为零变化**。C1 冻结面最小触碰授权：`src/cli/index.ts`（manual 预解析分支）、`src/cli/manual-markdown.ts`（页面读取扩展）——属路线图 M1 边界「Markdown 打包链路」；`registry.ts` 仅在 -m 递归注入干扰 manual 自身 -m 时最小调整。
- server 交互路径行为不回归，并以测试实体化（M-01）：进程启动、URL 输出、端口默认/自动、`--no-open`、SIGINT 退出。
- 视觉零改动（m-01 负向门禁）：`styles.css`、`BrandMark.tsx` 等视觉文件不在可动范围，验收含 `git diff --name-only` 负向断言。
- 写边界：`src/core/manual/*`（build.ts 扩展、text-reader.ts 新）、`src/manual-app/src/{manual-data.ts, App.tsx, 路由相关模块}`、`src/cli/index.ts`（manual 分支）、`src/cli/manual-markdown.ts`、`src/cli/commands/manual.ts`、`manual-action.ts`、`scripts/build-manual.ts`（如涉及）、`tests/m1-*.test.ts`。禁动：`manual/pages*` 内容、styles.css/BrandMark 等视觉文件、其他 CLI 命令文件（除上述两文件的最小触碰）。

## Implementation Decisions

1. **构建期产物扩展**（`src/core/manual/build.ts`，双轨只增）：legacy `manual-data.json` 字段零修改；新增 ① 逐路由块（zh/en 双语全覆盖，路由集 = config 全集）② `search-index.json`。**索引记录形状（冻结，FULL-2 M-04）**：`{ route: string, locale: 'zh' | 'en', title: string, description: string, category?: string, searchText: string }`——`searchText` 归一化规则冻结：Unicode NFKC + 小写化 + 空白序列折叠为单空格，内容来源 = 页面 title + description + 正文文本；**匹配语义 = searchText 子串包含**（构建期已归一化，查询侧同样归一化后包含匹配）；结果顺序 = config 路由顺序；SPA 命中截断沿用现状前 8 条（App.tsx 现行为），`-m` 命中列表同取前 8 条。
2. **SPA 分包与索引消费**（`src/manual-app/src/*` 限定 manual-data.ts/App.tsx/路由模块，m-01）：路由内容改 dynamic import 逐路由块（**回退合同：路由块缺失/加载失败 → 回退 legacy `manual-data.json` 全量加载**——保证回归安全）；搜索改读 `search-index.json`（匹配语义同上，前端截断前 8 条维持现状）。既有 `manual-data.json` 保留为回退 + 首屏 shell 数据。
3. **`-m` 手册直读**（新 `src/core/manual/text-reader.ts` + `manual-markdown.ts` 页面读取扩展 + `index.ts` manual 分支接线）。**三模式可判定合同（冻结，FULL-1 F-03）**：
   - 无 query：输出手册目录——按 config 路由顺序逐行 `<route>\t<title>`（默认 locale zh），stdout，exit 0。
   - query 精确命中：query 归一化（同索引规则）后与任一 locale 的 `title` 或 `route` **精确相等** → 唯一命中时输出该页正文文本（对应 locale 的页面内容），exit 0；多 locale 同名 → 按 zh 优先取一；跨页同名（同 locale 两条以上）→ 输出歧义列表（route 列表），exit 1。
   - query 非精确命中：索引包含匹配（归一化子串）→ 命中列表前 8 条（`<route>\t<title>\t<首处摘要 ≤60 字符>`，locale 标注），有命中 exit 0；零命中 exit 1（stdout 仅输出 `No matches.` 单行）。
   - 多词 argv 以单空格连接为一个 query；错误与诊断走 stderr；产物缺失（`dist/manual-app` 不存在）→ stderr 提示 `Run pnpm manual:build first.` + exit 1。语义变化仅限 manual 命令（其他命令 `-m` 走原路径零变化）。
4. **编译 CLI 消费面（FULL-2 M-02）**：`-m` 页面内容与索引读取 `dist/manual-app` 产物（与 server 同源）；`scripts/build-cli.ts` 的 `WAVE_MANUAL_DATA` define 内嵌**零修改**（命令页直读既有机制不回归，既有 build-cli 测试零断言变更保证）；text-reader 在产物缺失时的行为即上列合同（不做嵌入回退——页面内容体积不入编译产物，显式报错引导构建）。
5. **server 回归测试实体化（FULL-2 M-01）**：新 `tests/m1-manual-server.test.ts`——spawn `wave manual --no-open`（C1 cli-runner 基座）断言：URL 行输出格式、默认端口 4567/占用时自动回退、`--port` 显式生效、SIGINT 后进程退出；既有 cli-manual 测试零断言变更。
6. **分包门禁可证伪化（FULL-2 M-03）**：构建断言测试 `tests/m1-build-artifacts.test.ts` 固定检查——① 每路由（zh/en 全集）存在独立 chunk 文件；② 页面正文标记串（取样 3 个页面的特征句）不出现在初始入口 chunk（grep dist 资产）；③ 路由块总数 = config 路由数 × 2 locale；④ 索引文件存在且记录数一致。任意 vendor split 不满足 ①–④ 即失败。
7. **manual:dev 冒烟（FULL-2 M-06，路线图 Testing Decision 6）**：`manual:dev` 开发链回归——有界启动 vite dev + HTTP GET / 返回 200 后关闭（脚本化，计入核验基线），证明开发消费链未回归。

## Testing Decisions

- 构建期（Decisions 1/6）：`pnpm manual:build` 后断言索引/路由块产物存在、记录形状与归一化规则（抽样断言 searchText 无大写/连续空白）、双语覆盖、分包门禁四条。
- `-m` 行为（Decisions 3）：三模式逐条断言（目录行序 = config 顺序；精确命中正文与源 Markdown 内容一致性抽样；歧义列表；命中列表截断 8；零命中 exit 1 与单行输出；多词 argv；产物缺失提示）；其他命令 `-m`（如 `wave token -m`）零变化断言。
- server 回归（Decisions 5）：进程级行为断言清单；既有 cli-manual 测试零断言变更。
- manual:dev 冒烟（Decisions 7）：脚本化有界启动 + 200 断言。
- 质量门：`pnpm check:ci` 不退化（mise bun 1.3.6，`--timeout 15000`）。

## Out of Scope

- 不做视觉重设计（styles.css/BrandMark 负向门禁）；不改手册内容与信息架构。
- 不引入全局 alias 或新命令（-m 扩展限于 manual 命令自身语义）。
- 不做 SSG；保持 vite SPA 架构。
- 不引入持久缓存协议；不做搜索相关性排序优化（包含匹配 + 路由序冻结）。

## Draft Plan

- 结构总览：构建期（build.ts 双轨产物）→ 产物（legacy JSON 不变 + 路由块 + 索引）→ 三消费（SPA 分包 + 索引搜索 / -m 页面直读 / server 不变）。
- 关键契约：产物双轨只增（含回退合同）；索引记录形状与归一化/匹配语义；-m 三模式合同；C1 冻结面最小触碰范围。
- 文件结构：见 Constraints。
- 风险与未决：App.tsx 路由改造与回退通道的交互需勘测驱动（Task-1 勘测报告交接，格式见 Decisions/Task-1）；`index.ts` manual 分支触碰需逐行最小化（闸门重点：其他命令零变化断言兜底）。无阻塞未决。
- 里程碑草案：单一 Milestone。

## Implement Plan

worktree `m1-manual-performance`（已 FF 到 main @ f83196c）。顺序：Task-1 构建期双轨产物 + 勘测报告 → Task-2 SPA 分包 + -m 直读 + 回归三件套 → 闸门 → pruner → 集成。SPEC 通过 fresh FULL-2 后冻结；strict 不进施工期；gate = 主代理；单 Milestone 单派遣薄壳。

## Milestone-1

构建期索引、路由分包与 -m 手册直读

- 验证主题：双轨产物就位且 legacy 不变；分包门禁四条可证伪；-m 三模式合同可执行；server/manual:dev 回归证明。
- 核验基线（固定命令）：`pnpm check:ci` exit 0；`bun test tests/m1-build-artifacts.test.ts tests/m1-text-reader.test.ts tests/m1-manual-server.test.ts`（mise bun 1.3.6，`--timeout 15000`）；`pnpm manual:build` + 分包门禁断言；`wave manual -m` 三模式实跑；manual:dev 冒烟脚本；既有 cli-manual/build-cli 测试零断言变更。
- 来源：User Stories 1–2；Implementation Decisions 全部；Testing Decisions 全部。

### Task-1

构建期双轨产物与勘测交接（来源：User Story 2；Decisions 1；Testing Decisions 构建期）

- 验收标准：build.ts 双轨扩展（legacy 零修改 + 路由块 + 索引，形状/归一化规则冻结实现）；构建断言测试四条门禁全绿；**勘测报告**（写入本 Task 交付报告的固定小节，必含字段：`build.ts`/`manual-data.ts`/`App.tsx`/`src/manual-app` 其余模块/`src/cli/{index,manual-markdown,registry}.ts`/`scripts/build-cli.ts` 及既有 manual 相关测试的逐文件消费点清单——每文件列出 manual 数据/页面内容的读取点 file:line 与 Task-2 改接判断）供 Task-2 机械消费（FULL-2 M-05）。
- 可动文件范围：`src/core/manual/build.ts`、`scripts/build-manual.ts`（如涉及）、`tests/m1-build-artifacts.test.ts`。
- 依赖：无。
- 固有风险：索引归一化的 Unicode 边界（NFKC 覆盖面抽样验证）；产物体积报告。

- [ ] 双轨产物扩展 + 四条门禁测试。
- [ ] 勘测报告（固定小节 + 必含字段）。

### Task-2

SPA 分包、-m 直读与回归三件套（来源：User Story 1；Decisions 2/3/4/5/6/7；Testing Decisions 全部）

- 验收标准：SPA 路由 dynamic import + 回退合同生效；搜索消费构建期索引；text-reader 三模式 + index.ts/manual-markdown.ts 最小接线（其他命令 -m 零变化断言通过）；server 回归测试实体化全绿；manual:dev 冒烟通过；分包门禁复验；视觉负向门禁（diff 不含 styles.css/BrandMark）；既有 cli-manual/build-cli 测试零断言变更；全量质量门绿。Task-1 勘测清单逐项消费（改接/显式不变 + 理由）。
- 可动文件范围：`src/manual-app/src/{manual-data.ts, App.tsx, 路由相关模块}`、`src/core/manual/text-reader.ts`、`src/cli/index.ts`（manual 分支）、`src/cli/manual-markdown.ts`、`src/cli/commands/manual.ts`、`manual-action.ts`、`tests/m1-text-reader.test.ts`、`tests/m1-manual-server.test.ts`、dev 冒烟脚本。
- 依赖：Task-1（勘测清单）。
- 固有风险：manual 预解析分支触碰面（闸门查其他命令零变化断言）；路由块回退通道的加载时序。

- [ ] SPA 分包 + 索引消费 + 回退通道。
- [ ] -m 接线与三模式测试 + server/manual:dev 回归 + 全量验证。

> [!IMPORTANT]
> Milestone-1 闸门（唯一闸门）：主代理复核构建产物证据、分包门禁、-m 实跑输出、server/manual:dev 回归与 C1 冻结面触碰清单，通过后 pruner 收尾、按路线图集成 main。

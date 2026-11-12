---
date: 2026-11-12
state: 待 fresh FULL-3（v3 修订，架构修正）
dispatch: FULL-1 FAIL（3F/6M/1m）→ v2 → FULL-2 FAIL（1F/8M/1m，FATAL 强收敛）→ v3：F-01 架构修正（metadata shell——SPA 首屏只拉轻量元数据，正文只在路由块；legacy JSON 退出首屏链路，仅作降级回退）；Human 双裁决落稿（2026-11-12）：①-m 终端纯英文（含新手册直读；zh 不经终端——既有 docs/SPEC 冻结合同零变化）②SPA locale = 浏览器/系统语言优先（中文 → zh，其余 → en）
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
- **产物架构（v3 修正，FULL-2 F-01）**：`buildManualData` 产出四件——① `manual-metadata.json`（新，首屏 shell：locale 列表/路由表 `<route, title, locale>/config 卡片`，**不含任何正文**，体积 ≤ 50KB 硬阈值）② 逐路由正文块 `pages/<locale>/<route>.json`（形状冻结：`{ route, locale, title, html, searchText, rawMarkdown }`，单块 ≤ 100KB 硬阈值）③ `search-index.json`（en locale 全量——终端消费；记录形状见 Decisions 2）④ legacy `manual-data.json` **保持生成且形状零修改**（外部兼容产物），但 SPA 首屏**不再拉取**（仅作路由块加载失败的降级回退）。SPA 消费合同：首屏只 fetch metadata shell（可用性立即可达）→ 路由导航时 fetch 对应正文块（runtime fetch，非 vite import——生成时序 vite build 先于 buildManualData，M-03）。
- **locale 合同（Human 裁决 2026-11-12）**：终端全英文——`-m` 三模式（目录/搜索/正文）一律消费 en locale 记录与 en 正文（既有 docs/SPEC 冻结合同零变化，zh 不经终端）；SPA locale = 浏览器/系统语言优先（中文环境 → zh，其余 → en），SPA 现有 locale 切换保留。**其他所有命令的 `-m` 行为零变化**。C1 冻结面最小触碰授权：`src/cli/index.ts`（manual 预解析分支）、`src/cli/manual-markdown.ts`（页面读取扩展）；`registry.ts` 仅在 -m 递归注入干扰 manual 自身 -m 时最小调整。
- server 交互路径行为不回归，并以测试实体化（M-01）：进程启动、URL 输出、端口默认/自动、`--no-open`、SIGINT 退出。
- 视觉零改动（m-01 负向门禁）：`styles.css`、`BrandMark.tsx` 等视觉文件不在可动范围，验收含 `git diff --name-only` 负向断言。
- 写边界：`src/core/manual/*`（build.ts 扩展、text-reader.ts 新）、`src/manual-app/src/{manual-data.ts, App.tsx, 路由相关模块}`、`src/cli/index.ts`（manual 分支）、`src/cli/manual-markdown.ts`、`src/cli/commands/manual.ts`、`manual-action.ts`、`scripts/build-manual.ts`（如涉及）、`tests/m1-*.test.ts`。禁动：`manual/pages*` 内容、styles.css/BrandMark 等视觉文件、其他 CLI 命令文件（除上述两文件的最小触碰）。

## Implementation Decisions

1. **构建期产物扩展**（`src/core/manual/build.ts`，双轨只增）：legacy `manual-data.json` 字段零修改；新增 ① 逐路由块（zh/en 双语全覆盖，路由集 = config 全集）② `search-index.json`。**索引记录形状（冻结，FULL-2 M-04 + M-01）**：`{ route: string, locale: 'zh' | 'en', title: string, description: string, category?: string, commands?: string[], appliesTo?: string[], searchText: string }`——**searchText 内容来源与现状 build.ts:79-86 完全一致**（title + description + category + commands + appliesTo + 正文；搜索语义零变更——现状可命中 `wave install --help` 类 frontmatter 词，新索引同样命中）；归一化冻结：Unicode NFKC + 小写化 + 空白折叠单空格；匹配 = 归一化子串包含；结果顺序 = config 路由顺序（en locale 内）；SPA 截断沿用现状前 8 条；`-m` 命中列表同取前 8 条（纯 en）。
2. **SPA 消费改造（runtime fetch 合同，FULL-2 F-01/M-03）**：首屏 = fetch `manual-metadata.json`（轻量 shell，正文零传输——User Story 2 达成路径）；路由导航 = fetch 对应 `pages/<locale>/<route>.json` 正文块（**runtime fetch，非 vite dynamic import**——生成时序 vite build 先于 buildManualData，正文块无法经 vite 静态 import）；locale 选择 = 浏览器/系统语言优先（navigator.language 中文 → zh，否则 en，裁决 2026-11-12）；搜索 = fetch `search-index.json` 前端包含匹配（前 8 条维持现状）；**降级回退合同**：正文块 fetch 失败 → fetch legacy `manual-data.json` 全量（仅失败路径，首屏正常路径永不触发）。dev 消费链（vite dev）与 built 静态服务均以产物根相对路径 fetch（路由块写入 `src/manual-app/public/pages/`（dev 可达）并复制进 `dist/manual-app/pages/`（built 可达）——写入位由 Task-1 勘测定案）。
3. **`-m` 手册直读**（新 `src/core/manual/text-reader.ts` + `manual-markdown.ts` 页面读取扩展 + `index.ts` manual 分支接线）。**纯英文（Human 裁决）**：三模式一律消费 en locale 记录。**三模式可判定合同（冻结，FULL-2 M-04 字段级）**：
   - 无 query：手册目录 = 按 config 路由顺序逐行 `<route>\t<title>`（en title），stdout，结尾单换行，exit 0。
   - query 精确命中：query 归一化（同索引规则）后与 en 记录 `title` 或 `route` **精确相等**（大小写不敏感经归一化、trim、多词 argv 单空格连接）→ 唯一命中输出该页 `rawMarkdown` **原文**（正文块新增字段——构建期从源 Markdown 逐字保留，含 frontmatter 剥离后正文）+ 结尾单换行，exit 0；多条精确命中（同字段多路由）→ 输出歧义列表（route 逐行），exit 1。
   - query 非精确命中：索引包含匹配 → 命中列表前 8 条 `<route>\t<title>\t<snippet>`（**snippet 冻结 = 该页归一化 searchText 中首个匹配位置的后续 60 字符，跨字段截断含省略号 `…`**），有命中 exit 0；零命中 stdout 单行 `No matches.` exit 1。
   - 全部诊断/错误走 stderr；产物缺失 → stderr `Run pnpm manual:build first.` + exit 1。其他命令 `-m` 零变化。
4. **编译 CLI 消费面（FULL-2 M-02）**：`-m` 页面内容与索引读取 `dist/manual-app` 产物（与 server 同源）；`scripts/build-cli.ts` 的 `WAVE_MANUAL_DATA` define 内嵌**零修改**（命令页直读既有机制不回归，既有 build-cli 测试零断言变更保证）；text-reader 在产物缺失时的行为即上列合同（不做嵌入回退——页面内容体积不入编译产物，显式报错引导构建）。
5. **server 回归测试实体化（FULL-2 M-01）**：新 `tests/m1-manual-server.test.ts`——spawn `wave manual --no-open`（C1 cli-runner 基座）断言：URL 行输出格式、默认端口 4567/占用时自动回退、`--port` 显式生效、SIGINT 后进程退出；既有 cli-manual 测试零断言变更。
6. **分包门禁可证伪化（FULL-2 M-03）**：构建断言测试 `tests/m1-build-artifacts.test.ts` 固定检查——① 每路由（zh/en 全集）存在独立 chunk 文件；② 页面正文标记串（取样 3 个页面的特征句）不出现在初始入口 chunk（grep dist 资产）；③ 路由块总数 = config 路由数 × 2 locale；④ 索引文件存在且记录数一致。任意 vendor split 不满足 ①–④ 即失败。
7. **manual:dev 冒烟（FULL-2 M-06，路线图 Testing Decision 6）**：`manual:dev` 开发链回归——有界启动 vite dev + HTTP GET / 返回 200 后关闭（脚本化，计入核验基线），证明开发消费链未回归。

## Testing Decisions

- 构建期（Decisions 1/6）：`pnpm manual:build` 后断言索引/路由块产物存在、记录形状与归一化规则（抽样断言 searchText 无大写/连续空白）、双语覆盖、分包门禁四条。
- `-m` 行为（Decisions 3）：三模式逐条断言（目录行序 = config 顺序；精确命中正文与源 Markdown 内容一致性抽样；歧义列表；命中列表截断 8；零命中 exit 1 与单行输出；多词 argv；产物缺失提示）；其他命令 `-m`（如 `wave token -m`）零变化断言。
- server 回归（Decisions 5）：进程级行为断言清单；既有 cli-manual 测试零断言变更。
- manual:dev 冒烟（Decisions 7）：脚本化有界启动 + 200 断言。
- legacy 基线（FULL-2 M-02）：Task-1 动工前对现 HEAD `manual-data.json` 生成 SHA256 digest + 字段清单快照（提交入库 `tests/m1-legacy-baseline.json`）；构建断言比对新产物的 legacy 部分字段级一致（含 fallback 归一化一致性矩阵：legacy 与路由块对同页的 searchText 归一化结果相等）。
- 质量门：`pnpm check:ci` 不退化（mise bun 1.3.6，`--timeout 15000`）。
- 编译 CLI 回归（FULL-2 M-08）：`dist/wave manual -m` 三模式 + 产物缺失提示的仓库外运行断言（build-cli 既有测试零断言变更兜底内嵌面）。

## Out of Scope

- 不做视觉重设计（styles.css/BrandMark 负向门禁）；不改手册内容与信息架构。
- 不引入全局 alias 或新命令（-m 扩展限于 manual 命令自身语义）。
- 不做 SSG；保持 vite SPA 架构。
- 不引入持久缓存协议；不做搜索相关性排序优化（包含匹配 + 路由序冻结）。

## Draft Plan

- 结构总览：构建期（build.ts 双轨产物）→ 产物（legacy JSON 不变 + 路由块 + 索引）→ 三消费（SPA 分包 + 索引搜索 / -m 页面直读 / server 不变）。
- 关键契约：产物双轨只增（含回退合同）；索引记录形状与归一化/匹配语义；-m 三模式合同；C1 冻结面最小触碰范围。
- 文件结构：见 Constraints。
- 风险与未决：`index.ts` manual 分支触碰需逐行最小化（闸门重点：其他命令零变化断言兜底）。M-05（双语排序/冲突）经纯英文裁决消解大半：-m 仅 en；SPA locale 选择规则冻结（浏览器/系统优先，中文 → zh，其余 → en），同 locale 内排序 = config 路由序。体积阈值（m-01）：metadata ≤ 50KB、单路由块 ≤ 100KB，超限 Milestone gate FAIL（硬条件）。无阻塞未决。
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

- 验收标准：build.ts 四件产物（metadata shell ≤ 50KB / 路由块含 rawMarkdown 单块 ≤ 100KB / en 索引字段兼容 / legacy 零修改 + digest 基线比对）；构建断言测试门禁全绿（含 legacy 字段级比对与 fallback 归一化一致性矩阵）；**勘测报告（文件化，FULL-2 M-05/M-06）**：写入 `.tmp/m1/survey-task1.md`（固定路径）——表格协议：每行 = { 文件, 消费点 file:line, 数据类型（正文/元数据/索引）, Task-2 处置（fetch-metadata / fetch-chunk / index / 不变 + 理由） }，覆盖面必含 `build.ts`、`manual-data.ts`、`App.tsx`、`src/manual-app/src` 其余模块、`src/cli/{index.ts, manual-markdown.ts, registry.ts}`、`scripts/build-cli.ts`、既有 manual 相关测试；Task-2 验收 = 勘测表逐行核对（漏行 = 闸门 FAIL）。
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

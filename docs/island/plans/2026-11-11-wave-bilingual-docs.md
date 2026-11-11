---
date: 2026-11-11
state: 已交付（统一 gate 通过，2026-11-11）
dispatch: Strict R2 PASS；Task-1 63c014c；Task-3 1caa93a；Task-2 e82ea13；gate 修复 abd2915；全量 1185 pass / typecheck Q0-only / build+bench+Orca canary 通过（台账 M1–M5 全 RESOLVED）
---

# Wave 双语手册与 README Plan

## Problem Statement

当前分层手册正文主要为中文，CLI `-m` 会输出中文内容；网页只有单一语言；README 没有英文入口。Agent 和非中文用户需要默认英文合同，中文用户仍应在网页中获得完整中文内容。

## Solution

为手册建立中文/英文双内容源，共享命令元数据和路由。CLI help 与 `-m` 固定使用英文；网页按浏览器主语言选择中文或英文。GitHub 默认展示中文 README，并提供独立英文版链接。

## Further Notes

- 不增加 `--lang` 或语言子命令。
- 中文简体、繁体及其他 `zh-*` 共用现有中文内容，不另做繁体转换。
- 本计划不包含手册视觉重设计。

## User Stories

1. 作为 Agent，我希望 help 和 Markdown 手册默认使用英文，以便获得不依赖宿主语言环境的稳定命令合同。
2. 作为中文用户，我希望浏览器为中文时直接阅读中文手册，以便理解本地设计交付流程。
3. 作为其他语言用户，我希望非中文浏览器自动获得英文手册，以便无需选择语言即可使用文档。
4. 作为 GitHub 访客，我希望从中文 README 跳转到英文版，以便选择适合自己的项目说明。

## Constraints

- 两种语言共享命令树、参数、默认值、路由和行为合同，不允许出现不同命令语义。
- CLI 的 `-h/--help` 和 `-m/--manual` 不受 `LANG`、浏览器或系统 locale 影响。
- 网页读取浏览器主语言；`zh` 和不区分大小写的任意 `zh-*` 使用中文，其他或缺失值使用英文。
- 网页沿用现有路由，不增加语言 URL 参数或语言切换组件。
- 中文与英文页面一一对应，内容等价；命令、字段和代码示例保持相同。
- `README.md` 默认中文，`README.en.md` 提供英文版，两者互相链接。

## Implementation Decisions

1. 手册内容按 locale 分离，但导航结构、页面身份、命令路径和 href 共用一套定义。
2. 构建产物同时携带中文与英文页面数据；`-m` 始终选择英文数据，网页在客户端选择 locale。
3. 语言选择使用浏览器主语言标签，不扫描全部偏好列表来覆盖用户的排序。
4. 命令注册表和 Commander 元数据继续提供英文命令描述、参数和默认值；手册正文只补充行为、示例和说明。
5. 所有公开 help 文案审查并移除中文说明，保持英文输出；不改变参数名称和行为。
6. 手册构建在开发、单文件 CLI 和网页中使用同一双语数据索引；未知或损坏 locale 明确回退英文。
7. 中文 README 保留 GitHub 项目入口、能力、开发和文档说明；英文版内容等价，不维护额外功能清单。
8. 当前 minor changeset 补充双语手册与 README，不另升版本层级。

## Testing Decisions

- 对每个已注册命令路径验证 `-m` 输出英文正文，且与中文内容具有相同命令、参数和示例。
- 在不同 `LANG` 下验证 help/manual 输出一致，无 locale 相关变化。
- 对 `zh`、`zh-CN`、`zh-TW`、`zh-Hans`、`zh-Hant`、大小写变体、英文、其他语言、空值和非法值测试语言选择。
- 网页在中文与英文环境下均验证导航、深链、搜索和当前页内容。
- 构建后的 CLI 在项目目录外输出英文手册，无业务副作用。
- 验证 README 双语链接、目标文件存在和命令示例一致。
- 完整测试、构建、Quality Harness 和 Orca 不退化。

## Out of Scope

- 不增加繁体中文独立译本、语言切换器或用户语言偏好存储。
- 不修改 CLI 命令、token 数据模型、输出格式或 Night 规则。
- 不根据参考站重设计视觉样式。
- 不处理既有 experiments 与生产 Night 的基线类型/style 问题。

## Draft Plan

- 结构总览：命令元数据是唯一行为真源；中文和英文内容源提供等价正文；构建器生成双语索引；CLI 固定选择英文；网页通过单一语言选择函数决定中文或英文。
- 关键契约：`locale = zh | en`；仅主语言标签以大小写不敏感的 `zh` 或 `zh-` 开头时选择中文，其余为英文；所有语言共享 href 和命令路径；CLI 文档模式不受环境影响。
- 文件结构：
  - `manual/pages/*.md`：现有中文分层正文。
  - `manual/pages-en/*.md`：主代理撰写的等价英文正文。
  - `manual/manual.config.yaml`：共享导航与双语内容映射。
  - `src/core/manual/*`：双语加载与数据模型；`src/core/manual/locale.ts` 为语言选择唯一实现。
  - `src/manual-app/*`：按浏览器主语言选择内容，不改变路由。
  - `src/cli/manual-markdown.ts`、`src/cli/help.ts`、公开命令帮助：固定英文输出。
  - `scripts/build-manual.ts`、`scripts/build-cli.ts`：双语数据打包。
  - `README.md`、`README.en.md`：GitHub 双语文档入口。
  - `tests/manual-*`、`cli-manual.test.ts`、`build-cli.test.ts`：双语行为与构建回归。
  - `docs/SPEC.md`、`manual/AGENTS.md`、当前 changeset：记录新合同和维护规则。
- 风险与未决：双语内容必须逐页等价，不能依赖机器式关键词替换；现有 fallback 数据含中文，需同步修正；客户端语言选择不得造成首屏闪烁或服务端读取失败；主代理与 coder-plus 的文件所有权必须分开。没有阻塞施工的产品未决项。
- 里程碑草案：单一里程碑完成双语运行链路、网页选择、英文内容、README 和完整验证。

## Implement Plan

在当前 `feat/cli-interface-simplification` 分支继续追加一个独立文档合同节点。Coder-plus 只负责 Task-1/2 的运行链路；主代理同时撰写 Task-3 的英文正文和双语 README。双方文件范围不得重叠。执行顺序：Task-1 先行落地双语数据索引与类型并通过其验证，Task-2 在该 handoff 之后开工；Task-3 与两者并行不受影响。Strict PASS 后开始，主代理执行统一 gate。

## 双语数据合同（冻结）

- `locale` 枚举为 `'zh' | 'en'`；语言判定唯一实现在 `src/core/manual/locale.ts`，输入浏览器主语言标签，输出 locale；CLI 与构建链路不调用它（固定英文）。
- 页面内容源：`manual/pages/<name>.md`（中文）与 `manual/pages-en/<name>.md`（英文）同名一一对应；href 只由 `manual.config.yaml` 定义，两种 locale 共用同一 href 键空间。
- 配置映射：`manual.config.yaml` 的 site、home.cards 与 nav 条目携带双语字段（`title`/`titleEn`、`description`/`descriptionEn`、`source`/`sourceEn`）；导航结构、href、command 单份共用，不按 locale 复制条目。
- 双语索引：`scripts/build-manual.ts` 产出单一双语数据索引——同一 href 键空间下按 locale 的 pages/nav/site/home 两个视图；开发服务器、单文件 CLI define（`WAVE_MANUAL_DATA`）与网页 bundle 消费同一索引。
- 消费协议：CLI（含 `src/cli/manual-markdown.ts` 的 source fallback）只消费 `en` 视图；网页消费双视图并经 `locale.ts` 选择当前 locale；未知或损坏 locale 明确回退 `en`。
- 类型真源：双语索引与 locale 相关类型定义在 `src/core/manual/types.ts`（Task-1 所有）；`locale.ts` 从 `types.ts` 导入类型，不重复声明。

## Milestone-1

双语手册与 GitHub README

- 验证主题：CLI 英文帮助/手册、网页浏览器语言选择、双语内容等价和 README 链接在开发与构建产物中均成立。
- 核验基线：`bun test tests/cli-manual.test.ts tests/manual-loader.test.ts tests/manual-app.test.ts tests/build-cli.test.ts tests/cli-command-shape.test.ts && pnpm build`，随后完整 `bun test`、`pnpm bench:smoke` 与 Orca canary。
- 来源：User Stories 1–4；全部 Implementation Decisions。

### Task-1

双语数据、CLI 英文手册与构建链路（来源：User Story 1；coder-plus）

- 验收标准：每个合法命令路径的 `-m` 使用英文正文和参数；不同 `LANG` 输出一致；所有公开 help 为英文；fallback 不再混入中文；构建 CLI 在仓库外可用；共享命令元数据和路由不复制。
- 可动文件范围：`src/cli/manual-markdown.ts`、`help.ts`、`options.ts`、公开命令帮助、`src/core/manual/*`（不含 Task-2 的 `locale.ts`）、`scripts/build-manual.ts`、`scripts/build-cli.ts`、`manual/manual.config.yaml`（双语导航/站点/首页卡片映射与英文短标签）、`tests/cli-manual.test.ts`、`build-cli.test.ts`、`cli-command-shape.test.ts`。
- 依赖：Strict PASS；英文内容由主代理在 Task-3 并行提供，不修改其文件。
- 固有风险：全局手册解析不能把选项值当命令；source fallback 和 built define 必须选择同一英文数据集。

- [x] 先建立 locale 无关 CLI 和构建产物测试。（`tests/cli-command-shape.test.ts` 穷举注册命令 × LANG 断言，M2 关闭项）
- [x] 实现双语索引、英文选择与 help 文案收敛。（`63c014c`：types/loader/build 双语索引 + `ManualView.en` 消费 + 公开 help 英文收敛）
- [x] 运行 Task-1 验证并提交本范围改动。（全量 1167 pass / 0 fail；Orca 仓库外 smoke 零 CJK）

### Task-2

网页主语言选择与双语内容路由（来源：User Stories 2、3；coder-plus）

- 验收标准：中文及任意大小写 `zh-*` 主语言显示中文；其他/缺失/非法语言显示英文；同一路由两种语言均有完整导航、正文和搜索；无语言参数、额外服务或业务副作用。
- 可动文件范围：`src/manual-app/*`、`src/core/manual/locale.ts`（新增文件：语言标签解析与 locale 选择唯一实现）、相关网页测试；不得修改 `manual/pages*` 正文与 Task-1 的 `src/core/manual/*` 其余文件。
- 依赖：Task-1 完成双语索引与类型并通过其验证后的 handoff（见 Implement Plan 执行顺序）；可与主代理 Task-3 并行。
- 固有风险：首屏不能在语言选择后展示错误语言；深链刷新和搜索索引必须使用所选 locale。

- [x] 为语言标签和网页路由建立测试。（`tests/manual-locale.test.ts` 17 例标签矩阵 + 仅主标签断言；`tests/manual-app.test.ts` 双语路由/搜索）
- [x] 实现主语言选择和当前 locale 数据绑定。（`e82ea13`：`locale.ts` 唯一判定 + `App.tsx` 单次解析绑定 `locales` 视图）
- [x] 验证中文、英文、繁体标签、非中文与构建产物。（子集 65 pass；`dist/manual-app/manual-data.json` 双视图 20/20 页、href 键空间一致）

### Task-3

英文手册正文与双语 README（来源：User Stories 1–4；主代理）

- 验收标准：每个中文页面都有同路径英文页面，导航标题、命令、字段和示例等价；README.md 默认中文并链接 English，README.en.md 内容等价并链接回中文；维护规范和 SPEC 记录双语合同；更新当前 minor changeset。
- 可动文件范围：`manual/pages-en/*`、`README.md`、`README.en.md`、`manual/AGENTS.md`、`docs/SPEC.md`、`.changeset/quiet-waves-switch.md`、必要的内容等价测试。
- 依赖：无运行链路上下文依赖；不得修改 coder-plus 的 Task-1/2 文件。
- 固有风险：不能只翻译标题而留下中文正文；代码命令必须与当前 CLI 一致。

- [x] 按现有 20 个分层页面撰写英文内容。
- [x] 重写中文 README 并创建英文版互链。
- [x] 检查双语命令/示例一致和文档无旧命令。（`tests/manual-equivalence.test.ts` 7 组断言全绿；命令一致性断言曾抓出 command-index/resources/workspace 三页漂移并已修复）

> [!IMPORTANT]
> Milestone-1 闸门：主代理整合三个 Task，逐层抽查 `-m`、网页 locale 和 README，运行全部核验基线。未通过不得交付。
>
> 闸门结果（2026-11-11，通过）：Milestone 子集 65 pass；全量 `bun test` 1185 pass / 0 fail；`pnpm build` 与 `pnpm bench:smoke` 通过；typecheck 仅 Q0 存量（Task 路径新增 2 处已修复，abd2915）；仓库外构建 CLI `-m` 英文真实正文、零 CJK；`manual-data.json` 双视图 20/20 页且 href 键空间一致；Orca canary（`--profiles all`，mktemp 隔离输出）exit 0，`sketch.skip` 负向断言与阳性对照全过。已披露偏差：单文件 CLI define 仅内嵌英文视图（规避 Bun define 参数长度限制），开发服务器与网页 bundle 消费完整双语索引——与冻结合同的 CLI 仅消费 `en` 视图协议一致，网页侧已验证双视图完整。

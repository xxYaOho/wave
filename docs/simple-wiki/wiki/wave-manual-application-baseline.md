---
title: Wave Manual 应用设计基线
type: decision
created: 2026-08-31
updated: 2026-08-31
sources: [raw/2026-06-18-wave-manual-design.md, raw/2026-06-18-wave-manual.md, raw/2026-07-18-manual-blueprint-redesign-design.md, raw/2026-07-18-manual-blueprint-redesign.md, raw/2026-06-18-sketch-extensions-prd.md]
topic: Wave Manual
tags: [manual, documentation, offline, search]
context: 3
status: current
---

# Wave Manual 应用设计基线

## 定位与内容真源

`wave manual` 的目标是启动本地文档页面服务，第一版只面向使用者提供安装、快速开始、design token、素材压缩、动效、workspace、toolchain、配置路径和常见问题。`docs/SPEC.md`、重构蓝图、graphify 报告和 agent 文档只能作为校验依据，不能直接进入用户导航。[Wave Manual 文档应用设计](../raw/2026-06-18-wave-manual-design.md)

`manual/` 是用户手册内容源，`manual.config.yaml` 人工维护首页卡片和侧边导航；导航不能按文件名自动排序，也不能引用 `README.md`、`MANUAL.md`、`docs/**`、graphify 或外部 URL。页面 frontmatter title 必须与导航标题一致，配置错误在构建阶段报告具体字段和路径。[Wave Manual 文档应用设计](../raw/2026-06-18-wave-manual-design.md)

文档职责应分开：README 保留项目首页和入口，MANUAL 降级为短入口，GUIDE 清洗迁移到 `manual/pages/`，SPEC 保留内部行为快照。完整 design-token 深度归 `docs/design-token.md`，Sketch extensions 的用户说明也应遵循这条 ownership，而不是继续堆进 MANUAL。[Wave Manual 文档应用设计](../raw/2026-06-18-wave-manual-design.md) [Sketch Extensions PRD](../raw/2026-06-18-sketch-extensions-prd.md)

## 构建与运行模型

构建阶段校验 config 与 Markdown，生成静态资源、`manual-data.json` 和本地搜索索引；发布态 `wave manual` 只服务已构建的 `dist/manual-app/`，不直接读取 `manual/` 源码。开发态可由 `pnpm manual:dev` 读取源码并运行 Vite server。[Wave Manual 文档应用设计](../raw/2026-06-18-wave-manual-design.md)

6/18 implementation plan 把这条边界具体化为：loader 读取 `manual/manual.config.yaml` 与 `manual/pages/*.md`，校验站点、卡片、导航和页面 frontmatter；构建流程再生成 `dist/manual-app/manual-data.json`，并将 Vite 应用放入同一目录。配置中的 `href` 必须以 `/` 开头且唯一，卡片只能指向导航页，导航 source 必须留在 `manual/pages/` 内，不能指向 README、MANUAL、`docs/**` 或 graphify 产物。页面 frontmatter 的 `title` 必须与导航标题完全一致，错误应在构建阶段报告具体路径。[Wave Manual Implementation Plan](../raw/2026-06-18-wave-manual.md)

这个 build/runtime split 是计划定义的实现合同，不是本页对当前产物已经存在或已通过运行时验收的断言。6/18 计划要求发布态在缺失构建输出时给出可读错误；静态 server 为无扩展名路径提供 SPA `index.html` fallback，对缺失静态资源和 `manual-data.json` 返回 404。`wave manual` 默认绑定 `127.0.0.1`，未显式指定端口时从 `4567` 探测可用端口，显式占用端口则报错；`--no-open` 只关闭自动打开浏览器，不关闭服务。[Wave Manual Implementation Plan](../raw/2026-06-18-wave-manual.md) [Wave Manual 文档应用设计](../raw/2026-06-18-wave-manual-design.md)

`wave manual` 默认绑定 `127.0.0.1`，从 4567 开始探测端口；显式占用端口时报错，未显式指定时才尝试下一个端口。`--no-open` 只禁止自动打开浏览器，服务仍保持运行；SPA 路由刷新回退到 `index.html`，缺失静态资源或 `manual-data.json` 返回 404，Ctrl+C 后关闭服务且不输出堆栈。[Wave Manual 文档应用设计](../raw/2026-06-18-wave-manual-design.md)

## 体验基线

桌面布局包含 Wave 标识、搜索、主题切换、分组侧边导航、首页能力卡片和正文目录；移动端将侧栏折叠为抽屉并保持搜索可用。视觉方向是克制的工具型文档，避免营销 hero，使用中性背景、边框和少量强调色。[Wave Manual 文档应用设计](../raw/2026-06-18-wave-manual-design.md)

这里的 6/18 内容是设计 baseline，不是当前 UI 截图、已运行服务或完整命令行为的证据。页面命令示例必须再用真实 CLI help/source 校验，应用验收还应覆盖桌面/移动导航、正文刷新、搜索命中和内部文档不入索引。[Wave Manual 文档应用设计](../raw/2026-06-18-wave-manual-design.md)

## 信息架构提案（待审阅）

7/18 蓝图设计将现有“开始 / 能力 / 参考”三组平铺改为按能力域组织的五组导航。该设计正文状态为“待审阅”，因此以下是待确认的信息架构，不代表当前手册已经按此发布：[Wave Manual 蓝图改版设计](../raw/2026-07-18-manual-blueprint-redesign-design.md)

- **开始**：快速开始、安装与工具链。
- **Design Token**：概览、`main.yaml` 写法、颜色与字体、扩展与输出、WCAG 与主题模式、内置资源。
- **素材**：素材压缩、动效生成。
- **工作区**：工作区创建。
- **参考**：命令索引、配置路径、故障排除。

其中 `home.cards` 的四个入口继续指向 Design Token、素材压缩、动效生成和工作区创建；`design-token.md` 保留概览并维持原 URL，其余内容按 H2 边界拆为 `design-token-main-yaml.md`、`design-token-color-typography.md`、`design-token-extensions-output.md` 和 `design-token-quality-theming.md`。拆分正文应原样搬运，只补页级 frontmatter，避免再形成第二份完整 design-token 参考。[Manual 蓝图改版设计](../raw/2026-07-18-manual-blueprint-redesign-design.md) [Manual 蓝图改版实施计划](../raw/2026-07-18-manual-blueprint-redesign.md)

## 改版实施合同

7/18 实施计划把改版拆成内容、表现和测试三条线：内容线调整 `manual/` 与导航；表现线只调整 `src/manual-app/src/styles.css` 和 `App.tsx`；测试线同步应用契约。计划明确不触碰 CLI、server、loader 或构建脚本，因此内容层仍以已定义的 `manual-data.json` 为唯一消费接口。[Manual 蓝图改版实施计划](../raw/2026-07-18-manual-blueprint-redesign.md)

表现层的意图是纸面蓝图风格：浅色纸面、深海蓝标题与组标题、hairline 分隔线、克制圆角、系统字体和浅色代码块；不加载网络字体、不做暗色模式，也不使用装饰性阴影。文档页规划为侧栏、正文和 `On This Page` 三栏，窄屏隐藏右侧目录；首页规划为 hero、能力面板和目录总览。上述视觉值和布局属于 7/18 待审阅设计与实施计划，不能当作当前渲染截图或真实浏览器验收结果。[Wave Manual 蓝图改版设计](../raw/2026-07-18-manual-blueprint-redesign-design.md) [Manual 蓝图改版实施计划](../raw/2026-07-18-manual-blueprint-redesign.md)

改版计划还定义了供测试消费的稳定 DOM 合同：保留 `manual-home-card`、`manual-page-title`、`manual-search-result`，新增 `manual-toc`、`manual-pager` 和 `manual-directory`；页内目录标题为“本页内容”，分页使用“上一页 / 下一页”，首页目录标题为“目录”。这些是实现与测试的预期接口，不是已完成证据。[Manual 蓝图改版实施计划](../raw/2026-07-18-manual-blueprint-redesign.md)

## 证据边界

6/18 的应用设计、6/18 的实现计划和 7/18 的蓝图各自描述设计意图或执行合同；其中 7/18 蓝图明确标记为待审阅，实施计划中的 checkbox 也不证明代码、构建产物或视觉细节已完成。后续要确认当前行为，必须分别检查 loader/build/server 源码、真实 `wave manual` 服务和桌面/移动渲染；本页不以计划内容替代这些运行时证据。[Wave Manual 蓝图改版设计](../raw/2026-07-18-manual-blueprint-redesign-design.md) [Wave Manual Implementation Plan](../raw/2026-06-18-wave-manual.md)

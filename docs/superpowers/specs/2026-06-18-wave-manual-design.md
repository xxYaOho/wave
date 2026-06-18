# Wave Manual 文档应用设计

日期：2026-06-18
状态：已确认设计方向，等待实现计划

## 目标

`wave manual` 启动一个本地文档页面服务，让使用者用浏览器查看 Wave 使用手册。第一版只服务面向使用者的内容：安装、快速开始、design token、素材压缩、动效生成、工作区创建、工具链、配置路径和常见问题。

本功能不把内部文档直接暴露给使用者。`docs/SPEC.md`、`docs/SWISS_KNIFE_REFACTOR.md`、graphify 报告和 agent 文档只作为内容校验依据。

## 背景

当前使用说明分散在 `README.md`、`MANUAL.md`、`docs/GUIDE.md`、`docs/SPEC.md` 和命令帮助中。`MANUAL.md` 已承担用户手册职责，但单文件不适合继续扩展，也无法提供搜索、侧边导航、分区入口和可持续的内容结构。

参考 `https://manual.raycast.com/` 的信息架构，而不是照搬视觉样式。Raycast Manual 的有效模式是：

- 首页用能力分区引导，而不是按文章列表展示。
- 左侧导航由人工维护的信息架构驱动。
- 搜索是主入口之一。
- 正文页包含标题、摘要、适用范围、章节目录和底部帮助入口。
- 页面内容可从 Markdown 版本读取，便于机器聚合和维护。

## 非目标

- 不做公开线上文档站。
- 不把 `SPEC`、重构蓝图、graphify 报告作为用户页面导航项。
- 不在第一版实现账号、远程同步、在线反馈或评论能力。
- 不重写 CLI 业务行为。
- 不引入 Next.js/Nextra 这类完整站点框架。

## 信息架构

新增 `manual/` 作为用户手册内容源：

```text
manual/
  manual.config.yaml
  pages/
    quickstart.md
    design-token.md
    resources.md
    compress.md
    motion.md
    workspace.md
    toolchain.md
    command-index.md
    config-paths.md
    troubleshooting.md
```

`manual.config.yaml` 维护站点元信息、首页卡片和侧边导航。导航必须人工维护，不能按文件名自动排序。这样可以让文档顺序服务使用者路径，而不是服务目录结构。

建议第一版导航：

```text
开始
  快速开始
  安装与工具链

能力
  Design Token
  内置资源
  素材压缩
  动效生成
  工作区创建

参考
  命令索引
  配置路径
  故障排除
```

`manual.config.yaml` 第一版结构：

```yaml
site:
  title: Wave Manual
  description: Wave 面向 UI/UX 设计师的本地设计交付手册。
  basePath: /

home:
  cards:
    - title: Design Token
      description: 读取 main.yaml，生成 token 输出。
      href: /design-token
      command: wave dt
    - title: 素材压缩
      description: 压缩 PNG、JPG、SVG 和 GIF。
      href: /compress
      command: wave compress

nav:
  - title: 开始
    pages:
      - title: 快速开始
        href: /quickstart
        source: pages/quickstart.md
      - title: 安装与工具链
        href: /toolchain
        source: pages/toolchain.md
  - title: 能力
    pages:
      - title: Design Token
        href: /design-token
        source: pages/design-token.md
      - title: 内置资源
        href: /resources
        source: pages/resources.md
      - title: 素材压缩
        href: /compress
        source: pages/compress.md
      - title: 动效生成
        href: /motion
        source: pages/motion.md
      - title: 工作区创建
        href: /workspace
        source: pages/workspace.md
  - title: 参考
    pages:
      - title: 命令索引
        href: /command-index
        source: pages/command-index.md
      - title: 配置路径
        href: /config-paths
        source: pages/config-paths.md
      - title: 故障排除
        href: /troubleshooting
        source: pages/troubleshooting.md
```

配置校验规则：

- `site.title`、`site.description`、`home.cards` 和 `nav` 必填。
- `href` 必须以 `/` 开头，且在站内唯一。
- `source` 必须指向 `manual/pages/*.md` 下存在的文件。
- `home.cards[].href` 必须指向 `nav` 中已声明的页面。
- `nav` 不能引用 `README.md`、`MANUAL.md`、`docs/**`、`graphify-out/**` 或外部 URL。
- 页面 frontmatter 的 `title` 必须与导航标题一致，避免导航和正文漂移。
- 配置错误在构建阶段失败，并输出具体字段和文件路径。

## 文档格式

每个页面使用 Markdown，顶部写 YAML frontmatter：

```yaml
---
title: Design Token
description: 读取 main.yaml，生成 json、jsonc、css 和 sketch 输出。
category: 能力
order: 20
commands:
  - wave dt
  - wave dt build
appliesTo:
  - 本地 CLI
---
```

正文只写使用者需要的操作，不写内部实现路径。每篇页面应包含：

- 它解决什么问题。
- 最常用命令。
- 最小示例。
- 常用选项。
- 输出或结果说明。
- 常见错误和处理方式。

文档中的命令示例必须以真实 CLI help 或源码行为校验。`docs/SPEC.md` 可作为行为快照，但不能替代命令输出验证。

## 内容清洗

`manual/` 建立后，用户向使用说明以它为真源。现有文档职责调整如下：

- `README.md`：保留项目首页、安装开发环境、快速入口和链接。
- `MANUAL.md`：降级为短入口，只说明使用 `wave manual` 查看完整手册，不再承载完整使用说明。
- `docs/GUIDE.md`：清洗后迁移到 `manual/pages/`，避免继续作为第二份完整使用指南。
- `docs/SPEC.md`：继续记录当前行为快照，不进入用户手册导航。
- `docs/SWISS_KNIFE_REFACTOR.md`：继续记录蓝图，不进入用户手册导航。

实现时应先迁移和清洗内容，再删除或降级重复入口。不能让同一段使用指导同时在多个文件长期维护。

## 前端文档应用

新增前端文档应用，建议放在：

```text
src/manual-app/
  index.html
  src/
    App.tsx
    manual-data.ts
    markdown.ts
    search.ts
    styles.css
```

应用使用 Vite + React + TypeScript。它不依赖远程服务，所有文档内容随包发布并离线可读。

页面结构：

- 顶部栏：Wave 标识、搜索入口、主题切换。
- 左侧栏：分组导航，当前页高亮。
- 首页：能力入口卡片，显示每个能力的简短说明和主命令。
- 正文页：标题、摘要、适用范围、命令列表、正文、页内目录。
- 搜索弹层：按标题、描述、命令和正文关键词检索。
- 移动端：侧边栏折叠为抽屉，搜索保持可用。

视觉原则：

- 克制、工具型、适合设计师查阅。
- 不使用营销式 hero。
- 首页第一屏直接展示手册入口和能力卡片。
- 文本密度高于官网落地页，但保持足够行距和代码块可读性。
- 颜色不依赖单一紫蓝渐变；优先使用中性背景、明确边框和少量强调色。

## CLI 行为

新增一级命令：

```bash
wave manual
wave manual --port 4567
wave manual --host 127.0.0.1
wave manual --no-open
```

命令合同：

- 默认 host 是 `127.0.0.1`，默认端口从 `4567` 开始探测。
- 允许 `--host 0.0.0.0`，但默认不暴露到局域网。
- 默认打开 `http://127.0.0.1:<port>/`；当 host 是 `0.0.0.0` 时，仍打印本机访问 URL 和绑定地址。
- `--no-open` 只禁止自动打开浏览器，不改变服务行为。
- 用户显式传入 `--port` 时，如果端口被占用，命令失败并返回通用错误码；未显式传入端口时才自动尝试下一个端口。
- SPA 路由刷新必须回退到 `index.html`，静态资源和 `manual-data.json` 不存在时返回 404。
- `Ctrl+C` 后关闭 HTTP 服务并恢复终端，不输出堆栈。
- 构建产物缺失时，输出 `Manual app is not built. Run "pnpm manual:build" or "pnpm build".`

默认行为：

1. 查找可用端口，默认从 `4567` 开始。
2. 启动本地 HTTP 服务。
3. 打印访问地址。
4. 默认打开浏览器。
5. 进程保持运行，用户按 `Ctrl+C` 结束。

示例输出：

```text
Wave Manual
Local: http://127.0.0.1:4567
Press Ctrl+C to stop.
```

错误处理：

- 端口被占用：自动尝试下一个端口，除非用户显式指定端口。
- 构建产物缺失：输出清晰错误，提示先运行 `pnpm manual:build` 或 `pnpm build`。
- 浏览器打开失败：服务继续运行，并提示用户复制 URL。

## 数据流

文档真源和运行产物必须分开：

- `manual/` 是源码真源，只在开发和构建阶段读取。
- 构建阶段校验 `manual.config.yaml` 和 `manual/pages/*.md`，生成前端静态资源、`manual-data.json` 和搜索索引。
- `wave manual` 运行发布产物时只服务已构建的 `dist/manual-app/`，不直接读取源码 `manual/`。
- 开发模式使用 `pnpm manual:dev` 读取源码并启动 Vite dev server。

构建时：

```text
manual/pages/*.md + manual/manual.config.yaml
  -> 解析 frontmatter 和 Markdown
  -> 校验导航、页面、内部文档禁入和重复 slug
  -> 生成 dist/manual-app/manual-data.json
  -> Vite 构建前端资源
  -> 输出 dist/manual-app/
```

运行时：

```text
wave manual
  -> 启动 Bun HTTP 服务
  -> 定位 dist/manual-app/
  -> 提供静态前端资源和 manual-data.json
  -> 浏览器访问本地页面
```

第一版不需要服务端全文搜索。搜索索引可在构建时生成，前端本地过滤。

## 工程边界

依赖新增应控制在文档应用必需范围。建议新增：

- `vite`
- `react`
- `react-dom`
- Markdown/frontmatter 解析依赖

如果可以用小型解析器满足需求，不引入大型文档框架。项目仍保持 Bun 作为 CLI runtime、pnpm 作为依赖管理器。

`package.json` 可新增脚本：

```bash
pnpm manual:dev
pnpm manual:build
```

`pnpm build` 应包含 CLI 构建和 manual app 构建，确保发布产物可运行 `wave manual`。

发布资源定位：

- `pnpm manual:build` 输出 `dist/manual-app/`。
- `pnpm build` 先执行 `pnpm manual:build`，再编译 CLI 到 `dist/wave`。
- 本地开发运行 `pnpm dev -- manual` 时，资源解析优先使用 repo 下的 `dist/manual-app/`。
- 编译后的 `dist/wave manual` 使用可执行文件同级目录下的 `manual-app/`。
- 如果未来发布 npm 包，包内容必须包含 `dist/manual-app/**`。
- 发布验收命令是 `pnpm build` 后运行 `dist/wave manual --no-open --port <free-port>` 并访问首页和一篇正文页。

## 测试

需要覆盖：

- `wave manual --help` 显示正确用法。
- `wave manual --no-open --port <temp>` 能启动服务并返回首页 HTML。
- 端口冲突时的 fallback 行为。
- 缺失 `manual.config.yaml` 或页面 frontmatter 错误时输出可读错误。
- manual config 中引用不存在页面时报错。
- manual config 引用 `docs/**`、`MANUAL.md`、`README.md` 或外部 URL 时报错。
- 搜索索引包含标题、描述、命令和正文。
- 构建产物缺失时，`wave manual` 输出可读错误。
- `dist/wave manual --no-open --port <temp>` 能服务 `dist/manual-app/`。

人工验收：

- 桌面视口下左侧导航、搜索、首页卡片和正文页可用。
- 移动视口下导航不遮挡正文。
- 浏览器刷新 `/design-token`、`/compress` 等正文路径不会 404。
- 页面不是空壳：首页必须渲染能力卡片，正文页必须渲染标题、摘要、命令和正文内容。
- 搜索必须能搜到至少一个命令和一个正文关键词。
- 文档内容覆盖 `MANUAL.md` 当前主要使用说明。
- 真实命令样例与 `pnpm dev -- <command> --help` 保持一致。

回归检查：

- 构建产物的搜索索引不包含 `docs/SPEC.md`、`docs/SWISS_KNIFE_REFACTOR.md`、graphify 报告或 agent 文档内容。
- `MANUAL.md` 不再保留完整用户手册，只保留 `wave manual` 入口。
- `docs/GUIDE.md` 不再作为第二份完整用户指南保留；若暂时不能删除，必须标记为迁移遗留并从 README 用户入口移除。
- 关键命令示例覆盖 `wave dt --help`、`wave compress --help`、`wave motion --help`、`wave workspace --help` 和 `wave doctor --help`。

## 实施顺序

1. 建立 `manual/` 内容源和 `manual.config.yaml`。
2. 从 `MANUAL.md`、`docs/GUIDE.md` 和真实 help 输出清洗第一批页面。
3. 建立前端文档应用和搜索索引。
4. 新增 `wave manual` 命令和本地服务。
5. 降级 `MANUAL.md` 为短入口，消除重复维护。
6. 补测试和文档入口。

## 成功标准

- 使用者运行 `wave manual` 后，可以在浏览器中查到 Wave 的主要使用方式。
- 用户向内容只有一个维护源：`manual/`。
- 页面具备 Raycast Manual 同类的信息结构：首页分区、侧边导航、搜索、正文页。
- 内部文档不混入用户手册导航。
- 测试能证明服务启动、内容聚合和索引生成可用。

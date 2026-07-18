# Manual 蓝图改版实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `wave manual` 前端重设计为 zed.dev 式「纸面蓝图」美学（莱茵深海蓝主色），并按 Raycast manual 模式重组内容（拆分 684 行的 design-token.md）。

**Architecture:** 改动分三条线：内容层（`manual/` 拆分 + 配置）、表现层（`src/manual-app/` styles.css 全量重写 + App.tsx 结构升级）、测试层（`tests/manual-app.test.ts` 契约更新）。不触碰 CLI、server、loader、构建脚本。

**Tech Stack:** React 19 + Vite 6（无路由库、无 CSS 框架）、marked、gray-matter、bun test + @testing-library/react + happy-dom。

**Spec:** `docs/superpowers/specs/2026-07-18-manual-blueprint-redesign-design.md`（色板、字体、布局、拆分的唯一权威定义）

---

## 协作契约（三条线的对接面）

以下标识符是跨任务的硬约定，任何任务不得偏离：

**数据契约（内容线产出）：**

| href | 页面标题 | category |
| --- | --- | --- |
| `/quickstart` | 快速开始 | 开始 |
| `/toolchain` | 安装与工具链 | 开始 |
| `/design-token` | Design Token 概览 | Design Token |
| `/design-token/main-yaml` | main.yaml 写法 | Design Token |
| `/design-token/color-typography` | 颜色与字体 | Design Token |
| `/design-token/extensions-output` | 扩展与输出 | Design Token |
| `/design-token/quality-theming` | WCAG 与主题模式 | Design Token |
| `/resources` | 内置资源 | Design Token |
| `/compress` | 素材压缩 | 素材 |
| `/motion` | 动效生成 | 素材 |
| `/workspace` | 工作区创建 | 工作区 |
| `/command-index` | 命令索引 | 参考 |
| `/config-paths` | 配置路径 | 参考 |
| `/troubleshooting` | 故障排除 | 参考 |

导航组顺序：`开始` → `Design Token` → `素材` → `工作区` → `参考`。`home.cards` 维持现有 4 项不变。

**DOM 契约（表现线产出，测试线消费）：**

- 保留 testid：`manual-home-card`、`manual-page-title`、`manual-search-result`
- 新增 testid：`manual-toc`（页内目录容器）、`manual-pager`（上一页/下一页容器）、`manual-directory`（首页目录总览容器）
- 文案约定：页内目录标题 `本页内容`；分页文案 `上一页` / `下一页`；首页目录标题 `目录`

**色板契约（表现线产出，spec 定义）：**

```css
:root {
	--paper: #f7f9fb;
	--surface: #ffffff;
	--ink: #1f2937;
	--ink-secondary: #5b6b7c;
	--ink-faint: #8da0b3;
	--primary: #0e3a5c;
	--primary-bright: #2563eb;
	--line: rgba(14, 58, 92, 0.12);
	--line-strong: rgba(14, 58, 92, 0.25);
	--active-bg: rgba(14, 58, 92, 0.08);
	--code-bg: #eff3f8;
	--error: #b3402a;
	--font-display: Georgia, "Songti SC", "Noto Serif SC", "SimSun", serif;
	--font-body: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
	--font-mono: ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace;
}
```

---

### Task 1: 内容重组（manual/ 拆分与配置）

**Files:**
- Modify: `manual/pages/design-token.md`（只保留概览章节）
- Create: `manual/pages/design-token-main-yaml.md`、`manual/pages/design-token-color-typography.md`、`manual/pages/design-token-extensions-output.md`、`manual/pages/design-token-quality-theming.md`
- Modify: `manual/manual.config.yaml`（nav 五组）
- Modify: `manual/pages/*.md` 全部（category 字段改为新组名）
- Modify: `manual/AGENTS.md`（导航与 design-token 文档两节约定更新）

- [ ] **Step 1: 拆分 design-token.md**

按现有 H2 边界搬运正文（行号基于当前文件，共 684 行）：

| 新文件 | 章节（现行号） |
| --- | --- |
| `design-token.md` | 用途 L13-25、选择入口 L26-41、文件职责 L42-53、旧 themefile 入口 L102-147、旧入口 L682-684 |
| `design-token-main-yaml.md` | main.yaml L54-101、GROUP L148-174、token 写法 L175-202、theme 顶级 key L203-228、兼容字段 L591-598 |
| `design-token-color-typography.md` | 颜色和 alpha L229-258、Typography L259-298（含 Sketch 颜色引用小节）、虚线 border L299-318 |
| `design-token-extensions-output.md` | 输出格式 L319-339、$extensions L340-358、smoothShadow L359-404、smoothGradient L405-433、inheritColor L434-471、sketch L472-565、composite L566-590 |
| `design-token-quality-theming.md` | WCAG L599-626、Profile 和 Night Mode L627-669、常见错误 L670-681 |

正文逐字搬运，不改写。`design-token.md` 保留原 frontmatter 但 title 改为 `Design Token 概览`、category 改为 `Design Token`。

- [ ] **Step 2: 新文件 frontmatter**

四个新文件的 frontmatter 模板（commands 从搬运过来的章节里挑查看类命令，没有就用 `wave dt --help`）：

```yaml
---
title: main.yaml 写法
description: main.yaml 的 $config、GROUP、token 结构与 theme 顶级 key 写法参考。
category: Design Token
commands:
  - wave dt build
appliesTo:
  - 本地 CLI
---
```

其余三个文件 title/description 按「协作契约」表的标题起，description 一句话说明该页帮用户完成什么。loader 强校验：nav 标题必须与 md frontmatter title 完全一致。

- [ ] **Step 3: 重写 manual.config.yaml 的 nav**

按契约表的五组顺序登记全部 14 个页面；site、home 段不动。

- [ ] **Step 4: 全量更新 category**

其余现存页面的 frontmatter category 改为所属新组名（`开始` / `Design Token` / `素材` / `工作区` / `参考`），与 nav 分组一致。

- [ ] **Step 5: 更新 manual/AGENTS.md**

- 「导航」节：三组改为五组，列出组名与职责。
- 「Design Token 文档」节：design-token 参考从单文件改为五个文件（列出文件名与各自覆盖范围）；「不要创建第二份 design-token 参考」改为「新增 design-token 行为时更新对应子页，不要新建第六个文件」。

- [ ] **Step 6: 验证**

Run: `pnpm manual:build && bun test tests/manual-loader.test.ts`
Expected: 构建成功，loader 测试全绿。

---

### Task 2: 表现层重写（styles.css + App.tsx）

**Files:**
- Modify: `src/manual-app/src/styles.css`（全量重写）
- Modify: `src/manual-app/src/App.tsx`（结构升级）

- [ ] **Step 1: styles.css 全量重写**

以「色板契约」的 `:root` 变量开头，全部规则改用变量，禁止残留旧 hex（特别是 `#ff4f45`）。要点：

- 页面底 `--paper`，文字 `--ink`，正文 15px/1.75。
- 布局：`.appShell` 双栏 `260px minmax(0,1fr)`；sidebar 白底 + 右侧 1px `--line`。
- 正文列：`.pageBody` 用 grid `minmax(0,760px) 200px`，右侧给 TOC；正文列左右两侧纵贯 1px 列线（容器级 border）。<1100px 隐藏 TOC 列，<860px  sidebar 收为顶部横滚（沿用现有断点策略）。
- 品牌块 `.brandMark` 背景 `--primary`；导航组标题等宽 11px 大写字距 0.1em `--primary`；`.navLink` 14px，激活态 `--active-bg` 底 + 左侧 2px `--primary` 指示条。
- 页头：eyebrow 等宽 11px 大写 `--primary`；h1 衬线 32px `--primary`；首页 h1 40px；`.lede` 17px `--ink-secondary`；页头底部 1px `--line`。
- `.article` h2 衬线 22px `--ink`；h3 无衬线 16px 加粗；表格表头等宽小号大写、行间 hairline、无外框。
- 代码块：`--code-bg` 底 + `--line-strong` 细框 + `--ink` 文字，圆角 2px；行内 code 同底 + `--primary` 文字；`.copyCodeButton` 白底细框 chip（不再深色）。
- `.commandCode`、kbd：等宽 12px + `--line-strong` 细框 + `--surface` 底。
- 首页 hero：淡方格网背景（`linear-gradient` 网格，格线 `--line`，格距 24px）；`.homeCard` 改 hairline 面板（`--line-strong` 细框、无阴影、圆角 2px）。
- 链接 `--primary-bright`，hover 下划线。搜索结果下拉 `--surface` 底 + `--line-strong` 框。
- 全文件无 `box-shadow`（搜索结果下拉除外，可用极浅投影）。

- [ ] **Step 2: App.tsx 结构升级**

路由、数据获取、搜索、复制按钮逻辑不动。改动：

1. `PageView` 改双列布局：左 `.pageBody`（页头 + article + pager），右 `<OnThisPage html={page.html} />`。
2. 新组件 `OnThisPage`：`useMemo` 用 `DOMParser` 从 `page.html` 提取 h2/h3 文本列表渲染为链接列表（容器 `data-testid="manual-toc"`，标题 `本页内容`）；点击时不跳转，改为在 article DOM 中按文本匹配 heading 并 `scrollIntoView({ behavior: 'smooth', block: 'start' })`。h2/h3 均渲染，h3 缩进一档。
3. 新组件 `PagePager`：按 `data.pages` 顺序求当前页前后邻居，渲染 `上一页` / `下一页` 按钮（容器 `data-testid="manual-pager"`，缺失一侧不渲染该按钮）；`PageView` 需接收 `pages` 与当前 `page`。
4. `Home` 改三段：hero（eyebrow + h1 + lede，套方格网容器）→ homeGrid 面板 → `目录` 总览（`data-testid="manual-directory"`，遍历 `data.sections` 渲染组标题 + 页链接列表）。
5. `Sidebar` 底部加页脚：站点标题小字（`data.site.title`）。
6. className 与 styles.css 同步；保留 `manual-home-card`、`manual-page-title`、`manual-search-result` 三个 testid。

- [ ] **Step 3: 验证**

Run: `pnpm typecheck && pnpm lint`
Expected: 全绿（biome 风格：tab 缩进、单引号）。

---

### Task 3: 测试更新

**Files:**
- Modify: `tests/manual-app.test.ts`

- [ ] **Step 1: fixture 扩为两页**

在 `manualData` 增加第二页（href `/compress`，title `素材压缩`，category `素材`），`sections` 同步为两组，使 pager 有邻居可用。

- [ ] **Step 2: 组件断言更新**

- 首页测试：保留卡片断言，新增 `manual-directory` 存在且含组标题。
- 页面测试：新增 `manual-toc` 渲染出 `Usage` 链接、`manual-pager` 出现 `下一页`（第一页时无 `上一页`）。
- 路由、搜索、复制、404、加载失败五个行为测试语义不变。

- [ ] **Step 3: 集成断言更新（built manual data）**

- href 清单补 4 个新子页（`/design-token/main-yaml` 等，见契约表）。
- `/design-token` 的 searchText 断言改为包含 `themefile`；原 `$extensions`、`sketch.property` 两条移到 `/design-token/extensions-output` 上断言。

- [ ] **Step 4: 验证**

Run: `bun test tests/manual-app.test.ts`
Expected: 全绿。

---

### Task 4: 终验（milestone gate）

- [ ] **Step 1: 全量验证**

```bash
pnpm manual:build
bun test tests/manual-loader.test.ts tests/manual-app.test.ts tests/cli-manual.test.ts
pnpm typecheck
pnpm lint
```

- [ ] **Step 2: 实机检查**

```bash
pnpm build
dist/wave manual --no-open &
```

curl 检查 `/`、`/design-token`、`/design-token/main-yaml` 均返回 200（SPA fallback）；浏览器截图目检：首页 hero 方格网、三栏文档页、TOC 锚点、上下页闭环、代码块浅色、无红色残留。

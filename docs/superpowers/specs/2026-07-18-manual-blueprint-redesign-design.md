# Wave Manual 蓝图改版设计

日期：2026-07-18
状态：待审阅

## 背景

`wave manual` 是 Wave CLI 的本地手册应用（React 19 + Vite，源码 `src/manual-app/`，内容 `manual/`）。本次改版有两个目标：

1. **视觉重设计**：以 zed.dev 的「纸面蓝图」美学为参照，主色采用莱茵深海蓝。辅助参照为 Hermes Agent Dashboard 的细线与微标签构成手法。
2. **内容重组**：现目录（开始 / 能力 / 参考三组平铺）不便浏览，`design-token.md` 单文件 684 行一头沉。参照 Raycast manual 的信息架构，按能力域分组、拆分为专注小页。

参照实物已存档：`.tmp/hermes-ref/`（zed 首页、zed 文档页、Hermes dashboard 三张截图）。

## 参照分析

### zed.dev（主参照）

- 浅色纸面，蓝色发丝细线：纵贯列线、区块分隔、页面边缘刻度。
- 标题：衬线斜体（IBM Plex Serif），蓝色，48px，字重 340。
- 正文：iA Writer 系无衬线，16px，冷灰蓝墨色。
- 文档页三栏：左导航（蓝色小号组标题 + 条目，激活项浅蓝底）/ 中正文（限宽）/ 右 "On This Page" 页内锚点目录。
- 细节：kbd 芯片（等宽 + 细框）、搜索框带快捷键提示。

### Hermes Agent Dashboard（辅助参照）

- 微标签手法：导航项、表头、按钮小号大写 + 宽字距（0.08–0.12em）。
- 边框统一为低透明度细线，无阴影、无装饰性圆角。
- 激活态反色药丸（实底 + 反色字），非激活透明 + 细描边。

## 设计系统

### 色板

| 角色 | 值 | 用途 |
| --- | --- | --- |
| `--paper` | `#F7F9FB` | 页面底色 |
| `--surface` | `#FFFFFF` | 卡片、搜索框等浮层 |
| `--ink` | `#1F2937` | 正文 |
| `--ink-secondary` | `#5B6B7C` | 次级文字、描述 |
| `--ink-faint` | `#8DA0B3` | 页脚、占位、禁用 |
| `--primary` | `#0E3A5C` | 莱茵深海蓝：标题、组标题、按钮、激活态 |
| `--primary-bright` | `#2563EB` | 链接、交互 hover |
| `--line` | `#0E3A5C` 12% 透明度 | 发丝分隔线（hairline） |
| `--line-strong` | `#0E3A5C` 25% 透明度 | 强调边线（卡片、代码块） |
| `--active-bg` | `#0E3A5C` 8% 透明度 | 导航激活项底色 |
| `--code-bg` | `#EFF3F8` | 代码块、行内 code 底 |
| `--error` | `#B3402A` | 错误、加载失败提示 |

全局不再出现现有红色 `#ff4f45`；品牌块、eyebrow、favicon 统一走深海蓝。不做暗色模式。

### 字体

不加载网络字体，全部系统栈（本地 CLI 离线可用）：

- 展示标题（h1、首页 hero）：`Georgia, "Songti SC", "Noto Serif SC", serif`；拉丁部分斜体，中文正体。
- 正文 / UI：`system-ui` 栈。
- 等宽（代码、kbd、命令 chip）：`"Departure Mono", "Maple Mono", ui-monospace` 栈（本机安装则生效，未安装回退系统等宽，不打包字体文件）。

### 字号与排版

| 层级 | 规格 |
| --- | --- |
| hero 标题（仅首页） | 衬线 40px，行高 1.15 |
| h1 页标题 | 衬线 32px，深海蓝 |
| h2 | 衬线 22px，墨色 |
| h3 | 无衬线 16px 加粗 |
| 正文 | 15px，行高 1.75，墨色 |
| lede 导语 | 17px，次级墨色 |
| eyebrow / 组标题 / 表头 | 等宽 11–12px，大写，字距 0.1em，深海蓝或次级墨色 |
| kbd / chip | 等宽 12px，细框 |

### 蓝图线语言

克制使用，不堆砌刻度：

- 正文列两侧纵贯 1px 列线（内容区左右边界），页面级元素。
- 区块之间一律 1px `--line` 分隔，无阴影。
- 首页 hero 衬一层极淡方格网（CSS 渐变背景实现，`--line` 透明度网格），网格交点处少量十字标记。
- 圆角统一收敛：卡片、面板 0–2px；chip、kbd 4px。

## 布局

### 文档页（三栏，对齐 zed docs）

```
┌────────────┬──────────────────────────┬────────────┐
│  sidebar   │  正文（max-width 760px）  │ On This Page│
│  260px     │                          │  200px      │
└────────────┴──────────────────────────┴────────────┘
```

- **Sidebar**：白底 + 右侧 hairline。顶部品牌块（深海蓝 W 标记 + WAVE MANUAL 等宽大写）+ 搜索框；导航组标题为深海蓝小号大写，条目 14px，激活项浅蓝底 + 左侧 2px 主色指示条；底部页脚显示站点标题（`manual-data.json` 现有 site 信息，不新增数据字段）。
- **正文**：页头 = eyebrow（所属组名）+ h1 + lede（frontmatter description）+ hairline。内容列两侧纵贯列线。
- **On This Page**：App.tsx 新组件，从当前页 HTML 提取 h2/h3 生成锚点链接，sticky 定位；窄屏（<1100px）隐藏。
- **页底**：上一页 / 下一页链接（按 nav 顺序），hairline 分隔之上。
- 响应式断点维持现有 860px / 560px 策略，<1100px 隐藏右栏。

### 首页

- hero：eyebrow（WAVE MANUAL）+ 衬线大标题 + 站点描述（`manual.config.yaml` 的 site.description），背景淡方格网。
- hero 之下：`home.cards` 四项改为 hairline 面板（无阴影），每项含标题、描述、命令 chip。
- 再下方「目录」总览：按 nav 五组列出全部页面链接（组标题 + 链接列表），让首页直接承担目录职能。
- 数据全部来自现有 `manual-data.json`，不改 loader、不改 config schema。

### 组件

- **代码块**：`--code-bg` 浅蓝灰底 + `--line-strong` 细框 + 深色文字（替代现有黑块）；保留复制按钮，样式改为细框 chip。
- **行内 code**：`--code-bg` 底 + 主色文字。
- **表格**：表头等宽小号大写，行间 hairline，无外框。
- **搜索**：输入框细框 + 右侧 kbd 提示；结果下拉白底细框。
- **链接**：`--primary-bright`，hover 加下划线。

## 内容重组

### 新导航结构（manual.config.yaml）

- **开始**：快速开始 `/quickstart`、安装与工具链 `/toolchain`
- **Design Token**：概览 `/design-token`、main.yaml 写法 `/design-token/main-yaml`、颜色与字体 `/design-token/color-typography`、扩展与输出 `/design-token/extensions-output`、WCAG 与主题模式 `/design-token/quality-theming`、内置资源 `/resources`
- **素材**：素材压缩 `/compress`、动效生成 `/motion`
- **工作区**：工作区创建 `/workspace`
- **参考**：命令索引 `/command-index`、配置路径 `/config-paths`、故障排除 `/troubleshooting`

### design-token.md 拆分映射

按现有 H2 章节边界拆分，正文内容原样搬运，只补页级 frontmatter（title / description / category / commands / appliesTo）：

| 新文件 | 收纳章节 |
| --- | --- |
| `design-token.md`（概览，保留原 URL） | 用途、选择入口、文件职责、旧 themefile 入口、旧入口 |
| `design-token-main-yaml.md` | main.yaml、GROUP、token 写法、theme 顶级 key、兼容字段 |
| `design-token-color-typography.md` | 颜色和 alpha、Typography、Sketch 颜色引用、虚线 border |
| `design-token-extensions-output.md` | $extensions、smoothShadow、smoothGradient、inheritColor、composite、sketch、输出格式 |
| `design-token-quality-theming.md` | WCAG、Profile 和 Night Mode、常见错误 |

其余页面文件不动。home.cards 中 Design Token 卡片 href 维持 `/design-token`。

## 实现范围

改动集中在三个区域，不碰 CLI、server、loader、构建脚本：

1. **`src/manual-app/src/styles.css`**：全量重写。先定义上表 CSS 变量，再按新设计系统重写全部规则。
2. **`src/manual-app/src/App.tsx`**：新增 OnThisPage 组件与上一页/下一页导航；首页结构改为 hero + 能力面板 + 目录总览；页头加 eyebrow/lede；className 随样式重写同步调整。路由与数据获取逻辑不动。
3. **`manual/`**：拆分 `design-token.md` 为 5 个文件，更新 `manual.config.yaml` 的 nav；新增子页 frontmatter 需通过 loader 校验（nav 标题与 md 标题一致、href 唯一）。

测试同步更新：`tests/manual-app.test.ts` 中首页与导航相关断言随新结构改写，行为类断言（路由、搜索、复制按钮、404）保持语义不变。

## 非目标

- 不做暗色模式 / 主题切换。
- 不加载网络字体，不 bundle 字体文件。
- 不改 CLI 命令、server、loader、构建脚本的任何逻辑。
- 不做全文搜索能力升级（维持现有客户端 includes 搜索）。

## 验证

```bash
pnpm manual:build
bun test tests/manual-loader.test.ts tests/manual-app.test.ts tests/cli-manual.test.ts
pnpm build && dist/wave manual --no-open   # 实机检查深链刷新与新页面
```

目检清单：首页 hero 与方格网、三栏布局、On This Page 锚点跳转、五个 Design Token 子页内容完整、页底上下页链接闭环、代码块复制按钮可用。

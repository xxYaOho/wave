# Wave 产品调研与迭代规划

> 调研时间：2026-04-17
> 目标受众：UI&UX 设计师

---

## 一、市场格局：Design Token 工具生态

### 1.1 现有玩家分类

| 层级               | 代表产品                  | 特点                                     | 与 Wave 的关系                  |
| ------------------ | ------------------------- | ---------------------------------------- | ------------------------------- |
| **基础设施**       | Style Dictionary (Amazon) | 开发者导向，配置驱动，生态庞大           | Wave 的底层引擎                 |
| **设计端插件**     | Tokens Studio for Figma   | 设计师最熟悉的 Token 入口，可视化编辑    | Wave 缺少的"上游"               |
| **云端同步**       | Specify, Supernova        | Figma → GitHub/NPM 自动同步，订阅制 SaaS | Wave 可部分替代，但缺少云端能力 |
| **CSS-first 框架** | Panda CSS, Tailwind v4    | 开发者主导，Token 即代码                 | Wave 的下游消费者               |
| **设计系统平台**   | Knapsack, Backlight       | Token + 组件 + 文档一体化                | Wave 的潜在进化方向             |

### 1.2 关键趋势（2024-2025）

1. **DTCG 格式加速统一**：W3C Design Tokens Community Group 的格式规范（`$value`, `$type`, `$ref`）正在被 Figma、Tokens Studio、Style Dictionary v4 采纳。Wave 已支持 DTCG 子集，具备先发优势。
2. **Figma → Code 的自动化**：设计师不再满足于"手动导出"，而是希望设计稿修改后自动触发 Token 更新。这是 Tokens Studio 和 Specify 的核心卖点。
3. **Token 文档化**：Token 生成后必须有文档（Storybook、静态站点、Figma Spec），否则开发无法正确使用。
4. **AI 辅助命名与检查**：新兴工具开始用 AI 自动生成 Token 命名建议、检测语义冲突。

---

## 二、Wave 现状：SWOT 分析

### 2.1 优势 (Strengths)

- **轻量瑞士军刀**：单个 CLI，零配置即可基于 `themefile` 生成多平台输出。
- **设计师友好的配置层**：YAML 格式、`main.yaml` + `variants/` 的文件夹约定，比 Style Dictionary 的 JSON 配置更直观。
- **中国特色功能**：内置 `leonardo` 色板、`smoothGradient`、`smoothShadow`、`inheritColor`，这些都是实际设计工作中的高频需求。
- **Sketch 输出支持**：国内设计师仍有大量 Sketch 用户，这是多数海外 Token 工具忽略的战场。
- **WCAG 对比度检查**：`wave doctor --contrast` 能够前置发现可访问性问题。

### 2.2 劣势 (Weaknesses)

- **没有 Figma 集成**：设计师的工作流起点在 Figma，Wave 完全独立于设计工具。
- **没有文档生成能力**：生成的 Token 躺在 `Downloads` 文件夹里，没有配套文档说明用途和用法。
- **分发链路断裂**：生成后需要手动复制到项目里，没有自动同步到 GitHub/NPM/设计系统仓库的机制。
- **纯 CLI 门槛**：虽然已有 TUI，但对很多设计师而言"打开终端"本身就是门槛。
- **缺少可视化预览**：设计师无法直观看到修改 Token 后的色彩/阴影/圆角变化。

> 💬 **Reply** @杨桃
> cli 和预览, 可以并网页应用, 这确实是未来的重要目标, 在线完成色彩配置和输出, 实时查看 `--contrans` 等参考值

### 2.3 机会 (Opportunities)

- **Tokens Studio 的空白市场**：Tokens Studio 转向云端收费后，很多小团队需要轻量、免费的替代方案。
- **Figma → DTCG 的桥梁**：市面上缺少"把 Figma Variables 导出为符合 Wave 规范的 DTCG/YAML"的工具。
- **AI Token 助手**：结合 LLM 做 Token 命名建议、语义检查、自动文档生成，是低成本高价值的差异化功能。
- **Tailwind v4 适配**：Tailwind 4.0 原生支持 CSS Variables，Wave 的 CSS 输出可以无缝接入，这是一个天然的增长点。

### 2.4 威胁 (Threats)

- **Style Dictionary v4 的易用性提升**：如果 SD v4 继续简化配置，Wave 的"封装层"价值会被稀释。
- **Figma 原生 Variables 成熟**：Figma 内置的 Variables 系统如果持续增强，可能减少设计师对第三方 Token 工具的需求。
- **Cursor/Windsurf 等 AI IDE**：开发者越来越依赖 AI 直接写 CSS/Theme，可能绕过专门的 Token 管理工具。

---

## 三、用户画像与核心痛点

### 3.1 目标用户：UI&UX 设计师（如杨桃）

- 懂 HTML/CSS，但不会写复杂脚本或配置。
- 日常工作在 Figma/Sketch 中完成。
- 需要把设计稿中的颜色、字号、圆角、阴影"规范地"交给开发。
- 痛点不是"生成 Token 文件"，而是：
  1. **命名不一致**：设计里叫 `主色-深`，开发里叫 `primary-700`。
  2. **Dark Mode 维护困难**：Figma 里做了 dark 变体，开发说"你没给我 dark token"。
  3. **没有文档**：开发反复问"这个颜色用在哪里"。
  4. **更新不同步**：设计改了颜色，开发不知道，产品上线后还是旧色。

### 3.2 核心洞察

> Wave 的价值主张应该是：**"让设计师像管理 Figma 样式一样管理 Design Token，并自动同步到开发代码库。"**

当前的 Wave 只完成了"生成 Token 文件"这一步，前后端的桥梁还没打通。

---

## 四、迭代路线图

### Phase 1：夯实基础（0-2 个月）

**目标：让 CLI 成为设计师可以完全独立完成的工作流**

| 优先级 | 功能                       | 原因                                                                    |
| ------ | -------------------------- | ----------------------------------------------------------------------- |
| P0     | **完善 `wave create` TUI** | 已完成：多主题项目支持交互式选择                                        |
| P0     | **修复 TTY 检测边界情况**  | CI/管道环境不应触发 TUI                                                 |
| P1     | **`wave init` 模板升级**   | 根据用户选择的平台（json/css/sketch）生成不同的 `main.yaml` 示例        |
| P1     | **错误信息设计优化**       | 把 CLI 的报错翻译成设计师能看懂的中文，指出"哪一行、哪个 token、怎么修" |
| P1     | **输出路径可配置化**       | 支持 `themefile` 中声明 `outputDir`，减少每次打 `-o` 参数               |

> 💬 **Reply** @杨桃
>
> 1. 输出路径可配置化已经实现, 在 themefile 中配置 `PARAMETER output path/path` 指定位置
> 2. 模板升级的思路错了, wave 是统一配置输出不同平台

### Phase 2：桥梁搭建（2-4 个月）

**目标：打通"设计 → Token → 文档/代码"的链路**

| 优先级 | 功能                         | 原因                                                                                                                                                    |
| ------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0     | **`wave docs` 文档生成命令** | 基于生成的 Token 输出一个静态 HTML 站点（或 Markdown），包含：色板展示、Token 表格、用法示例、WCAG 评级。解决"开发不知道这个 token 怎么用"的痛点。      |
| P1     | **Figma Variables 导出器**   | 一个 Figma Plugin（或独立的 `wave figma-export` 命令），把 Figma Variables 导出为 Wave 的 `main.yaml` + `themefile`。这是设计师工作流的真正起点。       |
| P1     | **Token 预览器（Web UI）**   | 一个本地启动的轻量 Web 服务（`wave preview`），实时渲染 Token 变化：颜色网格、Typography 样例、Shadow 层级、Radius 卡片。让设计师能"看到"自己的 Token。 |
| P2     | **Watch 模式**               | `wave create --watch`：监听 `main.yaml`/`variants/` 变化，自动重新生成。配合 Preview 实现实时反馈。                                                     |

### Phase 3：生态扩展（4-6 个月）

**目标：从个人工具升级为团队协作平台**

| 优先级 | 功能                        | 原因                                                                                                              |
| ------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| P1     | **GitHub Action / CI 集成** | 提供一个官方 GitHub Action，让设计系统仓库在 PR 中自动运行 `wave create` + `wave doctor`，并发布 npm 包。         |
| P1     | **设计系统模板市场**        | `wave init --template <name>`：内置几种常见的设计系统 Token 结构（Material 3、iOS、Ant Design）。                 |
| P2     | **AI Token 助手**           | `wave suggest`：输入一段设计描述（如"一个医疗 APP 的主色调，要专业、可信"），AI 生成推荐的 `palette` 配置和命名。 |
| P2     | **跨团队共享内置资源**      | 让 `wave` 支持加载远程的 palette/dimension 资源（URL），团队可以维护私有资源库。                                  |

### Phase 4：长期愿景（6 个月+）

- **Figma Plugin 双向同步**：Figma Variables ↔ Wave YAML，真正的 Single Source of Truth。
- **Token 版本管理与 Diff**：类似 `git diff`，但针对 Token 变更生成可视化的"设计变更报告"。
- **组件级 Token 绑定**：Token 不再只是"颜色"，而是直接关联到 Button、Card、Input 等组件的语义 Token。

---

## 五、下一阶段建议：立即启动的 3 件事

### 1. `wave preview` — Token 实时预览器

**为什么先做它**：

- 技术实现成本最低（纯前端，读取生成的 JSON/YAML 渲染即可）。
- 对设计师的价值最直观：终于能"看见"自己的 Token 长什么样。
- 可以成为后续 `wave docs` 和 Figma Plugin 的基础组件。

**MVP 形态**：

```bash
$ wave preview -f ./themefile
> Local preview: http://localhost:3333
```

页面分栏：

- 左侧：Token 树（Color / Dimension / Shadow / Radius）
- 右侧：预览画布（色板、字体样例、阴影卡片、圆角按钮）

### 2. `wave docs` — 自动文档生成

**MVP 形态**：

```bash
$ wave docs -f ./themefile -o ./docs
```

输出一个静态 HTML 文件夹，包含：

- 各 platform 的下载入口
- Color Palette 的可视化色阶图
- Typography 的展示表格
- WCAG 对比度矩阵（基于 doctor 数据）
- 每个 Token 的 `$description` 说明

可以直接部署到 GitHub Pages / Cloudflare Pages。

### 3. 优化错误信息体验

这是提升设计师留存率的关键细节。当前的 CLI 错误对非技术用户不够友好。建议：

- 所有错误增加"错误代码 + 解决建议"（如 `W001: 找不到 themefile，请运行 wave init 初始化`）。
- YAML 解析错误指出具体行号和附近上下文。
- 对比度检查失败时，不仅给比值，还要告诉用户"背景色 #FFF，文字色 #CCC，对比度 1.5:1，不满足 WCAG AA 标准，建议将文字色加深至 #767676"。

---

## 六、竞争定位总结

| 产品             | 设计师友好度 | 开发集成度 | 价格      | Wave 的差异化                  |
| ---------------- | ------------ | ---------- | --------- | ------------------------------ |
| Style Dictionary | 低           | 高         | 开源免费  | Wave 是更简单的封装层          |
| Tokens Studio    | 高           | 中         | 云端收费  | Wave 免费、本地化、Sketch 支持 |
| Specify          | 高           | 高         | SaaS 订阅 | Wave 无需订阅、完全本地        |
| Supernova        | 高           | 高         | SaaS 订阅 | Wave 轻量、专注 Token 生成     |
| Knapsack         | 中           | 高         | 企业订阅  | Wave 更适合个人/小团队         |

**Wave 的最佳定位**：

> **"面向独立设计师和小型设计团队的本地化 Design Token 工作站"**
> ——从 Figma 出发，一键生成开发可用的 Token 文件和配套文档，无需 SaaS 订阅，完全掌控在自己的电脑和仓库里。

---

## 七、附录：功能优先级矩阵

```
高价值 ↑
│  Figma Plugin      │  AI 助手
│  文档生成          │  云端同步
│  Token 预览器      │  GitHub Action
│  错误信息优化      │  模板市场
│  TUI 完善          │  Watch 模式
└────────────────────┘──────────→ 高实现成本
```

建议近期优先执行：**TUI 完善（已完成）→ 错误信息优化 → Token 预览器 → 文档生成**

# Wave Manual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `wave manual`, a local browser-based user manual for Wave with a Vite + React documentation app, a single `manual/` content source, and a Bun static server.

**Architecture:** `manual/` is the only user-facing documentation source. Build scripts validate `manual.config.yaml` and `manual/pages/*.md`, generate `dist/manual-app/manual-data.json`, build the Vite app into `dist/manual-app/`, and `wave manual` serves only that built output. Runtime never reads source docs.

**Tech Stack:** Bun, TypeScript, commander, pnpm, Vite, React, js-yaml, Markdown/frontmatter parsing, bun:test, Playwright or browser smoke for rendered UI.

---

## Context

The approved spec is [2026-06-18-wave-manual-design.md](../specs/2026-06-18-wave-manual-design.md). A strict review subagent initially requested changes for build/runtime truth, asset location, manifest schema, CLI contract, and anti-empty-shell tests. The revised spec passed review.

Current repo facts:

- CLI entry: `src/index.ts` imports `src/cli/index.ts`.
- Command registry: `src/cli/registry.ts`.
- Top-level help is hard-coded in `src/cli/index.ts`.
- Existing command tests spawn `bun run src/index.ts`.
- `package.json` currently builds only `dist/wave`.
- `MANUAL.md` is currently a long user manual and must become a short `wave manual` entry.
- `docs/GUIDE.md` must not remain a second complete user guide in README-facing docs.

Do not implement beyond the approved spec. Do not add Next.js or Nextra.

## File Structure

Create:

- `manual/manual.config.yaml`: manual site metadata, cards, and nav.
- `manual/pages/quickstart.md`: first-run usage.
- `manual/pages/toolchain.md`: install and toolchain checks.
- `manual/pages/design-token.md`: `wave dt` usage.
- `manual/pages/resources.md`: `wave dt show/update/status` usage.
- `manual/pages/compress.md`: `wave compress` usage.
- `manual/pages/motion.md`: `wave motion` / `wave mg` usage.
- `manual/pages/workspace.md`: `wave workspace` usage.
- `manual/pages/command-index.md`: command reference index.
- `manual/pages/config-paths.md`: user-editable config paths.
- `manual/pages/troubleshooting.md`: common failures.
- `src/core/manual/types.ts`: manual config, page, and build-output types.
- `src/core/manual/loader.ts`: load and validate config/pages from `manual/`.
- `src/core/manual/markdown.ts`: parse frontmatter and Markdown body.
- `src/core/manual/build.ts`: build `manual-data.json` and copy/create app assets contract.
- `src/core/manual/server.ts`: Bun static file server for built manual app.
- `src/core/manual/assets.ts`: resolve `dist/manual-app/` for source and compiled CLI.
- `src/cli/commands/manual.ts`: commander command for `wave manual`.
- `src/manual-app/index.html`: Vite app shell.
- `src/manual-app/src/main.tsx`: React bootstrap.
- `src/manual-app/src/App.tsx`: layout, routing, search.
- `src/manual-app/src/styles.css`: manual app styling.
- `src/manual-app/src/manual-data.ts`: load `manual-data.json`.
- `scripts/build-manual.ts`: CLI build script for manual data and Vite build.
- `tests/manual-loader.test.ts`: schema and source validation.
- `tests/cli-manual.test.ts`: CLI/server behavior.
- `tests/manual-app.test.ts`: generated data and rendered-app smoke.

Modify:

- `package.json`: add dependencies and scripts.
- `pnpm-lock.yaml`: update dependencies.
- `src/cli/index.ts`: add `manual` to hard-coded top-level help and normalization if needed.
- `src/cli/registry.ts`: register manual command and category.
- `MANUAL.md`: shorten to `wave manual` entry.
- `README.md`: point full manual link to `wave manual` / `manual/` source, remove `docs/GUIDE.md` as user guide.
- `docs/GUIDE.md`: remove or replace with migration note so it is not a second complete guide.
- `docs/SPEC.md`: add current behavior note after implementation lands.

## Task 1: Dependencies and Scripts

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add manual app dependencies**

Run:

```bash
pnpm add -D vite@^6.4.3 react react-dom marked gray-matter @types/react @types/react-dom
```

Expected: `package.json` and `pnpm-lock.yaml` change.

- [ ] **Step 2: Add scripts**

Edit `package.json` scripts to include:

```json
{
  "manual:dev": "vite --host 127.0.0.1 src/manual-app",
  "manual:build": "echo \"manual build script is added in the wave manual build task\" && exit 1",
  "build": "rm -f .*.bun-build && bun build ./src/index.ts --compile --outfile dist/wave && rm -f .*.bun-build"
}
```

Keep all existing scripts not shown above. Do not connect `manual:build` to the top-level `build` until Task 4 creates `scripts/build-manual.ts`.

- [ ] **Step 3: Verify scripts parse**

Run:

```bash
pnpm install --lockfile-only
```

Expected: `pnpm install --lockfile-only` succeeds and `pnpm-lock.yaml` is current. `pnpm build` still builds the CLI because `manual:build` is intentionally a placeholder in this task.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add manual app dependencies"
```

## Task 2: Manual Content Source

**Files:**
- Create: `manual/manual.config.yaml`
- Create: all files under `manual/pages/`

- [ ] **Step 1: Create `manual/manual.config.yaml`**

Add:

```yaml
site:
  title: Wave Manual
  description: Wave 面向 UI/UX 设计师的本地设计交付手册。
  basePath: /

home:
  cards:
    - title: Design Token
      description: 读取 main.yaml，生成 json、jsonc、css 和 sketch 输出。
      href: /design-token
      command: wave dt
    - title: 素材压缩
      description: 压缩 PNG、JPG、SVG 和 GIF，支持 dry-run、递归扫描和 SVG 图标清洗。
      href: /compress
      command: wave compress
    - title: 动效生成
      description: 从 PNG 帧目录生成 GIF 或 APNG。
      href: /motion
      command: wave motion
    - title: 工作区创建
      description: 按本地配置创建设计项目目录。
      href: /workspace
      command: wave workspace

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

- [ ] **Step 2: Create page skeletons with valid frontmatter**

For each page, include `title`, `description`, `category`, `commands`, and `appliesTo`. Use this pattern:

```markdown
---
title: 快速开始
description: 从安装依赖到运行第一个 Wave 命令。
category: 开始
commands:
  - wave --help
  - wave dt
appliesTo:
  - 本地 CLI
---

## 用途

Wave 把设计 token、素材压缩、PNG 帧动效、工作区创建和本地工具链检查放在一个 CLI 中。

## 最短路径

```bash
mise install
pnpm install
pnpm dev -- --help
```

## 下一步

- 生成 design token：`wave dt`
- 压缩素材：`wave compress`
- 生成动效：`wave motion`
- 创建工作区：`wave workspace`
```

Use Chinese for all manual content. Keep command examples factual and concise.

- [ ] **Step 3: Populate command-specific pages**

Ensure these minimum command snippets exist:

```bash
wave dt
wave dt build -f ./main.yaml
wave dt show
wave dt update tailwindcss
wave dt status
wave compress ./assets --dry-run
wave compress ./assets --type svg --icon --yes
wave motion gif ./frames --fps 24 --out loading.gif
wave motion apng ./frames --fps 24 --out loading.png
wave workspace
wave doctor --status
wave install --check
```

- [ ] **Step 4: Verify no internal docs are referenced as manual sources**

Run:

```bash
rg -n "docs/SPEC|SWISS_KNIFE_REFACTOR|graphify|AGENTS|CLAUDE" manual
```

Expected: no matches, except if a troubleshooting page explicitly says internal docs are not part of the manual. Prefer no matches.

- [ ] **Step 5: Commit**

```bash
git add manual
git commit -m "docs: add manual content source"
```

## Task 3: Manual Loader and Validation

**Files:**
- Create: `src/core/manual/types.ts`
- Create: `src/core/manual/markdown.ts`
- Create: `src/core/manual/loader.ts`
- Test: `tests/manual-loader.test.ts`

- [ ] **Step 1: Write failing validation tests**

Create `tests/manual-loader.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadManualSource } from '../src/core/manual/loader.ts';

async function writeFixture(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-manual-'));
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(dir, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  }
  return dir;
}

const page = (title: string) => `---
title: ${title}
description: Page description.
category: 开始
commands:
  - wave dt
appliesTo:
  - 本地 CLI
---

## 用途

正文内容。
`;

describe('manual loader', () => {
  test('loads config, pages, and search text', async () => {
    const root = await writeFixture({
      'manual/manual.config.yaml': `site:
  title: Wave Manual
  description: Desc
  basePath: /
home:
  cards:
    - title: 快速开始
      description: Start
      href: /quickstart
      command: wave dt
nav:
  - title: 开始
    pages:
      - title: 快速开始
        href: /quickstart
        source: pages/quickstart.md
`,
      'manual/pages/quickstart.md': page('快速开始'),
    });

    const manual = await loadManualSource(root);

    expect(manual.site.title).toBe('Wave Manual');
    expect(manual.pages).toHaveLength(1);
    expect(manual.pages[0]?.href).toBe('/quickstart');
    expect(manual.pages[0]?.searchText).toContain('wave dt');
    await fs.rm(root, { recursive: true, force: true });
  });

  test('rejects docs paths in nav sources', async () => {
    const root = await writeFixture({
      'manual/manual.config.yaml': `site:
  title: Wave Manual
  description: Desc
  basePath: /
home:
  cards: []
nav:
  - title: 内部
    pages:
      - title: SPEC
        href: /spec
        source: ../docs/SPEC.md
`,
    });

    await expect(loadManualSource(root)).rejects.toThrow('manual nav source must stay inside manual/pages');
    await fs.rm(root, { recursive: true, force: true });
  });

  test('rejects missing pages and mismatched titles', async () => {
    const missing = await writeFixture({
      'manual/manual.config.yaml': `site:
  title: Wave Manual
  description: Desc
  basePath: /
home:
  cards: []
nav:
  - title: 开始
    pages:
      - title: 快速开始
        href: /quickstart
        source: pages/quickstart.md
`,
    });

    await expect(loadManualSource(missing)).rejects.toThrow('manual page not found');
    await fs.rm(missing, { recursive: true, force: true });

    const mismatch = await writeFixture({
      'manual/manual.config.yaml': `site:
  title: Wave Manual
  description: Desc
  basePath: /
home:
  cards: []
nav:
  - title: 开始
    pages:
      - title: 快速开始
        href: /quickstart
        source: pages/quickstart.md
`,
      'manual/pages/quickstart.md': page('Wrong Title'),
    });

    await expect(loadManualSource(mismatch)).rejects.toThrow('frontmatter title must match nav title');
    await fs.rm(mismatch, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun test tests/manual-loader.test.ts
```

Expected: FAIL because `src/core/manual/loader.ts` does not exist.

- [ ] **Step 3: Implement types**

Create `src/core/manual/types.ts`:

```ts
export interface ManualSiteConfig {
  title: string;
  description: string;
  basePath: string;
}

export interface ManualHomeCard {
  title: string;
  description: string;
  href: string;
  command: string;
}

export interface ManualNavPageConfig {
  title: string;
  href: string;
  source: string;
}

export interface ManualNavSectionConfig {
  title: string;
  pages: ManualNavPageConfig[];
}

export interface ManualConfig {
  site: ManualSiteConfig;
  home: { cards: ManualHomeCard[] };
  nav: ManualNavSectionConfig[];
}

export interface ManualPageFrontmatter {
  title: string;
  description: string;
  category: string;
  commands: string[];
  appliesTo: string[];
}

export interface ManualPage {
  title: string;
  description: string;
  category: string;
  commands: string[];
  appliesTo: string[];
  href: string;
  source: string;
  body: string;
  html: string;
  headings: { id: string; text: string; level: number }[];
  searchText: string;
}

export interface ManualData {
  site: ManualSiteConfig;
  home: { cards: ManualHomeCard[] };
  nav: ManualNavSectionConfig[];
  pages: ManualPage[];
}
```

- [ ] **Step 4: Implement markdown parser**

Create `src/core/manual/markdown.ts`:

```ts
import matter from 'gray-matter';
import { marked } from 'marked';
import type { ManualPageFrontmatter } from './types.ts';

export function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[`~!@#$%^&*()+=[\]{};:'",.<>/?\\|]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function parseManualMarkdown(source: string): {
  frontmatter: ManualPageFrontmatter;
  body: string;
  html: string;
  headings: { id: string; text: string; level: number }[];
} {
  const parsed = matter(source);
  const data = parsed.data as Partial<ManualPageFrontmatter>;
  const required = ['title', 'description', 'category', 'commands', 'appliesTo'] as const;
  for (const key of required) {
    if (data[key] === undefined) throw new Error(`manual frontmatter missing ${key}`);
  }
  if (!Array.isArray(data.commands)) throw new Error('manual frontmatter commands must be an array');
  if (!Array.isArray(data.appliesTo)) throw new Error('manual frontmatter appliesTo must be an array');

  const headings: { id: string; text: string; level: number }[] = [];
  const renderer = new marked.Renderer();
  renderer.heading = ({ tokens, depth }) => {
    const text = tokens.map((token) => token.raw).join('');
    const id = slugifyHeading(text);
    headings.push({ id, text, level: depth });
    return `<h${depth} id="${id}">${text}</h${depth}>`;
  };

  return {
    frontmatter: data as ManualPageFrontmatter,
    body: parsed.content.trim(),
    html: marked(parsed.content, { renderer }) as string,
    headings,
  };
}
```

- [ ] **Step 5: Implement loader validation**

Create `src/core/manual/loader.ts`:

```ts
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { parseManualMarkdown } from './markdown.ts';
import type { ManualConfig, ManualData, ManualNavPageConfig } from './types.ts';

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`manual config ${label} must be a non-empty string`);
  }
}

function validateHref(href: string, seen: Set<string>): void {
  if (!href.startsWith('/')) throw new Error(`manual href must start with /: ${href}`);
  if (seen.has(href)) throw new Error(`manual href must be unique: ${href}`);
  seen.add(href);
}

function validateSource(source: string): void {
  if (source.startsWith('/') || source.includes('..') || !source.startsWith('pages/') || !source.endsWith('.md')) {
    throw new Error('manual nav source must stay inside manual/pages');
  }
  if (source === 'MANUAL.md' || source === 'README.md' || source.startsWith('docs/') || source.startsWith('graphify-out/')) {
    throw new Error('manual nav source cannot reference internal docs');
  }
}

function flattenNavPages(config: ManualConfig): ManualNavPageConfig[] {
  return config.nav.flatMap((section) => section.pages);
}

function validateConfig(config: ManualConfig): void {
  assertString(config.site?.title, 'site.title');
  assertString(config.site?.description, 'site.description');
  assertString(config.site?.basePath, 'site.basePath');
  if (!Array.isArray(config.home?.cards)) throw new Error('manual config home.cards must be an array');
  if (!Array.isArray(config.nav) || config.nav.length === 0) throw new Error('manual config nav must be a non-empty array');

  const seen = new Set<string>();
  for (const section of config.nav) {
    assertString(section.title, 'nav[].title');
    if (!Array.isArray(section.pages) || section.pages.length === 0) throw new Error(`manual nav section has no pages: ${section.title}`);
    for (const page of section.pages) {
      assertString(page.title, 'nav[].pages[].title');
      assertString(page.href, 'nav[].pages[].href');
      assertString(page.source, 'nav[].pages[].source');
      validateHref(page.href, seen);
      validateSource(page.source);
    }
  }

  const navHrefs = new Set(flattenNavPages(config).map((page) => page.href));
  for (const card of config.home.cards) {
    assertString(card.title, 'home.cards[].title');
    assertString(card.description, 'home.cards[].description');
    assertString(card.href, 'home.cards[].href');
    assertString(card.command, 'home.cards[].command');
    if (!navHrefs.has(card.href)) throw new Error(`manual home card href must point to nav page: ${card.href}`);
  }
}

export async function loadManualSource(rootDir: string): Promise<ManualData> {
  const manualDir = path.join(rootDir, 'manual');
  const configPath = path.join(manualDir, 'manual.config.yaml');
  const rawConfig = await fs.readFile(configPath, 'utf-8').catch((error) => {
    throw new Error(`manual config not found: ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  });
  const config = yaml.load(rawConfig) as ManualConfig;
  validateConfig(config);

  const pages = [];
  for (const navPage of flattenNavPages(config)) {
    const sourcePath = path.join(manualDir, navPage.source);
    const rawPage = await fs.readFile(sourcePath, 'utf-8').catch((error) => {
      throw new Error(`manual page not found: ${navPage.source}: ${error instanceof Error ? error.message : String(error)}`);
    });
    const parsed = parseManualMarkdown(rawPage);
    if (parsed.frontmatter.title !== navPage.title) {
      throw new Error(`frontmatter title must match nav title: ${navPage.source}`);
    }
    pages.push({
      ...parsed.frontmatter,
      href: navPage.href,
      source: navPage.source,
      body: parsed.body,
      html: parsed.html,
      headings: parsed.headings,
      searchText: [
        parsed.frontmatter.title,
        parsed.frontmatter.description,
        ...parsed.frontmatter.commands,
        parsed.body,
      ].join('\n'),
    });
  }

  return {
    site: config.site,
    home: config.home,
    nav: config.nav,
    pages,
  };
}
```

- [ ] **Step 6: Run loader tests**

Run:

```bash
bun test tests/manual-loader.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/manual tests/manual-loader.test.ts
git commit -m "feat(manual): validate manual source"
```

## Task 4: Manual Build Pipeline

**Files:**
- Create: `src/core/manual/build.ts`
- Create: `scripts/build-manual.ts`
- Modify: `package.json`
- Test: `tests/manual-loader.test.ts`

- [ ] **Step 1: Add build test**

Append to `tests/manual-loader.test.ts`:

```ts
import { buildManualData } from '../src/core/manual/build.ts';

test('builds manual-data json into output directory', async () => {
  const root = await writeFixture({
    'manual/manual.config.yaml': `site:
  title: Wave Manual
  description: Desc
  basePath: /
home:
  cards:
    - title: 快速开始
      description: Start
      href: /quickstart
      command: wave dt
nav:
  - title: 开始
    pages:
      - title: 快速开始
        href: /quickstart
        source: pages/quickstart.md
`,
    'manual/pages/quickstart.md': page('快速开始'),
  });
  const outDir = path.join(root, 'dist/manual-app');

  await buildManualData({ rootDir: root, outDir });

  const data = JSON.parse(await fs.readFile(path.join(outDir, 'manual-data.json'), 'utf-8'));
  expect(data.pages[0].title).toBe('快速开始');
  expect(data.pages[0].html).toContain('<h2 id="');
  await fs.rm(root, { recursive: true, force: true });
});
```

- [ ] **Step 2: Verify failing test**

Run:

```bash
bun test tests/manual-loader.test.ts
```

Expected: FAIL because `buildManualData` does not exist.

- [ ] **Step 3: Implement build helper**

Create `src/core/manual/build.ts`:

```ts
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { loadManualSource } from './loader.ts';
import type { ManualData } from './types.ts';

export interface BuildManualOptions {
  rootDir: string;
  outDir: string;
}

export async function buildManualData(options: BuildManualOptions): Promise<ManualData> {
  const data = await loadManualSource(options.rootDir);
  await fs.mkdir(options.outDir, { recursive: true });
  await fs.writeFile(
    path.join(options.outDir, 'manual-data.json'),
    `${JSON.stringify(data, null, 2)}\n`,
    'utf-8',
  );
  return data;
}
```

- [ ] **Step 4: Implement build script**

Create `scripts/build-manual.ts`:

```ts
import * as path from 'node:path';
import { $ } from 'bun';
import { buildManualData } from '../src/core/manual/build.ts';

const rootDir = path.resolve(import.meta.dir, '..');
const outDir = path.join(rootDir, 'dist/manual-app');

await $`rm -rf ${outDir}`;
await $`bunx vite build src/manual-app --outDir ${outDir} --emptyOutDir`;
await buildManualData({ rootDir, outDir });

console.log(`Built Wave manual app at ${outDir}`);
```

Note: This writes `manual-data.json` after Vite build so Vite does not delete it.

- [ ] **Step 5: Wire build scripts**

Update `package.json` scripts:

```json
{
  "manual:build": "bun run scripts/build-manual.ts",
  "build:cli": "rm -f .*.bun-build && bun build ./src/index.ts --compile --outfile dist/wave && rm -f .*.bun-build",
  "build": "pnpm manual:build && pnpm build:cli"
}
```

Keep `manual:dev` from Task 1. This is the first task where the top-level `build` may depend on `manual:build`, because `scripts/build-manual.ts` now exists.

- [ ] **Step 6: Run build helper tests**

Run:

```bash
bun test tests/manual-loader.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run manual build**

Run:

```bash
pnpm manual:build
```

Expected: `dist/manual-app/index.html` and `dist/manual-app/manual-data.json` exist.

- [ ] **Step 8: Commit**

```bash
git add src/core/manual/build.ts scripts/build-manual.ts tests/manual-loader.test.ts package.json pnpm-lock.yaml
git commit -m "feat(manual): build manual data"
```

## Task 5: Manual Frontend App

**Files:**
- Create: `src/manual-app/index.html`
- Create: `src/manual-app/src/main.tsx`
- Create: `src/manual-app/src/App.tsx`
- Create: `src/manual-app/src/manual-data.ts`
- Create: `src/manual-app/src/styles.css`
- Test: `tests/manual-app.test.ts`

- [ ] **Step 1: Create frontend smoke test**

Create `tests/manual-app.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const rootDir = path.resolve(import.meta.dir, '..');

describe('manual app source', () => {
  test('app contains required rendered regions and data fetch', async () => {
    const app = await fs.readFile(path.join(rootDir, 'src/manual-app/src/App.tsx'), 'utf-8');
    const data = await fs.readFile(path.join(rootDir, 'src/manual-app/src/manual-data.ts'), 'utf-8');

    expect(app).toContain('data-testid="manual-home-card"');
    expect(app).toContain('data-testid="manual-page-title"');
    expect(app).toContain('data-testid="manual-search-result"');
    expect(data).toContain('manual-data.json');
  });
});
```

- [ ] **Step 2: Verify failing test**

Run:

```bash
bun test tests/manual-app.test.ts
```

Expected: FAIL because app files do not exist.

- [ ] **Step 3: Create app shell**

Create `src/manual-app/index.html`:

```html
<!doctype html>
<html lang="zh-Hans">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Wave Manual</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `src/manual-app/src/main.tsx`:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 4: Create data loader**

Create `src/manual-app/src/manual-data.ts`:

```ts
import type { ManualData } from '../../core/manual/types.ts';

export async function loadManualData(): Promise<ManualData> {
  const response = await fetch('/manual-data.json');
  if (!response.ok) {
    throw new Error(`Failed to load manual data: ${response.status}`);
  }
  return (await response.json()) as ManualData;
}
```

- [ ] **Step 5: Create React app**

Create `src/manual-app/src/App.tsx` with:

```tsx
import { useEffect, useMemo, useState } from 'react';
import type { ManualData, ManualPage } from '../../core/manual/types.ts';
import { loadManualData } from './manual-data.ts';

function currentPath(): string {
  const path = window.location.pathname;
  return path === '/' ? '/' : path.replace(/\/$/, '');
}

function navigate(href: string): void {
  window.history.pushState({}, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function Home({ data }: { data: ManualData }) {
  return (
    <main className="content">
      <p className="eyebrow">Wave Manual</p>
      <h1>{data.site.title}</h1>
      <p className="lede">{data.site.description}</p>
      <div className="cardGrid">
        {data.home.cards.map((card) => (
          <button key={card.href} data-testid="manual-home-card" className="manualCard" onClick={() => navigate(card.href)}>
            <span>{card.title}</span>
            <small>{card.description}</small>
            <code>{card.command}</code>
          </button>
        ))}
      </div>
    </main>
  );
}

function PageView({ page }: { page: ManualPage }) {
  return (
    <main className="content">
      <p className="eyebrow">{page.category}</p>
      <h1 data-testid="manual-page-title">{page.title}</h1>
      <p className="lede">{page.description}</p>
      <div className="commandRow">
        {page.commands.map((command) => <code key={command}>{command}</code>)}
      </div>
      <article className="article" dangerouslySetInnerHTML={{ __html: page.html }} />
    </main>
  );
}

export function App() {
  const [data, setData] = useState<ManualData | null>(null);
  const [path, setPath] = useState(currentPath());
  const [query, setQuery] = useState('');

  useEffect(() => {
    loadManualData().then(setData).catch((error) => {
      console.error(error);
    });
  }, []);

  useEffect(() => {
    const listener = () => setPath(currentPath());
    window.addEventListener('popstate', listener);
    return () => window.removeEventListener('popstate', listener);
  }, []);

  const results = useMemo(() => {
    if (!data || !query.trim()) return [];
    const q = query.trim().toLowerCase();
    return data.pages.filter((page) => page.searchText.toLowerCase().includes(q)).slice(0, 8);
  }, [data, query]);

  if (!data) return <main className="content">Loading Wave Manual...</main>;

  const page = data.pages.find((item) => item.href === path);

  return (
    <div className="shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate('/')}>Wave Manual</button>
        <label className="search">
          <span>Search</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索命令或主题" />
        </label>
        {results.length > 0 && (
          <div className="results">
            {results.map((result) => (
              <button key={result.href} data-testid="manual-search-result" onClick={() => { setQuery(''); navigate(result.href); }}>
                {result.title}
              </button>
            ))}
          </div>
        )}
        <nav>
          {data.nav.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              {section.pages.map((item) => (
                <button key={item.href} className={item.href === path ? 'active' : ''} onClick={() => navigate(item.href)}>
                  {item.title}
                </button>
              ))}
            </section>
          ))}
        </nav>
      </aside>
      {path === '/' ? <Home data={data} /> : page ? <PageView page={page} /> : <main className="content"><h1>页面不存在</h1></main>}
    </div>
  );
}
```

- [ ] **Step 6: Create styles**

Create `src/manual-app/src/styles.css`:

```css
:root {
  color: #1d1d22;
  background: #f7f7f4;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

body {
  margin: 0;
}

button, input {
  font: inherit;
}

.shell {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  min-height: 100vh;
}

.sidebar {
  border-right: 1px solid #deded8;
  background: #ffffff;
  padding: 20px;
  position: sticky;
  top: 0;
  height: 100vh;
  box-sizing: border-box;
  overflow: auto;
}

.brand {
  border: 0;
  background: transparent;
  font-weight: 700;
  font-size: 18px;
  padding: 0 0 18px;
}

.search {
  display: grid;
  gap: 8px;
  margin-bottom: 20px;
  color: #66665f;
  font-size: 12px;
}

.search input {
  border: 1px solid #d2d2ca;
  border-radius: 8px;
  padding: 10px 12px;
  background: #fafaf7;
}

.results {
  display: grid;
  gap: 6px;
  margin-bottom: 18px;
}

.results button, .sidebar nav button {
  border: 0;
  background: transparent;
  text-align: left;
  padding: 8px 10px;
  border-radius: 7px;
  color: #343430;
  width: 100%;
}

.sidebar nav button.active,
.results button:hover,
.sidebar nav button:hover {
  background: #efefea;
}

.sidebar h2 {
  font-size: 12px;
  color: #787870;
  margin: 22px 0 8px;
}

.content {
  max-width: 880px;
  width: min(880px, calc(100vw - 360px));
  padding: 56px 64px 96px;
}

.eyebrow {
  color: #766f5f;
  font-size: 13px;
  margin: 0 0 12px;
}

h1 {
  font-size: 38px;
  line-height: 1.12;
  margin: 0 0 16px;
}

.lede {
  color: #55554d;
  font-size: 17px;
  line-height: 1.6;
  margin: 0 0 28px;
}

.cardGrid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.manualCard {
  text-align: left;
  border: 1px solid #deded8;
  border-radius: 8px;
  background: #fff;
  padding: 16px;
  display: grid;
  gap: 10px;
}

.manualCard span {
  font-weight: 700;
}

.manualCard small {
  color: #626258;
  line-height: 1.5;
}

code {
  background: #eeeeea;
  border: 1px solid #dadad2;
  border-radius: 6px;
  padding: 2px 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.commandRow {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 28px;
}

.article {
  line-height: 1.75;
}

.article pre {
  overflow: auto;
  border-radius: 8px;
  background: #20201d;
  color: #f6f2e8;
  padding: 16px;
}

@media (max-width: 780px) {
  .shell {
    display: block;
  }
  .sidebar {
    position: static;
    height: auto;
    border-right: 0;
    border-bottom: 1px solid #deded8;
  }
  .content {
    width: auto;
    padding: 32px 20px 72px;
  }
  h1 {
    font-size: 30px;
  }
}
```

- [ ] **Step 7: Run frontend source test**

Run:

```bash
bun test tests/manual-app.test.ts
```

Expected: PASS.

- [ ] **Step 8: Build manual app**

Run:

```bash
pnpm manual:build
```

Expected: `dist/manual-app/index.html` and `dist/manual-app/manual-data.json` exist.

- [ ] **Step 9: Commit**

```bash
git add src/manual-app tests/manual-app.test.ts dist/manual-app package.json pnpm-lock.yaml
git commit -m "feat(manual): add documentation app"
```

If `dist/` is gitignored, do not force-add it. The important part is that `pnpm manual:build` creates it.

## Task 6: Manual Static Server and CLI Command

**Files:**
- Create: `src/core/manual/assets.ts`
- Create: `src/core/manual/server.ts`
- Create: `src/cli/commands/manual.ts`
- Modify: `src/cli/registry.ts`
- Modify: `src/cli/index.ts`
- Test: `tests/cli-manual.test.ts`

- [ ] **Step 1: Write CLI tests**

Create `tests/cli-manual.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const rootDir = path.resolve(import.meta.dir, '..');
const cliEntry = path.join(rootDir, 'src/index.ts');

async function runWave(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(['bun', 'run', cliEntry, ...args], {
    cwd: rootDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

describe('wave manual', () => {
  test('top-level help includes manual command', async () => {
    const { exitCode, stdout } = await runWave(['--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('manual        Open the local Wave manual');
  });

  test('manual help is actionable', async () => {
    const { exitCode, stdout } = await runWave(['manual', '--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Wave Manual');
    expect(stdout).toContain('wave manual [options]');
    expect(stdout).toContain('--port <port>');
    expect(stdout).toContain('--host <host>');
    expect(stdout).toContain('--no-open');
  });

  test('missing build output returns readable error', async () => {
    const manualApp = path.join(rootDir, 'dist/manual-app');
    const backup = path.join(rootDir, 'dist/manual-app-test-backup');
    await fs.rm(backup, { recursive: true, force: true });
    try {
      if (await Bun.file(manualApp).exists()) await fs.rename(manualApp, backup);
      const { exitCode, stderr } = await runWave(['manual', '--no-open', '--port', '4567']);
      expect(exitCode).toBe(1);
      expect(stderr).toContain('Manual app is not built');
    } finally {
      if (await Bun.file(backup).exists()) await fs.rename(backup, manualApp);
    }
  });
});
```

- [ ] **Step 2: Verify tests fail**

Run:

```bash
bun test tests/cli-manual.test.ts
```

Expected: FAIL because `manual` command does not exist.

- [ ] **Step 3: Implement asset resolver**

Create `src/core/manual/assets.ts`:

```ts
import * as path from 'node:path';

export async function resolveManualAppDir(): Promise<string> {
  const fromCwd = path.resolve(process.cwd(), 'dist/manual-app');
  if (await Bun.file(path.join(fromCwd, 'index.html')).exists()) return fromCwd;

  const executableDir = path.dirname(process.execPath);
  const fromExecutable = path.join(executableDir, 'manual-app');
  if (await Bun.file(path.join(fromExecutable, 'index.html')).exists()) return fromExecutable;

  throw new Error('Manual app is not built. Run "pnpm manual:build" or "pnpm build".');
}
```

- [ ] **Step 4: Implement static server**

Create `src/core/manual/server.ts`:

```ts
import * as path from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

export interface ManualServerOptions {
  appDir: string;
  host: string;
  port: number;
}

export async function findAvailablePort(host: string, start: number): Promise<number> {
  for (let port = start; port < start + 20; port++) {
    try {
      const server = Bun.serve({ hostname: host, port, fetch: () => new Response('ok') });
      server.stop(true);
      return port;
    } catch {
      continue;
    }
  }
  throw new Error(`No available port found from ${start}`);
}

function safeJoin(root: string, requestPath: string): string {
  const pathname = decodeURIComponent(new URL(requestPath, 'http://local').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = path.resolve(root, relative);
  if (!filePath.startsWith(path.resolve(root))) return path.join(root, 'index.html');
  return filePath;
}

export function startManualServer(options: ManualServerOptions): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    hostname: options.host,
    port: options.port,
    async fetch(request) {
      const url = new URL(request.url);
      let filePath = safeJoin(options.appDir, url.pathname);
      let file = Bun.file(filePath);
      if (!(await file.exists())) {
        if (path.extname(filePath)) return new Response('Not found', { status: 404 });
        filePath = path.join(options.appDir, 'index.html');
        file = Bun.file(filePath);
      }
      const ext = path.extname(filePath);
      return new Response(file, {
        headers: { 'content-type': CONTENT_TYPES[ext] ?? 'application/octet-stream' },
      });
    },
  });
}
```

- [ ] **Step 5: Implement command**

Create `src/cli/commands/manual.ts`:

```ts
import { spawn } from 'node:child_process';
import { Command } from 'commander';
import { resolveManualAppDir } from '../../core/manual/assets.ts';
import { findAvailablePort, startManualServer } from '../../core/manual/server.ts';
import { ExitCode } from '../../types/index.ts';

interface ManualCommandOptions {
  port?: string;
  host?: string;
  open?: boolean;
}

const MANUAL_HELP = `Wave Manual
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  Usage:
    wave manual [options]

  Options:
    --port <port>      Port to bind. Default: 4567
    --host <host>      Host to bind. Default: 127.0.0.1
    --no-open          Do not open the browser automatically
    -h, --help         Show help`;

function parsePort(value: string | undefined): number {
  if (!value) return 4567;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('--port must be an integer from 1 to 65535');
  }
  return port;
}

function openBrowser(url: string): void {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.unref();
}

export const manualCommand = new Command('manual')
  .description('Open the local Wave manual')
  .helpOption(false)
  .addHelpCommand(false)
  .option('-h, --help', 'Show help')
  .option('--port <port>', 'Port to bind. Default: 4567')
  .option('--host <host>', 'Host to bind. Default: 127.0.0.1')
  .option('--no-open', 'Do not open the browser automatically')
  .action(async (options: ManualCommandOptions & { help?: boolean }) => {
    if (options.help) {
      console.log(MANUAL_HELP);
      process.exitCode = ExitCode.SUCCESS;
      return;
    }
    try {
      const host = options.host ?? '127.0.0.1';
      const requestedPort = parsePort(options.port);
      const port = options.port ? requestedPort : await findAvailablePort(host, requestedPort);
      const appDir = await resolveManualAppDir();
      const server = startManualServer({ appDir, host, port });
      const localUrl = `http://127.0.0.1:${server.port}/`;
      console.log('Wave Manual');
      console.log(`Local: ${localUrl}`);
      if (host === '0.0.0.0') console.log(`Network: http://0.0.0.0:${server.port}/`);
      console.log('Press Ctrl+C to stop.');
      if (options.open !== false) {
        try {
          openBrowser(localUrl);
        } catch {
          console.error(`Could not open browser. Open manually: ${localUrl}`);
        }
      }
      await new Promise<void>((resolve) => {
        process.once('SIGINT', () => {
          server.stop(true);
          resolve();
        });
      });
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = ExitCode.GENERAL_ERROR;
    }
  });
```

- [ ] **Step 6: Register command and top-level help**

Modify `src/cli/registry.ts`:

```ts
import { manualCommand } from './commands/manual.ts';
```

Add category type:

```ts
| 'manual'
```

Add registry entry before legacy commands:

```ts
{
  name: 'manual',
  category: 'manual',
  command: manualCommand,
},
```

Modify `TOP_LEVEL_HELP` in `src/cli/index.ts` to include:

```text
    manual         Open the local Wave manual
```

- [ ] **Step 7: Run CLI tests**

Run:

```bash
bun test tests/cli-manual.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/core/manual/assets.ts src/core/manual/server.ts src/cli/commands/manual.ts src/cli/registry.ts src/cli/index.ts tests/cli-manual.test.ts
git commit -m "feat(manual): serve local manual app"
```

## Task 7: Build and Runtime Smoke Tests

**Files:**
- Modify: `tests/cli-manual.test.ts`
- Modify: `tests/manual-app.test.ts`

- [ ] **Step 1: Add built data regression tests**

Append to `tests/manual-app.test.ts`:

```ts
test('built manual data excludes internal docs and contains core pages', async () => {
  const proc = Bun.spawn(['pnpm', 'manual:build'], {
    cwd: rootDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(await proc.exited).toBe(0);
  const data = JSON.parse(await fs.readFile(path.join(rootDir, 'dist/manual-app/manual-data.json'), 'utf-8'));
  const text = JSON.stringify(data);
  expect(text).toContain('Design Token');
  expect(text).toContain('wave compress');
  expect(text).not.toContain('SWISS_KNIFE_REFACTOR');
  expect(text).not.toContain('graphify');
  expect(text).not.toContain('agent 必读');
});
```

- [ ] **Step 2: Add server smoke test**

Append to `tests/cli-manual.test.ts`:

```ts
test('manual server returns app shell and data', async () => {
  const build = Bun.spawn(['pnpm', 'manual:build'], { cwd: rootDir, stdout: 'pipe', stderr: 'pipe' });
  expect(await build.exited).toBe(0);

  const port = 4677;
  const proc = Bun.spawn(['bun', 'run', cliEntry, 'manual', '--no-open', '--port', String(port)], {
    cwd: rootDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 800));
    const html = await fetch(`http://127.0.0.1:${port}/design-token`).then((res) => res.text());
    const data = await fetch(`http://127.0.0.1:${port}/manual-data.json`).then((res) => res.json());
    expect(html).toContain('<div id="root"></div>');
    expect(JSON.stringify(data)).toContain('Design Token');
  } finally {
    proc.kill('SIGINT');
    await proc.exited;
  }
});
```

- [ ] **Step 3: Run smoke tests**

Run:

```bash
bun test tests/manual-app.test.ts tests/cli-manual.test.ts
```

Expected: PASS. If port `4677` is occupied, choose another fixed high port and update the test.

- [ ] **Step 4: Commit**

```bash
git add tests/manual-app.test.ts tests/cli-manual.test.ts
git commit -m "test(manual): cover built app smoke"
```

## Task 8: User-Facing Docs Cleanup

**Files:**
- Modify: `MANUAL.md`
- Modify: `README.md`
- Modify: `docs/GUIDE.md`
- Modify: `docs/SPEC.md`

- [ ] **Step 1: Shorten `MANUAL.md`**

Replace `MANUAL.md` with:

```markdown
# Wave 用户手册

完整使用手册由本仓库的 `manual/` 目录维护。运行本地文档页面：

```bash
wave manual
```

开发环境中可运行：

```bash
pnpm manual:build
pnpm dev -- manual
```

内部行为快照见 `docs/SPEC.md`。实现蓝图见 `docs/SWISS_KNIFE_REFACTOR.md`。
```

- [ ] **Step 2: Update README documentation section**

In `README.md`, change the docs section to:

```markdown
## 文档

- `wave manual`：本地用户手册页面，聚合日常使用说明。
- [manual/](./manual)：用户手册内容源。
- [docs/SPEC.md](./docs/SPEC.md)：系统行为快照，适合实现和 review 前阅读。
- [docs/CHANGELOG.md](./docs/CHANGELOG.md)：变更记录。
- [docs/SWISS_KNIFE_REFACTOR.md](./docs/SWISS_KNIFE_REFACTOR.md)：瑞士军刀化重构路线。
```

Remove `docs/GUIDE.md` from README as a full user guide link.

- [ ] **Step 3: Replace `docs/GUIDE.md` with migration note**

Replace with:

```markdown
# Wave 使用指南

本文件已迁移。用户向使用说明现在统一维护在 `manual/`，并通过本地页面查看：

```bash
wave manual
```

内部行为快照见 `docs/SPEC.md`。
```

- [ ] **Step 4: Update SPEC CLI list**

In `docs/SPEC.md` command list, add:

```markdown
- `wave manual`：启动本地用户手册页面服务，服务 `dist/manual-app/` 构建产物。
```

Also add a short note that user-facing usage docs are sourced from `manual/`, while `docs/SPEC.md` remains internal behavior snapshot.

- [ ] **Step 5: Run duplicate docs scan**

Run:

```bash
rg -n "完整功能指南|Shadow 与 smoothShadow|wave compress ./assets --type svg --icon|wave motion gif ./frames" MANUAL.md docs/GUIDE.md README.md
```

Expected: no stale full-guide content in `MANUAL.md` or `docs/GUIDE.md`. `README.md` may contain quick examples only if they remain concise.

- [ ] **Step 6: Commit**

```bash
git add MANUAL.md README.md docs/GUIDE.md docs/SPEC.md
git commit -m "docs: route user guide to wave manual"
```

## Task 9: Final Verification

**Files:**
- No source edits unless verification exposes a bug.

- [ ] **Step 1: Run typecheck**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 2: Run focused tests**

```bash
bun test tests/manual-loader.test.ts tests/manual-app.test.ts tests/cli-manual.test.ts tests/cli-dt.test.ts tests/cli-compress.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run full test suite**

```bash
bun test
```

Expected: PASS.

- [ ] **Step 4: Build release artifact**

```bash
pnpm build
```

Expected:

- `dist/wave` exists.
- `dist/manual-app/index.html` exists.
- `dist/manual-app/manual-data.json` exists.

- [ ] **Step 5: Verify compiled CLI serves manual**

Run in one terminal:

```bash
dist/wave manual --no-open --port 4688
```

In another terminal:

```bash
curl -s http://127.0.0.1:4688/ | rg "root"
curl -s http://127.0.0.1:4688/manual-data.json | rg "Design Token|wave compress"
curl -s http://127.0.0.1:4688/design-token | rg "root"
```

Expected: all commands match. Stop the server with `Ctrl+C`.

- [ ] **Step 6: Browser verification**

Open `http://127.0.0.1:4688/` while the server is running and verify:

- Homepage renders capability cards.
- Sidebar navigation works.
- Search finds `wave compress`.
- `/design-token` refresh keeps the app shell.
- Mobile viewport does not overlap sidebar and content.

- [ ] **Step 7: Commit fixes if needed**

If verification required code changes, inspect `git status --short`, stage only the files changed by the fix, and commit them with `fix(manual): stabilize manual verification`. If no fixes were needed, do not create an empty commit.

## Plan Self-Review

Spec coverage:

- Content source and manifest schema: Tasks 2 and 3.
- Build-time/runtime truth split: Tasks 4, 6, and 7.
- Frontend documentation app: Task 5.
- CLI command and static server: Task 6.
- Anti-empty-shell and no-internal-doc regression tests: Task 7.
- User-facing docs cleanup: Task 8.
- Release verification: Task 9.

No placeholders remain. Function names used across tasks are consistent: `loadManualSource`, `parseManualMarkdown`, `buildManualData`, `resolveManualAppDir`, `findAvailablePort`, and `startManualServer`.

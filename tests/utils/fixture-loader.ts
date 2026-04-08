/**
 * 测试固件加载工具
 *
 * 提供标准主题的快速加载和临时主题创建功能
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';

export interface TestTheme {
  name: string;
  dir: string;
  themefile: string;
  mainYaml: string;
  nightYaml?: string;
  variantsDir?: string;
}

export interface ThemeConfig {
  name: string;
  palette?: string;
  dimension?: string;
  platform?: string[];
  colorSpace?: string;
  tokens: Record<string, unknown>;
}

const FIXTURES_DIR = path.join(import.meta.dir, '..', 'fixtures', 'themes');

/**
 * 加载标准测试主题
 */
export async function loadTestTheme(name: string): Promise<TestTheme> {
  const themeDir = path.join(FIXTURES_DIR, name);

  // 验证目录存在
  try {
    await fs.access(themeDir);
  } catch {
    throw new Error(`Test theme not found: ${name} at ${themeDir}`);
  }

  const themefile = path.join(themeDir, 'themefile');
  const mainYaml = path.join(themeDir, 'main.yaml');
  const nightYaml = path.join(themeDir, 'main@night.yaml');
  const variantsDir = path.join(themeDir, 'variants');

  // 验证必要文件
  try {
    await fs.access(themefile);
    await fs.access(mainYaml);
  } catch {
    throw new Error(`Test theme ${name} missing required files (themefile or main.yaml)`);
  }

  // 检查可选文件
  const hasNight = await fs.access(nightYaml).then(() => true).catch(() => false);
  const hasVariants = await fs.access(variantsDir).then(() => true).catch(() => false);

  return {
    name,
    dir: themeDir,
    themefile,
    mainYaml,
    ...(hasNight && { nightYaml }),
    ...(hasVariants && { variantsDir }),
  };
}

/**
 * 创建临时测试主题
 */
export async function createTempTheme(config: ThemeConfig): Promise<TestTheme> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-test-'));

  // 构建 themefile
  const themefileContent = [
    `THEME ${config.name}`,
    `RESOURCE palette ${config.palette ?? 'tailwindcss4'}`,
    `RESOURCE dimension ${config.dimension ?? 'wave'}`,
    ...(config.platform ? [`PARAMETER platform ${config.platform.join(',')}`] : []),
    ...(config.colorSpace ? [`PARAMETER colorSpace ${config.colorSpace}`] : []),
  ].join('\n');

  // 构建 main.yaml
  const mainYamlContent = `theme:\n${renderTokens(config.tokens, 2)}`;

  await fs.writeFile(path.join(tempDir, 'themefile'), themefileContent, 'utf-8');
  await fs.writeFile(path.join(tempDir, 'main.yaml'), mainYamlContent, 'utf-8');

  return {
    name: config.name,
    dir: tempDir,
    themefile: path.join(tempDir, 'themefile'),
    mainYaml: path.join(tempDir, 'main.yaml'),
  };
}

/**
 * 清理临时主题
 */
export async function cleanupTempTheme(theme: TestTheme): Promise<void> {
  if (theme.dir.includes('wave-test-')) {
    await fs.rm(theme.dir, { recursive: true, force: true });
  }
}

/**
 * 渲染 token 为 YAML
 */
function renderTokens(tokens: Record<string, unknown>, indent: number): string {
  const spaces = ' '.repeat(indent);
  const lines: string[] = [];

  for (const [key, value] of Object.entries(tokens)) {
    if (key.startsWith('$')) {
      // DTCG 元属性
      if (typeof value === 'object' && value !== null) {
        lines.push(`${spaces}${key}:`);
        lines.push(renderValue(value, indent + 2));
      } else {
        lines.push(`${spaces}${key}: ${renderScalar(value)}`);
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // 嵌套 token 组
      lines.push(`${spaces}${key}:`);
      lines.push(renderTokens(value as Record<string, unknown>, indent + 2));
    } else {
      // 叶子值
      lines.push(`${spaces}${key}: ${renderScalar(value)}`);
    }
  }

  return lines.join('\n');
}

function renderValue(value: unknown, indent: number): string {
  const spaces = ' '.repeat(indent);

  if (Array.isArray(value)) {
    return value.map((item, i) => {
      if (typeof item === 'object' && item !== null) {
        const entries = Object.entries(item as Record<string, unknown>);
        const first = entries[0];
        if (first) {
          const rest = entries.slice(1);
          const restLines = rest.map(([k, v]) => `${spaces}  ${k}: ${renderScalar(v)}`).join('\n');
          return `${spaces}- ${first[0]}: ${renderScalar(first[1])}${restLines ? '\n' + restLines : ''}`;
        }
      }
      return `${spaces}- ${renderScalar(item)}`;
    }).join('\n');
  }

  if (typeof value === 'object' && value !== null) {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${spaces}${k}: ${renderScalar(v)}`)
      .join('\n');
  }

  return `${spaces}${renderScalar(value)}`;
}

function renderScalar(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') {
    // 需要引号的情况
    if (value.includes(':') || value.includes('#') || value.includes('{') || value.includes('"')) {
      return `"${value}"`;
    }
    return value;
  }
  if (typeof value === 'boolean') return String(value);
  return String(value);
}

/**
 * 断言输出匹配预期
 */
export function expectOutputToMatch(actual: string, expected: string, message?: string): void {
  const normalizedActual = actual.trim();
  const normalizedExpected = expected.trim();

  if (normalizedActual !== normalizedExpected) {
    const diff = generateDiff(normalizedActual, normalizedExpected);
    throw new Error(
      message ? `${message}\n${diff}` : `Output mismatch:\n${diff}`
    );
  }
}

/**
 * 简单的 diff 生成
 */
function generateDiff(actual: string, expected: string): string {
  const actualLines = actual.split('\n');
  const expectedLines = expected.split('\n');

  const maxLines = Math.max(actualLines.length, expectedLines.length);
  const diff: string[] = ['  Actual  |  Expected', '  --------+----------'];

  for (let i = 0; i < maxLines; i++) {
    const a = actualLines[i] ?? '';
    const e = expectedLines[i] ?? '';
    const marker = a === e ? ' ' : '!';
    diff.push(`${marker} ${a.padEnd(40)} | ${e}`);
  }

  return diff.join('\n');
}

/**
 * 加载预期输出文件
 */
export async function loadExpectation(name: string): Promise<string> {
  const filePath = path.join(import.meta.dir, '..', 'fixtures', 'expectations', `${name}.json`);
  return fs.readFile(filePath, 'utf-8');
}

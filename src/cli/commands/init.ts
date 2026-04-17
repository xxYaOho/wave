import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Command } from 'commander';
import { ExitCode } from '../../types/index.ts';
import { logger } from '../../utils/logger.ts';

const TEMPLATE_THEMEFILE = `THEME example
RESOURCE palette tailwindcss4
RESOURCE dimension wave

PARAMETER output ./build
PARAMETER platform json,css
PARAMETER colorSpace oklch
`;

const TEMPLATE_MAIN_YAML = `theme:
  color:
    $type: color
    primary:
      $value: "{tailwindcss4.color.indigo.600}"
`;

const TEMPLATE_MANUAL_MD = `# Wave Theme 使用手册

## themefile 配置

### 基本结构

\`\`\`
THEME <主题名称>
RESOURCE palette <调色板名称>
RESOURCE dimension <尺寸系统名称>

PARAMETER output <输出目录>
PARAMETER platform <输出格式>
PARAMETER colorSpace <颜色空间>
\`\`\`

### 参数说明

#### THEME
- **说明**: 定义主题名称
- **示例**: \`THEME my-brand\`

#### RESOURCE palette
- **说明**: 指定调色板资源
- **可选值**: \`tailwindcss4\`, \`leonardo\`, 或自定义路径

#### RESOURCE dimension
- **说明**: 指定尺寸系统资源
- **可选值**: \`wave\` 或自定义路径

#### PARAMETER output
- **说明**: 指定生成文件的输出目录
- **示例**: \`PARAMETER output ./dist\`
- **默认值**: \`./<THEME>\`

#### PARAMETER platform
- **说明**: 指定输出平台格式，多个格式用逗号分隔
- **可选值**: \`json\`, \`jsonc\`, \`css\`
- **示例**: \`PARAMETER platform json,css\`
- **默认值**: \`json\`

#### PARAMETER colorSpace
- **说明**: 指定颜色输出空间
- **可选值**: \`hex\`, \`oklch\`, \`srgb\`, \`hsl\`
- **示例**: \`PARAMETER colorSpace oklch\`
- **默认值**: \`hex\`

---

## main.yaml 编写

### 基本结构

\`\`\`yaml
theme:
  color:
    $type: color
    primary:
      $value: "{tailwindcss4.color.indigo.600}"

  dimension:
    $type: dimension
    spacing:
      sm:
        $value: "{wave.spacing.1}"
\`\`\`

### 引用语法

使用花括号 \`{namespace.path.to.token}\` 引用 RESOURCE 定义的资源。

---

## 高级功能

### Night 模式

创建 \`main@night.yaml\` 文件定义夜间模式颜色。

### Variants（变体主题）

在同一目录下创建额外的 YAML 文件作为变体主题。

---

## 示例

\`\`\`bash
# 生成主题
wave create my-brand

# 指定 themefile 路径
wave create -f ./path/to/themefile
\`\`\`
`;

export const initCommand = new Command('init')
	.description('Initialize a new theme workspace')
	.action(async () => {
		const cwd = process.cwd();
		const themefilePath = path.join(cwd, 'themefile');

		try {
			await fs.access(themefilePath);
			logger.error('A themefile already exists in the current directory');
			process.exitCode = ExitCode.GENERAL_ERROR;
			return;
		} catch {
			// File doesn't exist, proceed
		}

		const files = [
			{ name: 'themefile', content: TEMPLATE_THEMEFILE },
			{ name: 'main.yaml', content: TEMPLATE_MAIN_YAML },
			{ name: 'manual.md', content: TEMPLATE_MANUAL_MD },
		];

		try {
			for (const { name, content } of files) {
				const destPath = path.join(cwd, name);
				await fs.writeFile(destPath, content, 'utf-8');
				logger.success(`Created: ${name}`);
			}

			logger.info('');
			logger.success('Theme template initialized successfully!');
			logger.info('');
			logger.info('Next steps:');
			logger.info('  1. Edit themefile to configure your theme');
			logger.info('  2. Edit main.yaml to define your tokens');
			logger.info('  3. See manual.md for detailed usage');
			logger.info('  4. Run "wave create" to generate tokens');
		} catch (err) {
			logger.error(
				`Failed to initialize template: ${err instanceof Error ? err.message : String(err)}`,
			);
			process.exitCode = ExitCode.GENERAL_ERROR;
		}
	});

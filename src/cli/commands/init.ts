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

export function createInitCommand(name = 'init'): Command {
	return new Command(name)
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
				logger.info('  3. See MANUAL.md for detailed usage');
				logger.info('  4. Run "wave dt" to generate tokens');
			} catch (err) {
				logger.error(
					`Failed to initialize template: ${err instanceof Error ? err.message : String(err)}`,
				);
				process.exitCode = ExitCode.GENERAL_ERROR;
			}
		});
}

export const initCommand = createInitCommand('init');

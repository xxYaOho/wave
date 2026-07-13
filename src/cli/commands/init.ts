import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Command } from 'commander';
import { ExitCode } from '../../types/index.ts';
import { logger } from '../../utils/logger.ts';

const TEMPLATE_THEMEFILE = `THEME example
RESOURCE palette tailwindcss
RESOURCE dimension wave

PARAMETER output ./build
PARAMETER platform json,css
PARAMETER colorSpace oklch
`;

const TEMPLATE_MAIN_YAML = `$schema: "https://www.designtokens.org/tr/2025.10/format/"

$config:
  theme: example
  resource:
    palette:
      - tailwindcss
    dimension:
      - wave
  parameter:
    outputDir: ./dist
    platform:
      - json
      - css
      - sketch
    filterLayer: 1

theme:
  color:
    $type: color
    primary:
      $value: "{TOKEN}"
    on-primary:
      $value: "{TOKEN}"
    outline:
      ring:
        $value: "{TOKEN}"
  state:
    hover:
      $type: number
      $value: "{TOKEN}"
      $extensions:
        sketch:
          property:
            opacity: true
  radius:
    md:
      $type: dimension
      $value: "{TOKEN}"
  border:
    width:
      medium:
        $type: dimension
        $value: "{TOKEN}"
    outline:
      focus:
        $type: border
        $value:
          color: "{TOKEN}"
          width: "{TOKEN}"
          style: solid
        $extensions:
          outline:
            offset: "{TOKEN}"
  shadow:
    elevation:
      low:
        $type: shadow
        $value:
          color: "{TOKEN}"
          offsetX: "{TOKEN}"
          offsetY: "{TOKEN}"
          blur: "{TOKEN}"
          spread: "{TOKEN}"
  gradient:
    mask:
      soft:
        $type: gradient
        $value:
          - color: "{TOKEN}"
            position: "{TOKEN}"
          - color: "{TOKEN}"
            position: "{TOKEN}"
  font:
    heading:
      h1:
        $type: typography
        $value:
          fontFamily: "{TOKEN}"
          fontSize:
            value: "{TOKEN}"
            unit: px
          fontWeight: "{TOKEN}"
          lineHeight:
            value: "{TOKEN}"
            unit: px
          letterSpacing: "{TOKEN}"

doctor:
  wcagPairs:
    primary:
      foreground: "{TOKEN}"
      background: "{TOKEN}"
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
				logger.info(
					'  1. Edit main.yaml to define your tokens and output config',
				);
				logger.info(
					'  2. Replace {TOKEN} placeholders with real values or references',
				);
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

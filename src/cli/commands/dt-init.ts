import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Command } from 'commander';
import { ExitCode } from '../../types/index.ts';
import { logger } from '../../utils/logger.ts';

const TEMPLATE_MAIN_YAML = `$schema: "https://www.designtokens.org/tr/2025.10/format/"

$config:
  theme: example
  resource:
    palette: [tailwindcss]
    dimension: [wave]
  parameter:
    outputDir: ./dist
    platform: [json, css, sketch]
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
        platform:
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
          platform:
            sketch:
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
    $type: typography
    $extensions:
      typography:
        baseFontSize: "{theme.font.base-size}"
        fontFamily: "{TOKEN}"
        fontSize: { value: 14, unit: px }
        fontWeight: 400
        lineHeight: 1.5
        letterSpacing: 0
    base-size:
      $type: number
      $value: 14
    heading:
      h1:
        $type: typography
        $value:
          fontFamily: "{TOKEN}"
          fontSize: { value: "{TOKEN}", unit: px }
          fontWeight: 700
          lineHeight: 1.2
          letterSpacing: 0

doctor:
  wcagPairs:
    primary:
      foreground: "{TOKEN}"
      background: "{TOKEN}"
`;

export function createDesignTokenInitCommand(name = 'init'): Command {
	return new Command(name)
		.description('Initialize a new design-token workspace')
		.action(async () => {
			const mainPath = path.join(process.cwd(), 'main.yaml');
			try {
				await fs.access(mainPath);
				logger.error('A main.yaml already exists in the current directory');
				process.exitCode = ExitCode.GENERAL_ERROR;
				return;
			} catch {
				// The workspace entry is available to create.
			}

			try {
				await fs.writeFile(mainPath, TEMPLATE_MAIN_YAML, 'utf8');
				logger.success('Created: main.yaml');
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
			} catch (error) {
				logger.error(
					`Failed to initialize template: ${error instanceof Error ? error.message : String(error)}`,
				);
				process.exitCode = ExitCode.GENERAL_ERROR;
			}
		});
}

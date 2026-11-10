import * as path from 'node:path';
import { Command } from 'commander';
import {
	planSourceOutput,
	writeSourceOutput,
} from '../../core/pipeline/source-output.ts';
import { ExitCode } from '../../types/index.ts';
import { logger } from '../../utils/logger.ts';
import { addOutputOption } from '../options.ts';

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

export interface TokenInitOptions {
	output?: string;
	dryRun?: boolean;
	force?: boolean;
	manual?: boolean;
}

export function addTokenInitOptions(command: Command): Command {
	addOutputOption(command, 'Target token workspace directory');
	return command
		.option('--dry-run', 'Show the complete creation plan without writing')
		.option('--force', 'Allow replacing the planned main.yaml file');
}

export async function runDesignTokenInit(
	options: TokenInitOptions = {},
): Promise<void> {
	const mainPath = path.resolve(options.output ?? process.cwd(), 'main.yaml');
	try {
		const plan = await planSourceOutput(mainPath, options.force);
		if (!options.dryRun)
			await writeSourceOutput(mainPath, TEMPLATE_MAIN_YAML, options.force);
		logger.success(
			`${options.dryRun ? `Dry run: would ${plan.overwrites ? 'overwrite' : 'create'}` : 'Created'}: ${mainPath}`,
		);
		logger.info('');
		logger.success(
			options.dryRun
				? 'Workspace creation plan ready.'
				: 'Theme template initialized successfully!',
		);
		logger.info('');
		logger.info('Next steps:');
		logger.info(
			`  1. Edit ${mainPath} to define your tokens and output config`,
		);
		logger.info(
			'  2. Replace {TOKEN} placeholders with real values or references',
		);
		logger.info('  3. See MANUAL.md for detailed usage');
		logger.info(
			`  4. Run wave token build -f ${JSON.stringify(mainPath)} to generate tokens`,
		);
	} catch (error) {
		logger.error(
			`Failed to initialize template: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exitCode = ExitCode.GENERAL_ERROR;
	}
}

export function createDesignTokenInitCommand(name = 'init'): Command {
	return addTokenInitOptions(
		new Command(name).description('Initialize a new design-token workspace'),
	).action(runDesignTokenInit);
}

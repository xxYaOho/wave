import { Command } from 'commander';
import { VERSION } from '../config/index.ts';
import { compressCommand } from './commands/compress.ts';
import { doctorCommand } from './commands/doctor.ts';
import { tokenCommand } from './commands/dt.ts';
import { installCommand } from './commands/install.ts';
import { manualCommand } from './commands/manual.ts';
import { motionCommand } from './commands/motion.ts';
import { workspaceCommand } from './commands/workspace.ts';
import { addManualOption } from './options.ts';

export type CommandCategory = 'common' | 'workspace' | 'toolchain' | 'other';

export interface ManualMapping {
	source: 'manual-data';
	href: string;
	inherit?: boolean;
}

export interface CommandDefinition {
	name: string;
	category: CommandCategory;
	command: Command;
	help: string;
	manual: ManualMapping;
	children: CommandDefinition[];
}

const ROOT_HELP = `Wave CLI
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  Usage:
    wave <command> [options]

  Common commands:
    token              Build and maintain design tokens
    compress           Compress PNG, JPG, SVG, and GIF assets
    motion             Build GIF/APNG from PNG frames

  Workspace:
    workspace          Create a local design project workspace

  Toolchain:
    doctor             Check local Wave environment and tools
    install            Show or run recommended tool installation

  Other:
    manual         Open the local Wave manual
    version             Show version number

  Options:
    -m, --manual       Print Markdown usage for this command
    -h, --help          Show help
    --version          Show version number

  Run wave <command> --help for command details.`;

const STATIC_HELP: Record<string, string> = {
	token: `Wave Token
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  Usage:
    wave token [options]
    wave token <command> [options]

  Commands:
    build               Build design token output (default)
    new                 Create a token workspace
    doctor              Check token workspace health
    wcag                Check color contrast
    ids                 Maintain token and document identities
    migrate             Migrate token source documents

  Resources:
    show                Browse built-in resources
    update              Update local token resources
    status              Show local resource cache status

  Options:
    -f, --file <path>   Source main.yaml (defaults to ./main.yaml)
    -o, --output <path> Output directory
    -m, --manual        Print Markdown usage for this command
    -h, --help          Show help`,
	'token new': `Wave Token New
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  Usage:
    wave token new [options]

  Default action:
    Create a token workspace in the current directory.

  Commands:
    profile             Create a profile from a registered base
    night               Generate a Night overlay from a Day source document

  Options:
    -m, --manual        Print Markdown usage for this command
    -h, --help          Show help

  Creation options:
    -o, --output <path> Target directory (profile/night: output file)
    --dry-run           Show the complete plan without writing
    --force             Allow overwriting the planned target file`,
	'token migrate': `Wave Token Migrate
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  Usage:
    wave token migrate <migration> [options]

  Migrations:
    extensions          Rename legacy $extensions sketch fields

  Options:
    -m, --manual        Print Markdown usage for this command
    -h, --help          Show help`,
	compress: `Wave Compress
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  Usage:
    wave compress [options]
    wave compress <command> [options]

  Commands:
    doctor          Check compress toolchain health
    install         Show or run compress tool installation

  Options:
    -f, --file <path>    File or directory to compress. Default: .
    --type <type>        Limit file type. Repeatable: png, jpg, svg, gif
    --recursive          Scan nested folders
    -q, --quality <n>    Use lossy quality mode, 1-100
    -o, --output <path>  Output directory
    --dry-run            Preview only, no prompt, no write
    --yes                Write without confirmation
    --force              Allow overwriting existing output files
    --icon               Clean SVG icon colors for CSS styling
    --json               Output JSON only, no prompt
    -h, --help           Show help

  For more help on a command:
    wave compress <command> --help`,
	motion: `
Wave Motion
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  Usage:
    wave motion [options]

  Commands:
    doctor          Check motion tools and optional PNG frame directory
    install         Show or run motion tool installation

  Options:
    -f, --file <path>    PNG frame directory
    --fps <n>            Frames per second. Default: 24
    --quality <n>        Encoder quality, 1-100. Default: 80
    --loop <mode>        forever or once. Default: forever
    --format <format>    Output format: gif or apng
    -o, --output <path>  Output file path
    --dry-run            Show plan only, no write
    --force              Allow overwriting existing output file
    -h, --help           Show help

  For more help on a command:
    wave motion <command> --help
`,
	workspace: `Wave Workspace
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  Usage:
    wave workspace

  Config:
    ~/.config/wave/workspace.yaml
    WAVE_WORKSPACE_CONFIG=/tmp/workspace.yaml

  Options:
    -o, --output <path>  Final target directory
    --dry-run            Show the plan without writing
    --yes                Write without confirmation
    --force              Update generated files in an existing directory
    -h, --help      Show help

  For more help on a command:
    wave workspace --help`,
	manual: `Wave Manual
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  Usage:
    wave manual [options]

  Options:
    --port <port>      Port to bind. Default: 4567
    --host <host>      Host to bind. Default: 127.0.0.1
    --no-open          Do not open the browser automatically
    -h, --help         Show help`,
	'token new night': `Wave Night
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  Generate a Night overlay draft from a Day theme via pure color-rules.

  Usage:
    wave token new night [options]

  Options:
    -f, --file <path>    Path to a Day main/profile source document
    -o, --output <path> Output YAML file (default: beside Day)
    --dry-run           Show the complete plan without writing
    --force             Allow overwriting the planned overlay
    --scene <name>       Lighting scene: moon | night-light | night | candle-light | sunset
                         Default: night (or $config.night.scene)
    --luminance <n>      Primary Night lightness dial 0..1 (wins over --luminance-ev)
                         → accentMain HCT tone = n×100 (0.9 ≈ near white)
                         Default: 0.7 (or $config.night.luminance)
    --luminance-ev <lv>  Named luminance: minimal | low | medium | high | max
                         → 0.5 / 0.6 / 0.7 / 0.75 / 0.85
    -m, --manual        Print Markdown usage for this command
    -h, --help           Show help

  Output:
    Writes <stem>@night.yaml beside the theme file (e.g. main@night.yaml).
    Sketch identity: same themeId/baseId as Day; meta.mode=night.

  Priority:
    --luminance > --luminance-ev > $config.night > defaults (scene=night, luminance=0.7)
    Legacy --chroma / --chroma-ev CLI aliases are not accepted.

  Note:
    luminance is Primary Night lightness, NOT HCT chroma.
`,
};

const MANUAL_HREFS: Record<string, string> = {
	token: '/design-token',
	'token build': '/design-token',
	'token new': '/design-token/create',
	'token new profile': '/design-token/create',
	'token new night': '/design-token/night',
	'token doctor': '/design-token/doctor',
	'token wcag': '/design-token/wcag',
	'token ids': '/design-token/ids',
	'token migrate': '/design-token/migrate',
	'token migrate extensions': '/design-token/migrate',
	'token show': '/resources',
	'token update': '/resources',
	'token status': '/resources',
	compress: '/compress',
	'compress doctor': '/compress',
	'compress install': '/compress',
	motion: '/motion',
	'motion doctor': '/motion',
	'motion install': '/motion',
	workspace: '/workspace',
	manual: '/quickstart',
	doctor: '/toolchain',
	install: '/toolchain',
	version: '/quickstart',
};

export const versionCommand = new Command('version')
	.description('Show version number')
	.action(() => {
		console.log(VERSION);
	});

const topLevelCommands: Array<{
	category: CommandCategory;
	command: Command;
}> = [
	{ category: 'common', command: tokenCommand },
	{ category: 'common', command: compressCommand },
	{ category: 'common', command: motionCommand },
	{ category: 'workspace', command: workspaceCommand },
	{ category: 'workspace', command: manualCommand },
	{ category: 'toolchain', command: doctorCommand },
	{ category: 'toolchain', command: installCommand },
	{ category: 'other', command: versionCommand },
];

function addManualOptionsRecursively(command: Command): void {
	addManualOption(command);
	for (const child of command.commands) addManualOptionsRecursively(child);
}

for (const entry of topLevelCommands)
	addManualOptionsRecursively(entry.command);

function commandPath(command: Command): string[] {
	const path: string[] = [];
	let current: Command | undefined = command;
	while (current) {
		path.unshift(current.name());
		current = current.parent ?? undefined;
	}
	return path;
}

function defaultHelp(command: Command): string {
	return command.helpInformation().replace(/^Usage: /, 'Usage: wave ');
}

function mappingForPath(path: string[]): ManualMapping {
	const key = path.join(' ');
	return {
		source: 'manual-data',
		href: MANUAL_HREFS[key] ?? '/command-index',
		inherit: path.length > 1 && MANUAL_HREFS[key] === undefined,
	};
}

function createDefinition(
	command: Command,
	category: CommandCategory,
): CommandDefinition {
	const path = commandPath(command);
	const key = path.join(' ');
	return {
		name: command.name(),
		category,
		command,
		help: STATIC_HELP[key] ?? defaultHelp(command),
		manual: mappingForPath(path),
		children: command.commands.map((child) =>
			createDefinition(child, category),
		),
	};
}

export const commandRegistry: CommandDefinition[] = topLevelCommands.map(
	({ category, command }) => createDefinition(command, category),
);

export function findCommandDefinition(
	path: readonly string[],
): CommandDefinition | undefined {
	let definitions = commandRegistry;
	let current: CommandDefinition | undefined;
	for (const name of path) {
		current = definitions.find((definition) => definition.name === name);
		if (!current) return undefined;
		definitions = current.children;
	}
	return current;
}

export function commandHelp(path: readonly string[]): string | undefined {
	return findCommandDefinition(path)?.help;
}

export function commandManual(
	path: readonly string[],
): ManualMapping | undefined {
	const definition = findCommandDefinition(path);
	if (!definition) return undefined;
	if (!definition.manual.inherit) return definition.manual;
	return commandManual(path.slice(0, -1)) ?? definition.manual;
}

function applyHelp(definition: CommandDefinition): void {
	definition.command.configureHelp({ formatHelp: () => definition.help });
	for (const child of definition.children) applyHelp(child);
}

export function registerCommands(program: Command): void {
	for (const definition of commandRegistry) {
		applyHelp(definition);
		program.addCommand(definition.command);
	}
}

export { ROOT_HELP };

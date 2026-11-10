import type { Command } from 'commander';

export const TOP_LEVEL_HELP = `Wave CLI
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  Usage:
    wave <command> [options]

  Common commands:
    token              Build and maintain design tokens
    compress           Compress PNG, JPG, SVG, and GIF assets
    motion             Build GIF/APNG from PNG frames
    workspace          Create a local design project workspace

  Workspace:
    manual             Open the local Wave manual

  Toolchain:
    doctor             Check local Wave environment and tools
    install            Show or run recommended tool installation

  Other:
    version             Show version number
    --version           Show version number
    -h, --help          Show help

  Run wave <command> --help for command details.`;

export const TOKEN_HELP = `Wave Token
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
    -h, --help          Show help`;

export const TOKEN_NEW_HELP = `Wave Token New
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  Usage:
    wave token new [options]

  Default action:
    Create a token workspace in the current directory.

  Options:
    -m, --manual        Print Markdown usage for this command
    -h, --help          Show help`;

export const TOKEN_MIGRATE_HELP = `Wave Token Migrate
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  Usage:
    wave token migrate <migration> [options]

  Migrations:
    extensions          Rename legacy $extensions sketch fields

  Options:
    -m, --manual        Print Markdown usage for this command
    -h, --help          Show help`;

export function configureStaticHelp(command: Command, help: string): Command {
	return command
		.helpOption('-h, --help', 'Show help')
		.addHelpCommand(false)
		.configureHelp({ formatHelp: () => help });
}

export function renderManual(path: string[]): void {
	const commandPath = path.length > 0 ? path.join(' ') : 'wave';
	console.log(`# ${commandPath}\n\n`);
	console.log(
		`Usage: \`wave ${commandPath === 'wave' ? '' : `${commandPath} `}[options]\``,
	);
	console.log('\nThis command reference is available in the Wave manual.');
}

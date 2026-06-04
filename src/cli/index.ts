import { Command, CommanderError } from 'commander';
import { VERSION } from '../config/index.ts';
import { ExitCode } from '../types/index.ts';
import { registerCommands } from './registry.ts';

const TOP_LEVEL_HELP = `Wave CLI
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  Usage:
    wave <command> [options]

  Commands:
    design-token   Build and inspect design tokens
    compress       Compress PNG, JPG, SVG, and GIF assets
    motion         Build GIF/APNG from PNG frames
    workspace      Create local design project workspaces
    doctor         Check local Wave environment and tools
    install        Show or run recommended tool installation

  Alias:
    dt             Alias of design-token
    mg             Alias of motion

  Common options:
    -f, --file <path>    Input file or directory
    -o, --out <path>     Output path
    --dry-run            Preview only, no prompt, no write
    --yes                Write without confirmation
    --force              Allow overwriting existing output files
    -h, --help           Show help

  For more help on a command:
    wave <command> --help`;

const DT_UPDATE_HELP = `Wave Design Token Resource Update
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  Usage:
    wave dt update [name] [options]

  Names:
    tailwindcss      Update Tailwind CSS resource cache
    leonardo         Generate Leonardo light/dark resource cache

  Options:
    --version <version>    Tailwind CSS version: latest, 3, or 4
    -h, --help             Show help`;

const program = new Command();

const DESIGN_TOKEN_COMMANDS = new Set(['design-token', 'dt']);
const DESIGN_TOKEN_SUBCOMMANDS = new Set([
	'build',
	'doctor',
	'wcag',
	'show',
	'init',
	'update',
	'status',
]);
const DESIGN_TOKEN_MODULE_FLAGS = new Set(['--help', '-h']);
const COMPRESS_SUBCOMMANDS = new Set(['run', 'doctor', 'install', 'help']);
const COMPRESS_MODULE_FLAGS = new Set(['--help', '-h']);
const WORKSPACE_SUBCOMMANDS = new Set(['create', 'help']);
const WORKSPACE_MODULE_FLAGS = new Set(['--help', '-h']);

function isTopLevelHelp(argv: string[]): boolean {
	const arg = argv[2];
	return (
		argv.length <= 2 ||
		arg === '-h' ||
		arg === '--help' ||
		(arg === 'help' && argv.length === 3)
	);
}

function isDesignTokenUpdateHelp(argv: string[]): boolean {
	return (
		DESIGN_TOKEN_COMMANDS.has(argv[2] ?? '') &&
		argv[3] === 'update' &&
		(argv.includes('--help') || argv.includes('-h'))
	);
}

function normalizeArgv(argv: string[]): string[] {
	if (argv[2] === 'compress') {
		const firstCompressArg = argv[3];
		if (firstCompressArg && COMPRESS_MODULE_FLAGS.has(firstCompressArg)) {
			return argv;
		}
		if (
			!firstCompressArg ||
			firstCompressArg.startsWith('-') ||
			!COMPRESS_SUBCOMMANDS.has(firstCompressArg)
		) {
			return [...argv.slice(0, 3), 'run', ...argv.slice(3)];
		}
		return argv;
	}
	if (argv[2] === 'workspace') {
		const firstWorkspaceArg = argv[3];
		if (firstWorkspaceArg && WORKSPACE_MODULE_FLAGS.has(firstWorkspaceArg)) {
			return argv;
		}
		if (
			!firstWorkspaceArg ||
			firstWorkspaceArg.startsWith('-') ||
			!WORKSPACE_SUBCOMMANDS.has(firstWorkspaceArg)
		) {
			return [...argv.slice(0, 3), 'create', ...argv.slice(3)];
		}
		return argv;
	}
	if (!DESIGN_TOKEN_COMMANDS.has(argv[2] ?? '')) return argv;
	const firstTokenArg = argv[3];
	if (firstTokenArg === 'update') {
		return argv.map((arg, index) =>
			index > 3 && arg === '--version' ? '--tailwind-version' : arg,
		);
	}
	if (firstTokenArg && DESIGN_TOKEN_MODULE_FLAGS.has(firstTokenArg)) {
		return argv;
	}
	if (
		!firstTokenArg ||
		firstTokenArg.startsWith('-') ||
		!DESIGN_TOKEN_SUBCOMMANDS.has(firstTokenArg)
	) {
		return [...argv.slice(0, 3), 'build', ...argv.slice(3)];
	}
	return argv;
}

program
	.name('wave')
	.description('Wave CLI')
	.version(VERSION, '--version', 'Show version number')
	.helpOption(false)
	.addHelpCommand(false)
	.exitOverride((err) => {
		if (err instanceof CommanderError) {
			if (err.code === 'commander.unknownCommand') {
				process.exitCode = ExitCode.INVALID_COMMAND;
				return;
			}
			if (err.code === 'commander.version') {
				process.exitCode = ExitCode.SUCCESS;
				return;
			}
		}
		process.exitCode = ExitCode.GENERAL_ERROR;
	});

program
	.command('version')
	.description('Show version number')
	.action(() => {
		console.log(VERSION);
	});

registerCommands(program);

// Legacy command migration hints
program
	.command('theme')
	.description('(deprecated) Use "wave create" instead')
	.action(() => {
		console.error('Command "wave theme" has been renamed to "wave create".');
		console.error('  wave create          Generate design token output');
		console.error('  wave create --help   Show available options');
		process.exitCode = ExitCode.INVALID_COMMAND;
	});

program
	.command('list')
	.description('(deprecated) Use "wave show" instead')
	.action(() => {
		console.error('Command "wave list" has been merged into "wave show".');
		console.error('  wave show            Browse built-in resources');
		console.error('  wave show --help     Show available options');
		process.exitCode = ExitCode.INVALID_COMMAND;
	});

if (isTopLevelHelp(process.argv)) {
	console.log(TOP_LEVEL_HELP);
	process.exitCode = ExitCode.SUCCESS;
} else if (isDesignTokenUpdateHelp(process.argv)) {
	console.log(DT_UPDATE_HELP);
	process.exitCode = ExitCode.SUCCESS;
} else {
	program.parse(normalizeArgv(process.argv));
}

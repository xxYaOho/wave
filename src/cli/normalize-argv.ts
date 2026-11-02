/**
 * Argv sugar for `wave dt` / `wave design-token` before Commander parse.
 *
 * Shape: `wave dt [file] [--flag…]` defaults to build. Explicit shortcuts:
 *   --ids-write → `dt ids --write`
 *   --ids       → `dt ids`
 *   --build     → `dt build` (same as default; strips the flag)
 *
 * When a real subcommand is already present, argv is left alone (except the
 * legacy `update --version` → `--tailwind-version` remap).
 */

export const DESIGN_TOKEN_COMMANDS = new Set(['design-token', 'dt']);

export const DESIGN_TOKEN_SUBCOMMANDS = new Set([
	'build',
	'doctor',
	'wcag',
	'show',
	'init',
	'new-profile',
	'update',
	'status',
	'ids',
	'migrate-extensions',
]);

const DESIGN_TOKEN_MODULE_FLAGS = new Set(['--help', '-h']);
const COMPRESS_SUBCOMMANDS = new Set(['run', 'doctor', 'install', 'help']);
const COMPRESS_MODULE_FLAGS = new Set(['--help', '-h']);
const WORKSPACE_SUBCOMMANDS = new Set(['create', 'help']);
const WORKSPACE_MODULE_FLAGS = new Set(['--help', '-h']);

type DtSugar = 'ids-write' | 'ids' | 'build' | null;

function takeDtSugar(args: string[]): { sugar: DtSugar; rest: string[] } {
	let sugar: DtSugar = null;
	const rest: string[] = [];
	for (const arg of args) {
		if (arg === '--ids-write') {
			if (sugar === null || sugar === 'ids' || sugar === 'build') {
				sugar = 'ids-write';
			}
			continue;
		}
		if (arg === '--ids') {
			if (sugar === null || sugar === 'build') sugar = 'ids';
			continue;
		}
		if (arg === '--build') {
			if (sugar === null) sugar = 'build';
			continue;
		}
		rest.push(arg);
	}
	return { sugar, rest };
}

function normalizeDesignTokenArgv(argv: string[]): string[] {
	const firstTokenArg = argv[3];
	if (firstTokenArg === 'update') {
		return argv.map((arg, index) =>
			index > 3 && arg === '--version' ? '--tailwind-version' : arg,
		);
	}
	if (firstTokenArg && DESIGN_TOKEN_MODULE_FLAGS.has(firstTokenArg)) {
		return argv;
	}
	if (firstTokenArg && DESIGN_TOKEN_SUBCOMMANDS.has(firstTokenArg)) {
		return argv;
	}

	const { sugar, rest } = takeDtSugar(argv.slice(3));
	if (sugar === 'ids-write') {
		const withWrite = rest.includes('--write') ? rest : ['--write', ...rest];
		return [...argv.slice(0, 3), 'ids', ...withWrite];
	}
	if (sugar === 'ids') {
		return [...argv.slice(0, 3), 'ids', ...rest];
	}
	// Default and explicit --build both land on build.
	return [...argv.slice(0, 3), 'build', ...rest];
}

export function normalizeWaveArgv(argv: string[]): string[] {
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
	return normalizeDesignTokenArgv(argv);
}

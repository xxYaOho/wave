import * as path from 'node:path';

const MANUAL_MISSING_MESSAGE =
	'Manual app is not built. Run "pnpm manual:build" or "pnpm build".';
const PROJECT_ROOT_FROM_SOURCE = path.resolve(import.meta.dir, '../../..');

async function hasManualIndex(appDir: string): Promise<boolean> {
	return Bun.file(path.join(appDir, 'index.html')).exists();
}

export async function resolveManualAppDir(): Promise<string> {
	const fromCwd = path.resolve(process.cwd(), 'dist/manual-app');
	if (await hasManualIndex(fromCwd)) return fromCwd;

	const fromSourceRoot = path.join(PROJECT_ROOT_FROM_SOURCE, 'dist/manual-app');
	if (await hasManualIndex(fromSourceRoot)) return fromSourceRoot;

	const executableDir = path.dirname(process.execPath);
	const fromExecutable = path.join(executableDir, 'manual-app');
	if (await hasManualIndex(fromExecutable)) return fromExecutable;

	throw new Error(MANUAL_MISSING_MESSAGE);
}

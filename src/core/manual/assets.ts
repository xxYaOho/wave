import * as path from 'node:path';

const MANUAL_MISSING_MESSAGE =
	'Manual app is not built. Run "pnpm manual:build" or "pnpm build".';

async function hasManualIndex(appDir: string): Promise<boolean> {
	return Bun.file(path.join(appDir, 'index.html')).exists();
}

export async function resolveManualAppDir(): Promise<string> {
	const fromCwd = path.resolve(process.cwd(), 'dist/manual-app');
	if (await hasManualIndex(fromCwd)) return fromCwd;

	const executableDir = path.dirname(process.execPath);
	const fromExecutable = path.join(executableDir, 'manual-app');
	if (await hasManualIndex(fromExecutable)) return fromExecutable;

	throw new Error(MANUAL_MISSING_MESSAGE);
}

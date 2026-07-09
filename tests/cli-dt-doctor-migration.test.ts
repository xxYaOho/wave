import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

const rootDir = path.resolve(import.meta.dir, '..');
const cliEntry = path.join(rootDir, 'src', 'index.ts');
const tempDirs: string[] = [];

async function runWave(
	args: string[],
	options: { cwd?: string; env?: Record<string, string> } = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(['bun', 'run', cliEntry, ...args], {
		cwd: options.cwd ?? rootDir,
		env: { ...process.env, ...options.env },
		stdout: 'pipe',
		stderr: 'pipe',
	});

	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;

	return { stdout, stderr, exitCode };
}

async function makeTheme(source: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-doctor-theme-'));
	await fs.writeFile(path.join(dir, 'main.yaml'), source);
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	for (const dir of tempDirs.splice(0)) {
		await fs.rm(dir, { recursive: true, force: true });
	}
});

describe('dt doctor migration guidance', () => {
	test('defaults to ./main.yaml when present', async () => {
		const dir = await makeTheme(`
$schema: "https://www.designtokens.org/tr/2025.10/format/"
$config:
  theme: doctor-default
  resource:
    palette: [tailwindcss]
    dimension: [wave]
theme:
  color:
    primary:
      $type: color
      $value: "{tailwindcss.color.blue.600}"
`);

		const { exitCode, stdout } = await runWave(['dt', 'doctor'], { cwd: dir });

		expect(exitCode).toBe(0);
		expect(stdout).toContain('Config File: Valid (doctor-default)');
		expect(stdout).not.toContain('No themefile specified');
	});

	test('top-level doctor does not default to ./main.yaml', async () => {
		const dir = await makeTheme(`
$schema: "https://www.designtokens.org/tr/2025.10/format/"
$config:
  theme: top-level-doctor
  resource:
    palette: [tailwindcss]
    dimension: [wave]
theme:
  color:
    primary:
      $type: color
      $value: "{tailwindcss.color.blue.600}"
`);

		const { exitCode, stdout } = await runWave(['doctor'], { cwd: dir });

		expect(exitCode).toBe(0);
		expect(stdout).toContain('Config File: No themefile specified');
		expect(stdout).not.toContain('Config File: Valid (top-level-doctor)');
	});

	test('allows dimension resource references when public theme.dimension is absent', async () => {
		const dir = await makeTheme(`
$schema: "https://www.designtokens.org/tr/2025.10/format/"
$config:
  theme: doctor-dimension-legacy
  resource:
    palette: [tailwindcss]
    dimension: [wave]
theme:
  color:
    overlay:
      $type: color
      $value:
        colorSpace: srgb
        components: [0, 0, 0]
        alpha: "{wave.dimension.alpha.200}"
`);

		const { exitCode, stdout } = await runWave(['dt', 'doctor'], { cwd: dir });

		expect(exitCode).toBe(0);
		expect(stdout).toContain('Config File: Valid (doctor-dimension-legacy)');
		expect(stdout).not.toContain(
			'theme.dimension is no longer a public output root',
		);
	});

	test('prints migration guidance even when resource resolution fails', async () => {
		const dir = await makeTheme(`
$schema: "https://www.designtokens.org/tr/2025.10/format/"
$config:
  theme: doctor-resource-failure
  resource:
    palette: [tailwindcss]
    dimension:
      - /resources/dimensions/wave.yaml
theme:
  color:
    overlay:
      $type: color
      $value:
        colorSpace: srgb
        components: [0, 0, 0]
        alpha: "{wave.dimension.alpha.200}"
`);

		const { exitCode, stdout } = await runWave(['dt', 'doctor'], { cwd: dir });

		expect(exitCode).toBe(1);
		expect(stdout).toContain('Resource not found');
		expect(stdout).toContain(
			'theme.dimension is no longer a public output root',
		);
		expect(stdout).toContain('$config.resource.dimension');
		expect(stdout).toContain('{wave.dimension.*}');
		expect(stdout).toContain('theme.color.overlay.$value.alpha');
	});
});

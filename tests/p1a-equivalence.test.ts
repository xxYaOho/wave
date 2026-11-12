import { expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { generateTheme } from '../src/core/pipeline/theme-service.ts';

async function outputBytes(directory: string): Promise<Record<string, string>> {
	const files: Record<string, string> = {};
	async function walk(current: string): Promise<void> {
		for (const entry of await fs.readdir(current, { withFileTypes: true })) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) await walk(full);
			else
				files[path.relative(directory, full)] = await fs.readFile(
					full,
					'base64',
				);
		}
	}
	await walk(directory);
	return files;
}

async function runScenario(
	workspacePath: string,
	outputDir: string,
	generateOptions: { night: boolean; profiles?: 'all' },
): Promise<Record<string, string>> {
	const result = await generateTheme({
		workspacePath,
		cliOutput: outputDir,
		generateOptions,
	});
	expect(result.ok, result.ok ? '' : result.message).toBe(true);
	return outputBytes(outputDir);
}

test('P1a three build scenarios remain byte-equivalent across cache instances', async () => {
	const root = await fs.mkdtemp(
		path.join(os.tmpdir(), 'wave-p1a-equivalence-'),
	);
	try {
		const workspace = path.join(root, 'workspace');
		await fs.mkdir(workspace, { recursive: true });
		await fs.writeFile(
			path.join(workspace, 'main.yaml'),
			`$id: p1a-base
$config:
  theme: p1a
  parameter: { platform: [json] }
theme:
  color:
    primary:
      $type: color
      $value: "#336699"
  state:
    active:
      $type: color
      $value: "#ffffff"
`,
			'utf8',
		);
		await fs.writeFile(
			path.join(workspace, 'main@night.yaml'),
			`theme:
  color:
    primary:
      $value: "#112233"
`,
			'utf8',
		);
		await fs.mkdir(path.join(workspace, 'profiles'), { recursive: true });
		await fs.writeFile(
			path.join(workspace, 'profiles', 'alternate.yaml'),
			'$config: { base: p1a-base }\n',
			'utf8',
		);

		for (const [name, options] of [
			['single', { night: false }],
			['multi', { profiles: 'all' as const, night: false }],
			['night', { profiles: 'all' as const, night: true }],
		] as const) {
			const first = await runScenario(
				path.join(workspace, 'main.yaml'),
				path.join(root, `${name}-first`),
				options,
			);
			const second = await runScenario(
				path.join(workspace, 'main.yaml'),
				path.join(root, `${name}-second`),
				options,
			);
			expect(second).toEqual(first);
		}
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});

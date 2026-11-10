import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	loadDesignTokenSource,
	loadDesignTokenWorkspace,
} from '../src/core/pipeline/workspace-loader.ts';
import { ExitCode } from '../src/types/index.ts';

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
	const dir = await fs.mkdtemp(
		path.join(os.tmpdir(), 'wave-workspace-loader-'),
	);
	tempDirs.push(dir);
	return dir;
}

async function writeMain(dir: string, content: string): Promise<string> {
	const mainPath = path.join(dir, 'main.yaml');
	await fs.writeFile(mainPath, content);
	return mainPath;
}

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe('design token workspace loader', () => {
	test('loads main, directory and an arbitrarily nested Day profile through one source contract', async () => {
		const dir = await makeTempDir();
		const mainPath = await writeMain(
			dir,
			`$id: base-id
$config:
  theme: source-contract
theme:
  color:
    primary: { $id: primary-id, $type: color, $value: "#112233" }
`,
		);
		const nestedDir = path.join(dir, 'themes', 'mobile');
		await fs.mkdir(nestedDir, { recursive: true });
		const profilePath = path.join(nestedDir, 'mobile.yaml');
		await fs.writeFile(
			profilePath,
			`$config:
  base: base-id
$override:
  primary-id:
    $value: "#445566"
`,
		);

		const main = await loadDesignTokenSource(mainPath, dir);
		const fromDirectory = await loadDesignTokenSource(dir, dir);
		const profile = await loadDesignTokenSource(profilePath, dir);

		expect(main).toMatchObject({ ok: true, source: { kind: 'main' } });
		expect(fromDirectory).toMatchObject({
			ok: true,
			source: { kind: 'main', path: mainPath },
		});
		expect(profile).toMatchObject({
			ok: true,
			source: {
				kind: 'profile',
				path: profilePath,
				workspace: { path: mainPath, workspaceDir: dir },
				entry: { name: 'mobile', isDefault: false },
			},
		});
		if (profile.ok) {
			expect(profile.source.document.tokenContent).toContain('#445566');
			expect(profile.source.document.tokenContent).not.toContain('#112233');
		}
	});

	test('profile source uses the nearest ancestor main.yaml and preserves symlink main basis', async () => {
		const dir = await makeTempDir();
		const outerMain = await writeMain(
			dir,
			'$id: outer\n$config:\n  theme: outer\ntheme: {}\n',
		);
		const nestedDir = path.join(dir, 'project', 'deep');
		await fs.mkdir(nestedDir, { recursive: true });
		const nestedMain = path.join(dir, 'project', 'main.yaml');
		await fs.writeFile(
			nestedMain,
			'$id: nested\n$config:\n  theme: nested\ntheme: {}\n',
		);
		const profilePath = path.join(nestedDir, 'custom.yaml');
		await fs.writeFile(profilePath, '$config:\n  base: nested\ntheme: {}\n');
		const linkDir = path.join(dir, 'linked');
		await fs.mkdir(linkDir);
		const linkedMain = path.join(linkDir, 'main.yaml');
		await fs.symlink(outerMain, linkedMain);

		const profile = await loadDesignTokenSource(profilePath, dir);
		const linked = await loadDesignTokenSource(linkedMain, dir);

		expect(profile).toMatchObject({
			ok: true,
			source: { workspace: { path: nestedMain, config: { theme: 'nested' } } },
		});
		expect(linked).toMatchObject({
			ok: true,
			source: {
				path: linkedMain,
				workspace: { path: linkedMain, workspaceDir: linkDir },
			},
		});
	});

	test('profile, Night and invalid base inputs fail before a build source is returned', async () => {
		const dir = await makeTempDir();
		const mainPath = await writeMain(
			dir,
			'$id: base-id\n$config:\n  theme: source-contract\ntheme: {}\n',
		);
		const profilePath = path.join(dir, 'nested', 'profile.yaml');
		await fs.mkdir(path.dirname(profilePath), { recursive: true });
		await fs.writeFile(profilePath, '$config:\n  base: wrong-id\ntheme: {}\n');
		const nightPath = path.join(dir, 'main@night.yaml');
		await fs.writeFile(nightPath, 'theme: {}\n');
		const orphanDir = await makeTempDir();
		const missingBasePath = path.join(orphanDir, 'orphan.yaml');
		await fs.writeFile(
			missingBasePath,
			'$config:\n  base: base-id\ntheme: {}\n',
		);

		const wrongBase = await loadDesignTokenSource(profilePath, dir);
		const night = await loadDesignTokenSource(nightPath, dir);
		const missingBase = await loadDesignTokenSource(missingBasePath, dir);

		expect(wrongBase).toMatchObject({ ok: false, path: profilePath });
		if (!wrongBase.ok) expect(wrongBase.message).toContain('does not match');
		expect(night).toMatchObject({ ok: false, path: nightPath });
		if (!night.ok) expect(night.message).toContain('Day profile');
		expect(missingBase).toMatchObject({ ok: false, path: missingBasePath });
		if (!missingBase.ok)
			expect(missingBase.message).toContain('ancestor main.yaml');
		await expect(loadDesignTokenSource(mainPath, dir)).resolves.toMatchObject({
			ok: true,
		});
	});

	test('loads main.yaml from cwd by default and removes $config', async () => {
		const dir = await makeTempDir();
		const mainPath = await writeMain(
			dir,
			`$config:
  theme: orca
theme:
  color:
    ink:
      $value: "#111111"
`,
		);

		const result = await loadDesignTokenWorkspace(undefined, dir);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.workspace.path).toBe(mainPath);
		expect(result.workspace.workspaceDir).toBe(dir);
		expect(result.workspace.config.theme).toBe('orca');
		expect(result.workspace.tokenContent).toContain('theme:');
		expect(result.workspace.tokenContent).not.toContain('$config');
	});

	test('loads an explicit relative main.yaml with resources and groups', async () => {
		const cwd = await makeTempDir();
		const workspaceDir = path.join(cwd, 'project');
		await fs.mkdir(workspaceDir);
		const mainPath = await writeMain(
			workspaceDir,
			`$config:
  theme: orca
  resource:
    palette: [tailwindcss, custom/palette.yaml]
    dimension: wave
    custom: custom/brand.yaml
  parameter:
    outputDir: ./dist
    platform: [json, css]
    colorSpace: hsl
  parameterGroup:
    sketch:
      platform: [sketch]
theme: {}
`,
		);

		const result = await loadDesignTokenWorkspace('project/main.yaml', cwd);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.workspace.path).toBe(mainPath);
		expect(result.workspace.config).toMatchObject({
			theme: 'orca',
			parameter: {
				output: './dist',
				platform: 'json,css',
				colorSpace: 'hsl',
			},
			parameterGroups: [{ name: 'sketch', parameter: { platform: 'sketch' } }],
		});
		expect(result.workspace.config.resources).toHaveLength(4);
	});

	test('accepts a symlink to a regular main.yaml and preserves supplied workspace dirname', async () => {
		const cwd = await makeTempDir();
		const sourceDir = path.join(cwd, 'source');
		const linkDir = path.join(cwd, 'linked-workspace');
		await fs.mkdir(sourceDir);
		await fs.mkdir(linkDir);
		const target = await writeMain(
			sourceDir,
			'$config:\n  theme: orca\ntheme: {}\n',
		);
		const supplied = path.join(linkDir, 'main.yaml');
		await fs.symlink(target, supplied);

		const result = await loadDesignTokenWorkspace(supplied, cwd);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.workspace.path).toBe(supplied);
		expect(result.workspace.workspaceDir).toBe(linkDir);
	});

	test('expands ~/ and literal ${HOME}/ paths', async () => {
		const home = await makeTempDir();
		const workspaceDir = path.join(home, 'project');
		await fs.mkdir(workspaceDir);
		await writeMain(workspaceDir, '$config:\n  theme: orca\ntheme: {}\n');
		const previousHome = process.env.HOME;
		process.env.HOME = home;

		try {
			for (const input of [
				'~/project/main.yaml',
				'${HOME}/project/main.yaml',
			]) {
				const result = await loadDesignTokenWorkspace(input, '/ignored');
				expect(result.ok).toBe(true);
				if (!result.ok) continue;
				expect(result.workspace.path).toBe(
					path.join(home, 'project/main.yaml'),
				);
			}
		} finally {
			if (previousHome === undefined) delete process.env.HOME;
			else process.env.HOME = previousHome;
		}
	});

	const rejectedEntryCases = [
		['themefile', 'themefile'],
		['resource file', 'palette.yaml'],
		['profile', 'profiles/mobile.yaml'],
		['night overlay', 'main@night.yaml'],
		['arbitrary YAML', 'tokens.yml'],
	] as const;

	for (const [name, input] of rejectedEntryCases) {
		test(`rejects ${name} before reading it`, async () => {
			const cwd = await makeTempDir();
			const result = await loadDesignTokenWorkspace(input, cwd);
			const rejectedPath = path.resolve(cwd, input);

			expect(result).toMatchObject({
				ok: false,
				exitCode: ExitCode.INVALID_PARAMETER,
				path: rejectedPath,
			});
			if (result.ok) return;
			expect(result.message).toContain(rejectedPath);
			expect(result.message).toContain('main.yaml');
			expect(result.message).toContain('wave token new');
		});
	}

	test('returns FILE_NOT_FOUND for the default main.yaml', async () => {
		const cwd = await makeTempDir();
		const result = await loadDesignTokenWorkspace(undefined, cwd);
		const expectedPath = path.join(cwd, 'main.yaml');

		expect(result).toMatchObject({
			ok: false,
			exitCode: ExitCode.FILE_NOT_FOUND,
			path: expectedPath,
		});
		if (result.ok) return;
		expect(result.message).toContain(expectedPath);
		expect(result.message).toContain('wave token new');
	});

	test('returns FILE_NOT_FOUND for an explicit missing main.yaml', async () => {
		const cwd = await makeTempDir();
		const result = await loadDesignTokenWorkspace('nested/main.yaml', cwd);
		const expectedPath = path.join(cwd, 'nested/main.yaml');

		expect(result).toMatchObject({
			ok: false,
			exitCode: ExitCode.FILE_NOT_FOUND,
			path: expectedPath,
		});
	});

	test('rejects a directory named main.yaml', async () => {
		const cwd = await makeTempDir();
		const mainPath = path.join(cwd, 'main.yaml');
		await fs.mkdir(mainPath);

		const result = await loadDesignTokenWorkspace(mainPath, cwd);

		expect(result).toMatchObject({
			ok: false,
			exitCode: ExitCode.INVALID_PARAMETER,
			path: mainPath,
		});
		if (result.ok) return;
		expect(result.message).toContain('regular file');
	});

	test('rejects malformed YAML as FORMAT_ERROR', async () => {
		const cwd = await makeTempDir();
		const mainPath = await writeMain(cwd, '$config: [\n');
		const result = await loadDesignTokenWorkspace(mainPath, cwd);

		expect(result).toMatchObject({
			ok: false,
			exitCode: ExitCode.FORMAT_ERROR,
			path: mainPath,
		});
		if (result.ok) return;
		expect(result.message).toContain(mainPath);
		expect(result.message).toContain('YAML');
	});

	test('rejects a YAML document without $config as FORMAT_ERROR', async () => {
		const cwd = await makeTempDir();
		const mainPath = await writeMain(cwd, 'theme: {}\n');
		const result = await loadDesignTokenWorkspace(mainPath, cwd);

		expect(result).toMatchObject({
			ok: false,
			exitCode: ExitCode.FORMAT_ERROR,
			path: mainPath,
		});
		if (result.ok) return;
		expect(result.message).toContain('$config');
	});

	test('rejects an invalid $config with the issue path', async () => {
		const cwd = await makeTempDir();
		const mainPath = await writeMain(
			cwd,
			'$config:\n  theme: orca\n  parameter:\n    platform: css\ntheme: {}\n',
		);
		const result = await loadDesignTokenWorkspace(mainPath, cwd);

		expect(result).toMatchObject({
			ok: false,
			exitCode: ExitCode.FORMAT_ERROR,
			path: mainPath,
		});
		if (result.ok) return;
		expect(result.message).toContain('parameter.platform');
	});

	test('reads document-level $id into themeId and strips it from the token tree', async () => {
		const dir = await makeTempDir();
		const id = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
		await writeMain(
			dir,
			`$id: ${id}
$config:
  theme: orca
theme:
  color:
    ink:
      $value: "#111111"
`,
		);

		const result = await loadDesignTokenWorkspace(undefined, dir);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.workspace.themeId).toBe(id);
		expect(result.workspace.tokenContent).not.toContain('$id');
		expect(result.workspace.tokenContent).toContain('theme:');
	});

	test('builds without a document-level $id (themeId stays undefined)', async () => {
		const dir = await makeTempDir();
		await writeMain(dir, '$config:\n  theme: orca\ntheme: {}\n');

		const result = await loadDesignTokenWorkspace(undefined, dir);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.workspace.themeId).toBeUndefined();
	});

	test('rejects a non-string document-level $id as FORMAT_ERROR', async () => {
		const dir = await makeTempDir();
		const mainPath = await writeMain(
			dir,
			'$id: [not, a, string]\n$config:\n  theme: orca\ntheme: {}\n',
		);

		const result = await loadDesignTokenWorkspace(mainPath, dir);

		expect(result).toMatchObject({
			ok: false,
			exitCode: ExitCode.FORMAT_ERROR,
			path: mainPath,
		});
		if (result.ok) return;
		expect(result.message).toContain('$id');
	});

	test('rejects an empty document-level $id as FORMAT_ERROR', async () => {
		const dir = await makeTempDir();
		const mainPath = await writeMain(
			dir,
			'$id: ""\n$config:\n  theme: orca\ntheme: {}\n',
		);

		const result = await loadDesignTokenWorkspace(mainPath, dir);

		expect(result).toMatchObject({
			ok: false,
			exitCode: ExitCode.FORMAT_ERROR,
			path: mainPath,
		});
		if (result.ok) return;
		expect(result.message).toContain('$id');
	});

	test('returns GENERAL_ERROR for a main.yaml that cannot be read', async () => {
		if (process.platform === 'win32' || process.getuid?.() === 0) return;
		const cwd = await makeTempDir();
		const mainPath = await writeMain(cwd, '$config:\n  theme: orca\n');
		await fs.chmod(mainPath, 0o000);

		try {
			const result = await loadDesignTokenWorkspace(mainPath, cwd);
			expect(result).toMatchObject({
				ok: false,
				exitCode: ExitCode.GENERAL_ERROR,
				path: mainPath,
			});
			if (result.ok) return;
			expect(result.message).toContain(mainPath);
			expect(result.message).toContain('read');
		} finally {
			await fs.chmod(mainPath, 0o600);
		}
	});
});

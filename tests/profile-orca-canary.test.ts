import { expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import {
	discoverProfiles,
	parseProfileDocument,
} from '../src/core/pipeline/profile-resolver.ts';
import { loadDesignTokenWorkspace } from '../src/core/pipeline/workspace-loader.ts';
import type { SketchPayloadV2 } from '../src/types/index.ts';

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

test('token build Orca canary preserves parameter groups, dual identity and inherited Sketch skip', async () => {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-m1-orca-canary-'));
	const mainPath = path.resolve(
		import.meta.dir,
		'fixtures/themes/orca-realistic/main.yaml',
	);
	try {
		const proc = Bun.spawn(
			[
				'pnpm',
				'dev',
				'--',
				'token',
				'build',
				'-f',
				mainPath,
				'--profiles',
				'all',
				'--output',
				dir,
			],
			{ stdout: 'pipe', stderr: 'pipe' },
		);
		const [code, stdout, stderr] = await Promise.all([
			proc.exited,
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);
		expect(code, stdout + stderr).toBe(0);
		const loaded = await loadDesignTokenWorkspace(mainPath);
		expect(loaded.ok).toBe(true);
		if (!loaded.ok) return;
		const { workspace } = loaded;
		const baseTree = yaml.load(workspace.tokenContent) as Record<
			string,
			unknown
		>;
		const profiles = await discoverProfiles(workspace.workspaceDir);
		expect(profiles.length).toBe(3);
		for (const entry of profiles) {
			const document = entry.isDefault
				? { themeId: workspace.themeId, tokenContent: workspace.tokenContent }
				: await parseProfileDocument(entry, {
						baseDir: workspace.workspaceDir,
						baseConfig: workspace.config,
						baseTree,
						baseId: workspace.themeId,
					});
			const stem = entry.isDefault
				? 'orca-realistic'
				: `orca-realistic-${entry.name}`;
			for (const extension of ['json', 'jsonc', 'css'])
				expect(
					await Bun.file(path.join(dir, `${stem}.${extension}`)).exists(),
				).toBe(true);
			const payload = (await Bun.file(
				path.join(dir, `${stem}2sketch.json`),
			).json()) as SketchPayloadV2;
			expect(payload.meta).toEqual({
				themeId: document.themeId ?? null,
				baseId: entry.isDefault
					? (document.themeId ?? 'orca-realistic')
					: workspace.themeId!,
				mode: 'day',
				version: 2,
			});
			const raw = yaml.load(document.tokenContent) as {
				theme: { font: Record<string, unknown> };
			};
			let skipped = 0;
			let included = 0;
			function check(
				node: Record<string, unknown>,
				inheritedSkip = false,
			): void {
				const ext = node.$extensions;
				const platform = record(ext) ? ext.platform : undefined;
				const sketch = record(platform) ? platform.sketch : undefined;
				const skip =
					record(sketch) && typeof sketch.skip === 'boolean'
						? sketch.skip
						: inheritedSkip;
				if (Object.hasOwn(node, '$value')) {
					expect(typeof node.$id).toBe('string');
					const asset = payload.assets.find(
						(candidate) => candidate.uuid === node.$id,
					);
					if (skip) {
						skipped++;
						expect(asset).toBeUndefined();
					} else {
						included++;
						expect(asset).toBeDefined();
					}
					return;
				}
				for (const [key, child] of Object.entries(node))
					if (!key.startsWith('$') && record(child)) check(child, skip);
			}
			check(raw.theme.font);
			expect(skipped).toBeGreaterThan(0);
			expect(included).toBeGreaterThan(0);
		}
	} finally {
		await fs.rm(dir, { recursive: true, force: true });
	}
}, 20000);

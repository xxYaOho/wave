import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { copyDirectory, ensureCleanDir } from '../shared/fs.ts';
import { sha256File } from '../shared/hash.ts';
import type { ResourceTrace } from '../shared/types.ts';
import { createSyntheticMainYaml } from './synthetic.ts';
import type { DesignTokenCase } from './types.ts';

const RESOURCE_SOURCES: Record<
	string,
	{ repoPath: string; workspaceName: string }
> = {
	tailwindcss: {
		repoPath: 'src/resources/palettes/tailwindcss.yaml',
		workspaceName: 'tailwindcss.yaml',
	},
	wave: {
		repoPath: 'src/resources/dimensions/wave.yaml',
		workspaceName: 'wave.yaml',
	},
};

export interface PreparedDesignTokenWorkspace {
	workspaceDir: string;
	mainYamlPath?: string;
	themefilePath?: string;
	resources: ResourceTrace[];
}

function clonePlainObject(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	return { ...(value as Record<string, unknown>) };
}

function rewriteConfigResources(mainYaml: string): string {
	const loaded = yaml.load(mainYaml);
	if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) {
		return mainYaml;
	}

	const root = loaded as Record<string, unknown>;
	const config = clonePlainObject(root.$config);
	const resource = clonePlainObject(config.resource);

	for (const [kind, rawRefs] of Object.entries(resource)) {
		const refs = Array.isArray(rawRefs) ? rawRefs : [rawRefs];
		resource[kind] = refs.map((ref) => {
			if (typeof ref !== 'string') return ref;
			const source = RESOURCE_SOURCES[ref];
			return source ? `./resources/${source.workspaceName}` : ref;
		});
	}

	config.resource = resource;
	root.$config = config;
	return yaml.dump(root, { lineWidth: -1 });
}

function rewriteThemefileResources(themefile: string): string {
	return themefile.replace(
		/^(RESOURCE\s+(palette|dimension)\s+)(tailwindcss|wave)\s*$/gm,
		(_match, prefix: string, _kind: string, name: string) => {
			const source = RESOURCE_SOURCES[name];
			return source ? `${prefix}./resources/${source.workspaceName}` : _match;
		},
	);
}

async function copyBenchmarkResources(
	repoRoot: string,
	workspaceDir: string,
): Promise<ResourceTrace[]> {
	const resourcesDir = path.join(workspaceDir, 'resources');
	await fs.mkdir(resourcesDir, { recursive: true });

	const traces: ResourceTrace[] = [];
	for (const [name, source] of Object.entries(RESOURCE_SOURCES)) {
		const repoSourcePath = path.join(repoRoot, source.repoPath);
		const workspacePath = path.join(resourcesDir, source.workspaceName);
		await fs.copyFile(repoSourcePath, workspacePath);
		const stat = await fs.stat(workspacePath);
		traces.push({
			kind: name === 'tailwindcss' ? 'palette' : 'dimension',
			ref: `./resources/${source.workspaceName}`,
			repoSourcePath,
			workspacePath,
			sha256: await sha256File(workspacePath),
			bytes: stat.size,
		});
	}

	return traces;
}

export async function prepareDesignTokenWorkspace(
	testCase: DesignTokenCase,
	workspaceDir: string,
	repoRoot: string = process.cwd(),
): Promise<PreparedDesignTokenWorkspace> {
	await ensureCleanDir(workspaceDir);

	if (testCase.source.kind === 'fixture') {
		const sourceDir = path.join(repoRoot, testCase.source.path);
		await copyDirectory(sourceDir, workspaceDir);

		const mainYamlPath = path.join(workspaceDir, 'main.yaml');
		const mainYaml = await fs.readFile(mainYamlPath, 'utf-8');
		await fs.writeFile(mainYamlPath, rewriteConfigResources(mainYaml), 'utf-8');
		const themefilePath = path.join(workspaceDir, 'themefile');
		try {
			const themefile = await fs.readFile(themefilePath, 'utf-8');
			await fs.writeFile(
				themefilePath,
				rewriteThemefileResources(themefile),
				'utf-8',
			);
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
				throw err;
			}
		}

		const resources = await copyBenchmarkResources(repoRoot, workspaceDir);
		return {
			workspaceDir,
			mainYamlPath,
			themefilePath:
				testCase.entryKind === 'themefile-legacy'
					? path.join(workspaceDir, 'themefile')
					: undefined,
			resources,
		};
	}

	const mainYamlPath = path.join(workspaceDir, 'main.yaml');
	await fs.writeFile(
		mainYamlPath,
		createSyntheticMainYaml(testCase.source.options),
		'utf-8',
	);
	const resources = await copyBenchmarkResources(repoRoot, workspaceDir);
	return { workspaceDir, mainYamlPath, resources };
}

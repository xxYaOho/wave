import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
	type DoctorFinding,
	type DtcgTokenGroup,
	ExitCode,
	type ParsedThemefile,
	type ReferenceDataSources,
	type ResolvedTokenGroup,
} from '../../types/index.ts';
import { parseThemeYaml } from '../parser/theme-yaml.ts';
import {
	buildDependencyDictionary,
	type DependencyDict,
	loadThemefile,
} from '../pipeline/theme-pipeline.ts';
import {
	expandExtends,
	resolveReferences,
} from '../resolver/theme-reference.ts';
import { validateThemeSchema } from '../schema/theme.ts';

export interface ThemeDoctorContext {
	themeDir: string;
	themefilePath: string;
	parsed: ParsedThemefile;
	dict: DependencyDict;
	expandedTree: DtcgTokenGroup;
	resolvedTree: ResolvedTokenGroup;
	doctorConfig?: Record<string, unknown>;
}

export type ThemeDoctorContextResult =
	| { ok: true; context: ThemeDoctorContext }
	| { ok: false; findings: DoctorFinding[]; exitCode: number };

export interface ThemeFileEntry {
	name: string;
	path: string;
	/** Suffix appended to THEME for output naming: '' for main, '-night' for night, '-{variant}' for variants */
	suffix: string;
}

function isParseError(
	result: unknown,
): result is { line: number; message: string } {
	return (
		typeof result === 'object' &&
		result !== null &&
		'line' in result &&
		'message' in result
	);
}

export async function detectThemeFiles(
	themeDir: string,
): Promise<ThemeFileEntry[]> {
	const files: ThemeFileEntry[] = [];

	const mainPath = path.join(themeDir, 'main.yaml');
	if (
		await fs
			.access(mainPath)
			.then(() => true)
			.catch(() => false)
	) {
		files.push({ name: 'main', path: mainPath, suffix: '' });
	}

	const nightPath = path.join(themeDir, 'main@night.yaml');
	if (
		await fs
			.access(nightPath)
			.then(() => true)
			.catch(() => false)
	) {
		files.push({ name: 'main@night', path: nightPath, suffix: '-night' });
	}

	const variantsDir = path.join(themeDir, 'variants');
	if (
		await fs
			.access(variantsDir)
			.then(() => true)
			.catch(() => false)
	) {
		const entries = await fs.readdir(variantsDir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isFile() && entry.name.endsWith('.yaml')) {
				const variantName = path.basename(entry.name, '.yaml');
				files.push({
					name: variantName,
					path: path.join(variantsDir, entry.name),
					suffix: `-${variantName}`,
				});
			}
		}
	}

	return files;
}

export async function createThemeDoctorContext(
	yamlPath: string,
	dict: DependencyDict,
): Promise<ThemeDoctorContextResult> {
	const content = await Bun.file(yamlPath).text();
	const yamlParsed = parseThemeYaml(content);

	if (isParseError(yamlParsed)) {
		return {
			ok: false,
			findings: [
				{
					level: 'error',
					message: `Theme YAML parse error: ${yamlParsed.message}`,
				},
			],
			exitCode: ExitCode.FORMAT_ERROR,
		};
	}

	const schemaResult = validateThemeSchema(yamlParsed.raw);
	if (!schemaResult.valid) {
		const errorMessages = schemaResult.issues
			.filter((i) => i.level === 'error')
			.map((i) => `  [${i.path}] ${i.message}`)
			.join('\n');
		return {
			ok: false,
			findings: [
				{
					level: 'error',
					message: `Theme schema validation failed:\n${errorMessages}`,
				},
			],
			exitCode: ExitCode.FORMAT_ERROR,
		};
	}

	// Extract and strip doctor config before pipeline processing
	let doctorConfig: Record<string, unknown> | undefined;
	const rawTree = { ...yamlParsed.raw };
	if (
		'doctor' in rawTree &&
		typeof rawTree.doctor === 'object' &&
		rawTree.doctor !== null
	) {
		const doctorObj = rawTree.doctor as Record<string, unknown>;
		if (
			'wcagPairs' in doctorObj &&
			typeof doctorObj.wcagPairs === 'object' &&
			doctorObj.wcagPairs !== null
		) {
			doctorConfig = doctorObj.wcagPairs as Record<string, unknown>;
		}
		delete rawTree.doctor;
	}

	const sources: ReferenceDataSources = {};
	for (const [namespace, entry] of Object.entries(dict)) {
		sources[namespace] = entry.data;
	}

	try {
		const rootKeys = new Set(
			Object.keys(rawTree).filter((k) => !k.startsWith('$')),
		);
		if (rootKeys.size === 0) rootKeys.add('theme');
		const expanded = expandExtends(rawTree, rootKeys);
		const resolved = resolveReferences(expanded, sources);

		return {
			ok: true,
			context: {
				themeDir: path.dirname(yamlPath),
				themefilePath: yamlPath,
				parsed: { THEME: '', PARAMETER: {}, resources: [] },
				dict,
				expandedTree: expanded,
				resolvedTree: resolved,
				doctorConfig,
			},
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		let exitCode = ExitCode.GENERAL_ERROR;
		if (message.toLowerCase().includes('circular')) {
			exitCode = ExitCode.INVALID_PARAMETER;
		} else if (message.toLowerCase().includes('unresolved')) {
			exitCode = ExitCode.INVALID_PARAMETER;
		}
		return {
			ok: false,
			findings: [
				{
					level: 'error',
					message,
				},
			],
			exitCode,
		};
	}
}

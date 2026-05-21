import * as path from 'node:path';

export type CompressToolName =
	| 'oxipng'
	| 'pngquant'
	| 'svgo'
	| 'gifsicle'
	| 'jpegtran'
	| 'mozjpeg';

export type CompressMode = 'safe' | 'quality';

export interface ToolStatus {
	name: CompressToolName;
	path: string | null;
	available: boolean;
	requiredFor: CompressMode[];
}

export interface ToolResolver {
	resolve(name: CompressToolName): Promise<string | null>;
}

export const COMPRESS_SAFE_TOOLS: CompressToolName[] = [
	'oxipng',
	'svgo',
	'gifsicle',
	'jpegtran',
	'mozjpeg',
];

export const COMPRESS_QUALITY_TOOLS: CompressToolName[] = ['pngquant', 'mozjpeg'];

export class PathToolResolver implements ToolResolver {
	constructor(private readonly envPath = process.env.PATH ?? '') {}

	async resolve(name: CompressToolName): Promise<string | null> {
		const candidates = toolCandidates(name);
		for (const dir of this.envPath.split(path.delimiter)) {
			if (!dir) continue;
			for (const candidate of candidates) {
				const fullPath = path.join(dir, candidate);
				if (await Bun.file(fullPath).exists()) return fullPath;
			}
		}
		return null;
	}
}

export function toolCandidates(name: CompressToolName): string[] {
	if (name === 'mozjpeg') return ['mozjpeg', 'cjpeg'];
	return [name];
}

export async function checkCompressTools(
	resolver: ToolResolver,
	mode: CompressMode,
): Promise<ToolStatus[]> {
	const names = new Set<CompressToolName>(COMPRESS_SAFE_TOOLS);
	if (mode === 'quality') {
		for (const tool of COMPRESS_QUALITY_TOOLS) names.add(tool);
	}

	const statuses: ToolStatus[] = [];
	for (const name of names) {
		const toolPath = await resolver.resolve(name);
		statuses.push({
			name,
			path: toolPath,
			available: !!toolPath,
			requiredFor: requiredFor(name),
		});
	}
	return statuses;
}

export function requiredFor(name: CompressToolName): CompressMode[] {
	if (COMPRESS_QUALITY_TOOLS.includes(name)) return ['quality'];
	return ['safe'];
}

export function getMissingToolNames(statuses: ToolStatus[]): CompressToolName[] {
	return statuses
		.filter((status) => !status.available)
		.map((status) => status.name);
}

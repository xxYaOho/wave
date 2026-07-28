import type {
	ColorSpaceFormat,
	ResolvedGroupParameters,
	ThemeDocumentFailure,
	ThemeDocumentSuccess,
} from '../../types/index.ts';
import type { DependencyDict } from './theme-pipeline.ts';
import { processThemeDocument } from './theme-pipeline.ts';

export interface PrepareBuildPassInput {
	id: string;
	themeName: string;
	yamlPath: string;
	yamlContent: string;
	dict: DependencyDict;
	pass: ResolvedGroupParameters;
}

export interface PreparedBuildPass {
	id: string;
	themeName: string;
	outputDir: string;
	platforms: string[];
	filterLayer: number | undefined;
	colorSpace: ColorSpaceFormat | undefined;
	document: ThemeDocumentSuccess;
}

export type PrepareBuildPassResult =
	| { ok: true; prepared: PreparedBuildPass }
	| ThemeDocumentFailure;

export async function prepareBuildPass(
	input: PrepareBuildPassInput,
): Promise<PrepareBuildPassResult> {
	const document = await processThemeDocument(
		input.yamlPath,
		input.dict,
		input.pass.colorSpace,
		input.yamlContent,
	);
	if (!document.ok) return document;

	return {
		ok: true,
		prepared: {
			id: input.id,
			themeName: input.themeName,
			outputDir: input.pass.outputDir,
			platforms: input.pass.platforms,
			filterLayer: input.pass.filterLayer,
			colorSpace: input.pass.colorSpace,
			document,
		},
	};
}

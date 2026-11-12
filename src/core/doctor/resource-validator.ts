import type { DesignTokenBuildConfig } from '../../types/index.ts';
import {
	validateDimensionSchema,
	validatePaletteSchema,
} from '../parser/index.ts';
import {
	collectDependencyDictionary,
	type DependencyDictionary,
	type LoadedDependency,
} from '../pipeline/theme-pipeline.ts';
import type { TokenCache } from '../pipeline/token-cache.ts';
import { validateCustomResourceExtension } from '../schema/resource.ts';

export type DeclaredResourceValidationResult =
	| { ok: true; dictionary: DependencyDictionary }
	| { ok: false; message: string };

const RESOURCE_KINDS = new Set(['palette', 'dimension', 'custom']);

function validateDeclaration(
	declaration: DesignTokenBuildConfig['resources'][number],
): string | undefined {
	if (!RESOURCE_KINDS.has(declaration.kind)) {
		return `Unsupported resource kind: ${declaration.kind}`;
	}
	if (declaration.kind === 'custom') {
		return validateCustomResourceExtension(declaration.ref)?.message;
	}
	return undefined;
}

async function validateLoadedResource(
	entry: LoadedDependency,
): Promise<string | undefined> {
	if (entry.kind === 'palette') {
		const error = await validatePaletteSchema(entry.content, entry.path);
		return error ? `Palette schema error: ${error.message}` : undefined;
	}
	if (entry.kind === 'dimension') {
		const error = await validateDimensionSchema(entry.content, entry.path);
		return error ? `Dimension schema error: ${error.message}` : undefined;
	}
	return undefined;
}

export async function validateDeclaredResources(
	config: Pick<DesignTokenBuildConfig, 'resources'>,
	workspaceDir: string,
	cache?: TokenCache,
): Promise<DeclaredResourceValidationResult> {
	for (const declaration of config.resources) {
		const declarationError = validateDeclaration(declaration);
		if (declarationError) return { ok: false, message: declarationError };
	}

	const dictionary = await collectDependencyDictionary(
		config,
		workspaceDir,
		{},
		cache,
	);
	const loadIssue = dictionary.issues[0];
	if (loadIssue) return { ok: false, message: loadIssue.message };

	for (const entry of dictionary.loaded) {
		const schemaError = await validateLoadedResource(entry);
		if (schemaError) return { ok: false, message: schemaError };
	}

	return { ok: true, dictionary };
}

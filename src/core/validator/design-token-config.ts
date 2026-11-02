import { z } from 'zod';
import type {
	DesignTokenBuildConfig,
	ParameterSet,
	ResourceDeclaration,
} from '../../types/index.ts';
import { ExitCode } from '../../types/index.ts';

const nonEmptyString = z.string().trim().min(1);
const platforms = ['json', 'jsonc', 'css', 'sketch', 'md-yml'] as const;
const colorSpaces = ['hex', 'oklch', 'srgb', 'hsl'] as const;

const parameterSchema = z
	.object({
		outputDir: nonEmptyString.optional(),
		platform: z.array(z.enum(platforms)).min(1).optional(),
		filterLayer: z.number().int().nonnegative().optional(),
		colorSpace: z.enum(colorSpaces).optional(),
	})
	.strict();

const resourceReferenceSchema = z.union([
	nonEmptyString,
	z.array(nonEmptyString).min(1),
]);

const resourceSchema = z
	.object({
		palette: resourceReferenceSchema.optional(),
		dimension: resourceReferenceSchema.optional(),
		custom: resourceReferenceSchema.optional(),
	})
	.strict();

const nightScenes = [
	'moon',
	'night-light',
	'night',
	'candle-light',
	'sunset',
] as const;
const luminanceEvLevels = ['minimal', 'low', 'medium', 'high', 'max'] as const;

const nightConfigSchema = z
	.object({
		scene: z.enum(nightScenes).optional(),
		luminance: z.number().min(0).max(1).optional(),
		luminanceEv: z.enum(luminanceEvLevels).optional(),
		'luminance-ev': z.enum(luminanceEvLevels).optional(),
		// Legacy aliases (Primary Night 明度 was briefly named chroma)
		chroma: z.number().min(0).max(1).optional(),
		chromaEv: z.enum(luminanceEvLevels).optional(),
		'chroma-ev': z.enum(luminanceEvLevels).optional(),
	})
	.strict()
	.optional();

const mainConfigSchema = z
	.object({
		theme: nonEmptyString,
		night: nightConfigSchema,
		resource: resourceSchema.optional(),
		parameter: parameterSchema.optional(),
		parameterGroup: z
			.record(z.string().trim().min(1), parameterSchema)
			.optional(),
	})
	.strict();

type ParsedParameter = z.infer<typeof parameterSchema>;

export type MainConfigValidationResult =
	| { ok: true; config: DesignTokenBuildConfig }
	| {
			ok: false;
			exitCode: typeof ExitCode.FORMAT_ERROR;
			message: string;
	  };

function normalizeParameter(
	parameter: ParsedParameter | undefined,
): ParameterSet {
	if (!parameter) return {};

	const normalized: ParameterSet = {};
	if (parameter.outputDir !== undefined) {
		normalized.output = parameter.outputDir;
	}
	if (parameter.platform !== undefined) {
		normalized.platform = parameter.platform.join(',');
	}
	if (parameter.filterLayer !== undefined) {
		normalized.filterLayer = String(parameter.filterLayer);
	}
	if (parameter.colorSpace !== undefined) {
		normalized.colorSpace = parameter.colorSpace;
	}
	return normalized;
}

function normalizeResources(
	resource: z.infer<typeof resourceSchema> | undefined,
	declarationOrder: string[],
): ResourceDeclaration[] {
	if (!resource) return [];

	const declarations: ResourceDeclaration[] = [];
	for (const kind of declarationOrder) {
		if (kind !== 'palette' && kind !== 'dimension' && kind !== 'custom')
			continue;
		const value = resource[kind];
		if (value === undefined) continue;
		const references = Array.isArray(value) ? value : [value];
		for (const ref of references) {
			declarations.push({ kind, ref });
		}
	}
	return declarations;
}

function formatIssues(error: z.ZodError): string {
	return error.issues
		.map((issue) => {
			const issuePath =
				issue.path.length > 0 ? issue.path.map(String).join('.') : '<root>';
			return `${issuePath}: ${issue.message}`;
		})
		.join('; ');
}

export function validateMainConfig(value: unknown): MainConfigValidationResult {
	const result = mainConfigSchema.safeParse(value);
	if (!result.success) {
		return {
			ok: false,
			exitCode: ExitCode.FORMAT_ERROR,
			message: formatIssues(result.error),
		};
	}
	const rawResource = (value as { resource?: unknown }).resource;
	const resourceDeclarationOrder =
		rawResource &&
		typeof rawResource === 'object' &&
		!Array.isArray(rawResource)
			? Object.keys(rawResource)
			: [];

	return {
		ok: true,
		config: {
			theme: result.data.theme,
			parameter: normalizeParameter(result.data.parameter),
			resources: normalizeResources(
				result.data.resource,
				resourceDeclarationOrder,
			),
			parameterGroups: Object.entries(result.data.parameterGroup ?? {}).map(
				([name, parameter]) => ({
					name,
					parameter: normalizeParameter(parameter),
				}),
			),
		},
	};
}

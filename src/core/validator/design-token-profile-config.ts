import { z } from 'zod';
import { ExitCode } from '../../types/index.ts';

const nonEmptyString = z.string().trim().min(1);
const parameterSchema = z
	.object({
		outputDir: nonEmptyString.optional(),
		platform: z
			.array(z.enum(['json', 'jsonc', 'css', 'sketch', 'md-yml']))
			.min(1)
			.optional(),
		filterLayer: z.number().int().nonnegative().optional(),
		colorSpace: z.enum(['hex', 'oklch', 'srgb', 'hsl']).optional(),
	})
	.strict();
const resourceReference = z.union([
	nonEmptyString,
	z.array(nonEmptyString).min(1),
]);
const profileConfigSchema = z
	.object({
		base: z
			.string()
			.refine(
				(value) => value.trim() !== '',
				'Expected a non-empty base identity',
			),
		resource: z
			.object({
				palette: resourceReference.optional(),
				dimension: resourceReference.optional(),
				custom: resourceReference.optional(),
			})
			.strict()
			.optional(),
		parameter: parameterSchema.optional(),
		parameterGroup: z.record(nonEmptyString, parameterSchema).optional(),
	})
	.strict();

export type ProfileConfigValidationResult =
	| { ok: true; config: z.infer<typeof profileConfigSchema> }
	| { ok: false; exitCode: typeof ExitCode.FORMAT_ERROR; message: string };

export function validateProfileConfig(
	value: unknown,
): ProfileConfigValidationResult {
	const result = profileConfigSchema.safeParse(value);
	if (!result.success) {
		return {
			ok: false,
			exitCode: ExitCode.FORMAT_ERROR,
			message: result.error.issues
				.map(
					(issue) =>
						`${issue.path.length ? issue.path.map(String).join('.') : '<root>'}: ${issue.message}`,
				)
				.join('; '),
		};
	}
	return { ok: true, config: result.data };
}

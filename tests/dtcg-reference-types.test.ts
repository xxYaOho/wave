import { describe, expect, test } from 'bun:test';
import { processThemeDocument } from '../src/core/pipeline/theme-pipeline.ts';
import { resolveReferences } from '../src/core/resolver/reference-resolution.ts';
import {
	validateCompleteTokenReferenceTypes,
	validateResolvedCompositeReferences,
} from '../src/core/schema/dtcg-reference-types.ts';
import { validateThemeSchema } from '../src/core/schema/theme.ts';
import type {
	DtcgTokenGroup,
	ReferenceDataSources,
} from '../src/types/index.ts';

function validateAndResolve(
	tree: DtcgTokenGroup,
	sources: ReferenceDataSources = {},
) {
	validateCompleteTokenReferenceTypes(tree, sources);
	const result = resolveReferences(tree, sources);
	validateResolvedCompositeReferences(result.tree, result.provenance);
	return result;
}

describe('DTCG typed complete-token references', () => {
	test('defers whole-token typography aliases in raw schema only', () => {
		const tree = {
			theme: {
				font: {
					$type: 'typography',
					body: {
						$value: {
							fontFamily: 'Inter',
							fontSize: 16,
							fontWeight: 400,
							letterSpacing: 0,
							lineHeight: 1.5,
						},
					},
					curlyAlias: { $value: '{theme.font.body}' },
					pointerAlias: {
						$value: { $ref: '#/theme/font/body/$value' },
					},
				},
			},
		} as DtcgTokenGroup;

		expect(validateThemeSchema(tree, 'raw').valid).toBe(true);
		const resolvedPhase = validateThemeSchema(tree, 'resolved');
		expect(resolvedPhase.valid).toBe(false);
		expect(
			resolvedPhase.issues.filter((issue) => issue.level === 'error'),
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: 'theme.font.curlyAlias.$value',
					message: 'typography value must be an object',
				}),
			]),
		);

		const result = validateAndResolve({
			theme: {
				font: {
					$type: 'typography',
					body: (tree.theme as Record<string, Record<string, unknown>>).font
						?.body as { $value: Record<string, unknown> },
					alias: { $value: '{theme.font.body}' },
				},
			},
		});
		expect(validateThemeSchema(result.tree, 'resolved').valid).toBe(true);
	});

	test('accepts an internal curly alias with the same explicit type', () => {
		const result = validateAndResolve({
			theme: {
				source: { $type: 'duration', $value: { value: 200, unit: 'ms' } },
				alias: { $type: 'duration', $value: '{theme.source}' },
			},
		});

		expect(
			(result.tree.theme as Record<string, { $value: unknown }>).alias?.$value,
		).toEqual({ value: 200, unit: 'ms' });
	});

	test('derives a target effective type through an untyped complete alias', () => {
		expect(() =>
			validateCompleteTokenReferenceTypes(
				{
					theme: {
						duration: {
							$type: 'duration',
							base: { $value: { value: 200, unit: 'ms' } },
						},
						alias: { $value: '{theme.duration.base}' },
						weight: { $type: 'fontWeight', $value: '{theme.alias}' },
					},
				},
				{},
			),
		).toThrow(
			'theme.weight.$value expected type "fontWeight" but target "theme.alias" has type "duration"',
		);
	});

	test('uses the nearest group type for internal JSON Pointer aliases', () => {
		expect(() =>
			validateCompleteTokenReferenceTypes(
				{
					theme: {
						durations: {
							$type: 'duration',
							source: { $value: { value: 200, unit: 'ms' } },
						},
						weights: {
							$type: 'fontWeight',
							bad: { $value: { $ref: '#/theme/durations/source/$value' } },
						},
					},
				},
				{},
			),
		).toThrow(
			'theme.weights.bad.$value expected type "fontWeight" but target "theme.durations.source" has type "duration"',
		);
	});

	test('rejects an external curly alias by target type instead of resolved shape', () => {
		expect(() =>
			validateCompleteTokenReferenceTypes(
				{
					theme: {
						weight: { $type: 'fontWeight', $value: '{brand.weight.bold}' },
					},
				},
				{
					brand: {
						weight: {
							$type: 'number',
							bold: { $value: 700 },
						},
					},
				},
			),
		).toThrow(
			'theme.weight.$value expected type "fontWeight" but target "brand.weight.bold" has type "number"',
		);
	});

	test('validates external JSON Pointer references used by composite fields', () => {
		expect(() =>
			validateCompleteTokenReferenceTypes(
				{
					theme: {
						border: {
							$type: 'border',
							$value: {
								color: '#000000',
								width: 1,
								style: { $ref: '#/brand/motion/fast/$value' },
							},
						},
					},
				},
				{
					brand: {
						motion: {
							$type: 'duration',
							fast: { $value: { value: 100, unit: 'ms' } },
						},
					},
				},
			),
		).toThrow(
			'theme.border.$value.style expected type "strokeStyle" but target "brand.motion.fast" has type "duration"',
		);
	});

	test('accepts border.style references to strokeStyle tokens', () => {
		expect(() =>
			validateCompleteTokenReferenceTypes(
				{
					theme: {
						styles: {
							$type: 'strokeStyle',
							dashed: { $value: 'dashed' },
						},
						border: {
							$type: 'border',
							$value: {
								color: '#000000',
								width: 1,
								style: '{theme.styles.dashed}',
							},
						},
					},
				},
				{},
			),
		).not.toThrow();
	});
});

describe('composite array reference provenance', () => {
	test('keeps a shadow member reference as one member', () => {
		const result = validateAndResolve({
			theme: {
				shadow: {
					$type: 'shadow',
					single: {
						$value: {
							color: '#00000080',
							offsetX: 0,
							offsetY: 2,
							blur: 4,
							spread: 0,
						},
					},
					stack: {
						$value: [{ $ref: '#/theme/shadow/single/$value' }],
					},
				},
			},
		});

		const shadow = (result.tree.theme as Record<string, unknown>)
			.shadow as Record<string, { $value: unknown }>;
		expect(shadow.stack?.$value).toEqual([
			{ ...(shadow.single?.$value as object), _swatchName: 'shadow/single' },
		]);
	});

	test('rejects a shadow member reference that resolves to an array', () => {
		const tree = {
			theme: {
				shadow: {
					$type: 'shadow',
					stack: {
						$value: [
							{
								color: '#00000080',
								offsetX: 0,
								offsetY: 2,
								blur: 4,
								spread: 0,
							},
						],
					},
					bad: {
						$value: [{ $ref: '#/theme/shadow/stack/$value' }],
					},
				},
			},
		} as DtcgTokenGroup;

		validateCompleteTokenReferenceTypes(tree, {});
		const result = resolveReferences(tree, {});
		expect(() =>
			validateResolvedCompositeReferences(result.tree, result.provenance),
		).toThrow(
			'theme.shadow.bad.$value[0] references "theme.shadow.stack" whose value is an array',
		);
	});

	test('rejects an external gradient member reference that resolves to an array', () => {
		const tree = {
			theme: {
				gradient: {
					$type: 'gradient',
					bad: {
						$value: [{ $ref: '#/brand/gradient/ramp/$value' }],
					},
				},
			},
		} as DtcgTokenGroup;
		const sources = {
			brand: {
				gradient: {
					$type: 'gradient',
					ramp: {
						$value: [
							{ color: '#000000', position: 0 },
							{ color: '#ffffff', position: 1 },
						],
					},
				},
			},
		};

		validateCompleteTokenReferenceTypes(tree, sources);
		const result = resolveReferences(tree, sources);
		expect(() =>
			validateResolvedCompositeReferences(result.tree, result.provenance),
		).toThrow(
			'theme.gradient.bad.$value[0] references "brand.gradient.ramp" whose value is an array',
		);
	});
});

describe('typed reference pipeline integration', () => {
	test('returns a schema error before transforming a mismatched alias', async () => {
		const result = await processThemeDocument(
			'/virtual/main.yaml',
			{},
			undefined,
			`theme:
  durations:
    $type: duration
    fast:
      $value: { value: 100, unit: ms }
  weight:
    $type: fontWeight
    $value: "{theme.durations.fast}"
`,
		);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe('schema_error');
			expect(result.message).toContain(
				'theme.weight.$value expected type "fontWeight" but target "theme.durations.fast" has type "duration"',
			);
		}
	});
});

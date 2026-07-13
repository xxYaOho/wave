import { describe, expect, test } from 'bun:test';
import { validateThemeSchema } from '../src/core/schema/theme.ts';

describe('sketch extension schema', () => {
	test('accepts boolean sketch.skip on groups and tokens', () => {
		const result = validateThemeSchema({
			theme: {
				color: {
					$type: 'color',
					$extensions: { sketch: { skip: true } },
					primary: {
						$value: '#1872f0',
						$extensions: { sketch: { skip: false } },
					},
				},
			},
		});

		expect(result.valid).toBe(true);
	});

	test('rejects non-boolean sketch.skip on groups and tokens', () => {
		for (const skip of ['true', 1, null, {}, []]) {
			const result = validateThemeSchema({
				theme: {
					color: {
						$type: 'color',
						$extensions: { sketch: { skip } },
						primary: {
							$value: '#1872f0',
							$extensions: { sketch: { skip } },
						},
					},
				},
			});

			expect(result.valid).toBe(false);
			expect(
				result.issues.filter((issue) =>
					issue.message.includes('sketch.skip must be a boolean'),
				),
			).toHaveLength(2);
		}
	});

	test('accepts path and supported property on number token under dimension root', () => {
		const result = validateThemeSchema({
			theme: {
				dimension: {
					interaction: {
						hover: {
							$type: 'number',
							$value: 0.16,
							$extensions: {
								sketch: {
									path: 'foundation/interaction/hover',
									property: { opacity: true },
								},
							},
						},
					},
				},
			},
		});

		expect(result.valid).toBe(true);
	});

	test('rejects unknown sketch property key', () => {
		const result = validateThemeSchema({
			theme: {
				dimension: {
					interaction: {
						hover: {
							$type: 'number',
							$value: 0.16,
							$extensions: {
								sketch: { property: { fillColor: true } },
							},
						},
					},
				},
			},
		});

		expect(result.valid).toBe(false);
		expect(
			result.issues.some((issue) =>
				issue.message.includes('Unknown sketch property "fillColor"'),
			),
		).toBe(true);
	});

	test('rejects unknown sketch top-level key', () => {
		const result = validateThemeSchema({
			theme: {
				color: {
					accent: {
						$type: 'color',
						$value: '#000000',
						$extensions: {
							sketch: { swatch: true },
						},
					},
				},
			},
		});

		expect(result.valid).toBe(false);
		expect(
			result.issues.some((issue) =>
				issue.message.includes('Unknown sketch field "swatch"'),
			),
		).toBe(true);
	});

	test('rejects invalid sketch path values', () => {
		for (const pathValue of [
			'',
			'   ',
			1,
			[],
			{},
			'/foundation',
			'foundation/',
			'foundation//color',
			'foundation.color',
		]) {
			const result = validateThemeSchema({
				theme: {
					color: {
						accent: {
							$type: 'color',
							$value: '#000000',
							$extensions: {
								sketch: { path: pathValue },
							},
						},
					},
				},
			});

			expect(result.valid).toBe(false);
			expect(
				result.issues.some((issue) =>
					issue.message.includes(
						'sketch.path must be a slash-delimited group path',
					),
				),
			).toBe(true);
		}
	});

	test('rejects misspelled true value', () => {
		const result = validateThemeSchema({
			theme: {
				dimension: {
					interaction: {
						hover: {
							$type: 'number',
							$value: 0.16,
							$extensions: {
								sketch: { property: { opacity: 'ture' } },
							},
						},
					},
				},
			},
		});

		expect(result.valid).toBe(false);
		expect(
			result.issues.some((issue) =>
				issue.message.includes('sketch.property.opacity must be true'),
			),
		).toBe(true);
	});

	test('rejects color token using opacity property', () => {
		const result = validateThemeSchema({
			theme: {
				dimension: {
					interaction: {
						hover: {
							$type: 'color',
							$value: '#000000',
							$extensions: {
								sketch: { property: { opacity: true } },
							},
						},
					},
				},
			},
		});

		expect(result.valid).toBe(false);
		expect(
			result.issues.some((issue) =>
				issue.message.includes(
					'opacity requires $type "number" or "dimension"',
				),
			),
		).toBe(true);
	});

	test('rejects inherited color type using opacity property', () => {
		const result = validateThemeSchema({
			theme: {
				dimension: {
					$type: 'color',
					interaction: {
						hover: {
							$value: '#000000',
							$extensions: {
								sketch: { property: { opacity: true } },
							},
						},
					},
				},
			},
		});

		expect(result.valid).toBe(false);
		expect(
			result.issues.some((issue) =>
				issue.message.includes(
					'opacity requires $type "number" or "dimension"',
				),
			),
		).toBe(true);
	});

	test('accepts inherited number type under dimension root', () => {
		const result = validateThemeSchema({
			theme: {
				dimension: {
					$type: 'number',
					interaction: {
						hover: {
							$value: 0.16,
							$extensions: {
								sketch: { property: { opacity: true } },
							},
						},
					},
				},
			},
		});

		expect(result.valid).toBe(true);
	});

	test('rejects number property outside dimension or state root', () => {
		const result = validateThemeSchema({
			theme: {
				color: {
					accent: {
						$type: 'number',
						$value: 0.16,
						$extensions: {
							sketch: { property: { opacity: true } },
						},
					},
				},
			},
		});

		expect(result.valid).toBe(false);
		expect(
			result.issues.some((issue) =>
				issue.message.includes('must be under a dimension or state root'),
			),
		).toBe(true);
	});

	test('accepts group-level sketch path', () => {
		const result = validateThemeSchema({
			theme: {
				color: {
					$type: 'color',
					$extensions: {
						sketch: { path: 'foundation/color' },
					},
					primary: { $value: '#1872f0' },
				},
			},
		});

		expect(result.valid).toBe(true);
	});

	test('rejects invalid group-level sketch path values', () => {
		const result = validateThemeSchema({
			theme: {
				color: {
					$type: 'color',
					$extensions: {
						sketch: { path: 'foundation.color' },
					},
					primary: { $value: '#1872f0' },
				},
			},
		});

		expect(result.valid).toBe(false);
		expect(
			result.issues.some(
				(issue) =>
					issue.path === 'theme.color.$extensions.sketch.path' &&
					issue.message.includes(
						'sketch.path must be a slash-delimited group path',
					),
			),
		).toBe(true);
	});

	test('rejects group-level sketch property', () => {
		const result = validateThemeSchema({
			theme: {
				color: {
					$type: 'color',
					$extensions: {
						sketch: { property: { opacity: true } },
					},
					primary: { $value: '#1872f0' },
				},
			},
		});

		expect(result.valid).toBe(false);
		expect(
			result.issues.some(
				(issue) =>
					issue.path === 'theme.color.$extensions.sketch.property' &&
					issue.message.includes(
						'sketch.property is only supported on token extensions',
					),
			),
		).toBe(true);
	});
});

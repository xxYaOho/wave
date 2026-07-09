import { describe, expect, test } from 'bun:test';
import { validateThemeSchema } from '../src/core/schema/theme.ts';

describe('theme schema', () => {
	test('accepts DTCG typography type', () => {
		const result = validateThemeSchema({
			theme: {
				font: {
					heading: {
						h1: {
							$type: 'typography',
							$value: {
								fontFamily: 'Inter',
								fontSize: { value: 32, unit: 'px' },
								fontWeight: 700,
								lineHeight: 1.2,
								letterSpacing: { value: -0.2, unit: 'px' },
							},
						},
					},
				},
			},
		});

		expect(result.valid).toBe(true);
		expect(result.issues).toEqual([]);
	});
});

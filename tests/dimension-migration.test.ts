import { describe, expect, test } from 'bun:test';
import {
	findPublicDimensionRoots,
	renderDimensionMigrationAdvice,
} from '../src/core/doctor/dimension-migration.ts';

describe('dimension migration diagnostics', () => {
	test('finds public theme.dimension roots', () => {
		const findings = findPublicDimensionRoots({
			theme: {
				dimension: {
					$type: 'dimension',
					interaction: { hover: { $value: 0.16 } },
					radius: { md: { $value: 8 } },
				},
			},
		});

		expect(findings).toEqual([
			'theme.dimension.interaction',
			'theme.dimension.radius',
		]);
	});

	test('renders migration advice', () => {
		const advice = renderDimensionMigrationAdvice([
			'theme.dimension.interaction',
			'theme.dimension.shadow',
		]);

		expect(advice).toContain(
			'theme.dimension is no longer a public output root',
		);
		expect(advice).toContain('theme.dimension.interaction.* -> theme.state.*');
		expect(advice).toContain(
			'theme.dimension.shadow.* -> theme.shadow.elevation.*',
		);
	});
});

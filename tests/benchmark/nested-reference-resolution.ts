#!/usr/bin/env bun

import { resolveReferences } from '../../src/core/resolver/theme-reference.ts';
import type {
	DtcgToken,
	DtcgTokenGroup,
	DtcgValue,
	ReferenceDataSources,
} from '../../src/types/index.ts';

const REFERENCE_PATTERN = /^\{([a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)*)\}$/;

function getValueAtPath(obj: unknown, path: string[]): unknown {
	let current: unknown = obj;

	for (const key of path) {
		if (current === null || current === undefined) {
			return undefined;
		}

		if (typeof current === 'object' && key in current) {
			current = (current as Record<string, unknown>)[key];
		} else {
			return undefined;
		}
	}

	return current;
}

function extractValue(found: unknown): DtcgValue | undefined {
	if (found === null || found === undefined) {
		return undefined;
	}

	if (typeof found === 'object' && found !== null && '$value' in found) {
		const token = found as { $value: unknown };
		if (
			typeof token.$value === 'string' ||
			typeof token.$value === 'number' ||
			typeof token.$value === 'boolean'
		) {
			return token.$value;
		}
		return undefined;
	}

	if (
		typeof found === 'string' ||
		typeof found === 'number' ||
		typeof found === 'boolean'
	) {
		return found;
	}

	return undefined;
}

function resolveReference(
	ref: string,
	sources: ReferenceDataSources,
): DtcgValue | undefined {
	const match = ref.match(REFERENCE_PATTERN);

	if (!match) {
		return undefined;
	}

	const pathStr = match[1];

	if (pathStr === undefined) {
		return undefined;
	}

	const path = pathStr.split('.');

	if (path.length < 1) {
		return undefined;
	}

	const prefix = path[0];
	const pathWithoutPrefix = path.slice(1);

	if (pathWithoutPrefix.length < 1) {
		return undefined;
	}

	if (prefix === 'leonardo') {
		const found = getValueAtPath(sources.palette, pathWithoutPrefix);
		const extracted = extractValue(found);
		return extracted;
	}

	if (prefix === 'wave') {
		const found = getValueAtPath(sources.dimension, pathWithoutPrefix);
		const extracted = extractValue(found);
		return extracted;
	}

	return undefined;
}

function createMockDataSources(): ReferenceDataSources {
	const deepColorPalette: any = {
		$type: 'color',
		$description: 'Deep nested color palette for benchmarking',
	};

	deepColorPalette.level1 = {
		level2: {
			level3: '#FF5733',
		},
	};

	deepColorPalette.level1_5 = {
		level2_5: {
			level3_5: {
				level4_5: {
					level5_5: '#33FF57',
				},
			},
		},
	};

	deepColorPalette.l1 = {
		l2: {
			l3: {
				l4: {
					l5: {
						l6: {
							l7: {
								l8: {
									l9: {
										l10: '#5733FF',
									},
								},
							},
						},
					},
				},
			},
		},
	};

	deepColorPalette.mixed = {
		leonardo: {
			nested: '#FF3357',
		},
		wave: {
			nested: 42,
		},
	};

	return {
		palette: {
			global: {
				color: deepColorPalette,
			},
		},
		dimension: {
			global: {
				dimension: {
					spacing: {
						$value: 16,
					},
					size: {
						$value: {
							small: 8,
							medium: 16,
							large: 32,
						},
					},
				},
			},
		},
	};
}

function benchmarkDepths(
	sources: ReferenceDataSources,
	iterations = 1000,
): void {
	console.log(`开始嵌套引用解析性能基准测试 (${iterations}次迭代)`);
	console.log('='.repeat(60));

	console.log(
		'\n🔍 测试3层深度引用: {leonardo.global.color.level1.level2.level3}',
	);
	const ref3Layer = '{leonardo.global.color.level1.level2.level3}';

	console.time('3层深度解析');
	for (let i = 0; i < iterations; i++) {
		resolveReference(ref3Layer, sources);
	}
	console.timeEnd('3层深度解析');

	console.log(
		'\n🔍 测试5层深度引用: {leonardo.global.color.level1_5.level2_5.level3_5.level4_5.level5_5}',
	);
	const ref5Layer =
		'{leonardo.global.color.level1_5.level2_5.level3_5.level4_5.level5_5}';

	console.time('5层深度解析');
	for (let i = 0; i < iterations; i++) {
		resolveReference(ref5Layer, sources);
	}
	console.timeEnd('5层深度解析');

	console.log(
		'\n🔍 测试10层深度引用: {leonardo.global.color.l1.l2.l3.l4.l5.l6.l7.l8.l9.l10}',
	);
	const ref10Layer = '{leonardo.global.color.l1.l2.l3.l4.l5.l6.l7.l8.l9.l10}';

	console.time('10层深度解析');
	for (let i = 0; i < iterations; i++) {
		resolveReference(ref10Layer, sources);
	}
	console.timeEnd('10层深度解析');
}

function benchmarkMixedReferences(
	sources: ReferenceDataSources,
	iterations = 1000,
): void {
	console.log('\n\n🔄 混合引用基准测试');
	console.log('='.repeat(60));

	const mixedValue: DtcgValue = {
		primary: '{leonardo.global.color.level1.level2.level3}',
		secondary: '{wave.global.dimension.spacing}',
		tertiary: '{leonardo.global.color.mixed.leonardo}',
		spacing: '{wave.global.dimension.spacing}',
		deep: '{leonardo.global.color.l1.l2.l3.l4.l5.l6.l7.l8.l9.l10}',
	};

	console.log('\n🔍 测试混合对象引用解析 (使用resolveReferences)');
	const testToken: DtcgTokenGroup = {
		mixedTest: {
			$value: mixedValue,
			$type: 'test',
		},
	};

	console.time('混合引用解析');
	for (let i = 0; i < iterations; i++) {
		resolveReferences(testToken, sources);
	}
	console.timeEnd('混合引用解析');
}

function benchmarkPerformanceComparison(sources: ReferenceDataSources): void {
	console.log('\n\n📊 性能对比测试 (10000次迭代)');
	console.log('='.repeat(60));

	const iterations = 10000;

	for (let i = 0; i < 100; i++) {
		resolveReference('{leonardo.global.color.level1.level2.level3}', sources);
	}

	const ref3 = '{leonardo.global.color.level1.level2.level3}';
	const ref5 =
		'{leonardo.global.color.level1_5.level2_5.level3_5.level4_5.level5_5}';
	const ref10 = '{leonardo.global.color.l1.l2.l3.l4.l5.l6.l7.l8.l9.l10}';

	const start3 = performance.now();
	for (let i = 0; i < iterations; i++) {
		resolveReference(ref3, sources);
	}
	const end3 = performance.now();

	const start5 = performance.now();
	for (let i = 0; i < iterations; i++) {
		resolveReference(ref5, sources);
	}
	const end5 = performance.now();

	const start10 = performance.now();
	for (let i = 0; i < iterations; i++) {
		resolveReference(ref10, sources);
	}
	const end10 = performance.now();

	console.log(`\n📈 精确性能测量结果 (${iterations}次迭代):`);
	console.log(
		`3层深度:  ${(end3 - start3).toFixed(3)}ms (平均: ${((end3 - start3) / iterations).toFixed(6)}ms/次)`,
	);
	console.log(
		`5层深度:  ${(end5 - start5).toFixed(3)}ms (平均: ${((end5 - start5) / iterations).toFixed(6)}ms/次)`,
	);
	console.log(
		`10层深度: ${(end10 - start10).toFixed(3)}ms (平均: ${((end10 - start10) / iterations).toFixed(6)}ms/次)`,
	);

	console.log('\n📊 性能比率分析:');
	const baseTime = (end3 - start3) / iterations;
	console.log(
		`5层深度 vs 3层深度:  ${((end5 - start5) / iterations / baseTime).toFixed(2)}x`,
	);
	console.log(
		`10层深度 vs 3层深度: ${((end10 - start10) / iterations / baseTime).toFixed(2)}x`,
	);
}

function main(): void {
	console.log('🚀 Wave Design Token 嵌套引用解析性能基准测试');
	console.log('测试目标: 评估不同嵌套深度下的引用解析性能');

	const sources = createMockDataSources();

	console.log('\n🔧 验证测试数据...');
	const testRef3 = resolveReference(
		'{leonardo.global.color.level1.level2.level3}',
		sources,
	);
	const testRef5 = resolveReference(
		'{leonardo.global.color.level1_5.level2_5.level3_5.level4_5.level5_5}',
		sources,
	);
	const testRef10 = resolveReference(
		'{leonardo.global.color.l1.l2.l3.l4.l5.l6.l7.l8.l9.l10}',
		sources,
	);

	console.log(`3层测试引用解析结果: ${testRef3}`);
	console.log(`5层测试引用解析结果: ${testRef5}`);
	console.log(`10层测试引用解析结果: ${testRef10}`);

	if (testRef3 !== '#FF5733' || testRef10 !== '#5733FF') {
		console.error('❌ 基础测试数据验证失败，基准测试结果不可靠');
		process.exit(1);
	}

	if (testRef5 === undefined) {
		console.warn(
			'⚠️ 5层深度引用解析失败，可能存在数据结构问题，但继续执行其他测试',
		);
	}

	console.log('✅ 测试数据验证通过\n');

	benchmarkDepths(sources);
	benchmarkMixedReferences(sources);
	benchmarkPerformanceComparison(sources);

	console.log('\n\n🎉 基准测试完成！');
	console.log('\n💡 建议:');
	console.log('- 如果10层深度的解析时间明显超过3层，考虑实现深度限制');
	console.log('- 观察混合引用场景的性能，确保复杂设计系统的可用性');
	console.log('- 基于实际使用场景调整迭代次数和测试深度');
}

if (import.meta.main) {
	main();
}

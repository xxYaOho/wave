import * as yaml from 'js-yaml';
import type { SyntheticDesignTokenOptions } from './types.ts';

export const DEFAULT_SYNTHETIC_SEED = 20260620;

export const SYNTHETIC_MIXED_1000: SyntheticDesignTokenOptions = {
	seed: DEFAULT_SYNTHETIC_SEED,
	tokenCount: 1000,
	typeRatio: {
		color: 0.6,
		dimension: 0.2,
		shadow: 0.1,
		gradient: 0.05,
		composite: 0.05,
	},
	referenceRatio: 0.35,
	internalReferenceRatio: 0.25,
	externalReferenceRatio: 0.1,
	sketchExtensionRatio: 0.2,
	inheritColorRatio: 0.05,
	smoothShadowRatio: 0.05,
	maxReferenceDepth: 5,
	platforms: ['json', 'css', 'sketch'],
	filterLayer: 1,
	includeNight: false,
	includeVariants: false,
};

export const SYNTHETIC_MIXED_5000: SyntheticDesignTokenOptions = {
	...SYNTHETIC_MIXED_1000,
	tokenCount: 5000,
};

export const SYNTHETIC_DEEP_REFERENCE: SyntheticDesignTokenOptions = {
	...SYNTHETIC_MIXED_1000,
	tokenCount: 300,
	referenceRatio: 0.75,
	internalReferenceRatio: 0.65,
	externalReferenceRatio: 0.1,
	maxReferenceDepth: 10,
};

interface RandomSource {
	next(): number;
}

function createRandom(seed: number): RandomSource {
	let state = seed >>> 0;
	return {
		next(): number {
			state = (state * 1664525 + 1013904223) >>> 0;
			return state / 0x100000000;
		},
	};
}

function countFor(total: number, ratio: number): number {
	return Math.max(0, Math.floor(total * ratio));
}

function hexColor(index: number): string {
	const value = (index * 2654435761) >>> 0;
	return `#${(value & 0xffffff).toString(16).padStart(6, '0')}`;
}

function shouldApply(random: RandomSource, ratio: number): boolean {
	return random.next() < ratio;
}

function buildColorToken(
	index: number,
	random: RandomSource,
	options: SyntheticDesignTokenOptions,
): Record<string, unknown> {
	const token: Record<string, unknown> = {
		$type: 'color',
		$value:
			index > 0 && shouldApply(random, options.internalReferenceRatio)
				? `{theme.color.scale.c${Math.max(0, index - 1)}}`
				: shouldApply(random, options.externalReferenceRatio)
					? '{tailwindcss.color.indigo.600}'
					: hexColor(index),
	};

	if (shouldApply(random, options.sketchExtensionRatio)) {
		token.$extensions = {
			sketch: {
				path: `synthetic/color/group-${index % 10}`,
			},
		};
	}

	if (shouldApply(random, options.inheritColorRatio)) {
		token.$extensions = {
			...((token.$extensions as Record<string, unknown> | undefined) ?? {}),
			inheritColor: {
				property: {
					opacity: 0.5,
				},
			},
		};
	}

	return token;
}

function buildDimensionToken(
	index: number,
	random: RandomSource,
	options: SyntheticDesignTokenOptions,
): Record<string, unknown> {
	const token: Record<string, unknown> = {
		$type: 'dimension',
		$value: index % 4 === 0 ? `${index + 1}px` : index + 1,
	};

	if (shouldApply(random, options.sketchExtensionRatio)) {
		token.$extensions = {
			sketch: {
				path: `synthetic/dimension/group-${index % 10}`,
				property: {
					cornerRadius: true,
				},
			},
		};
	}

	return token;
}

function buildShadowToken(
	index: number,
	random: RandomSource,
	options: SyntheticDesignTokenOptions,
): Record<string, unknown> {
	const token: Record<string, unknown> = {
		$type: 'shadow',
		$value: {
			color: {
				$ref: '#/theme/color/scale/c0/$value',
				alpha: 0.16,
			},
			offsetX: 0,
			offsetY: index % 8,
			blur: 2 + (index % 16),
			spread: 0,
		},
	};

	if (shouldApply(random, options.smoothShadowRatio)) {
		token.$extensions = {
			smoothShadow: {
				cubicBezier: '{wave.dimension.cubicBezier.easeInQuad}',
				step: 4,
				target: {
					alpha: 0.04,
					offsetX: 0,
					offsetY: 4,
					blur: 12,
					spread: -2,
				},
			},
		};
	}

	return token;
}

function buildGradientToken(index: number): Record<string, unknown> {
	return {
		$type: 'gradient',
		$value: [
			{
				color: `{theme.color.scale.c${index % 10}}`,
				position: 0,
			},
			{
				color: `{theme.color.scale.c${(index + 1) % 10}}`,
				position: 1,
			},
		],
	};
}

function buildCompositeToken(index: number): Record<string, unknown> {
	return {
		$type: 'color',
		$extensions: {
			composite: true,
		},
		background: {
			$value: `{theme.color.scale.c${index % 10}}`,
		},
		foreground: {
			$value: `{theme.color.scale.c${(index + 5) % 10}}`,
		},
	};
}

function buildDeepReferences(depth: number): Record<string, unknown> {
	const chain: Record<string, unknown> = {};
	for (let i = 0; i <= depth; i++) {
		chain[`d${i}`] = {
			$type: 'color',
			$value: i === 0 ? '#1872f0' : `{theme.color.deep.d${Math.max(0, i - 1)}}`,
		};
	}
	return chain;
}

export function createSyntheticMainYaml(
	options: SyntheticDesignTokenOptions,
): string {
	const random = createRandom(options.seed);
	const colorCount = countFor(options.tokenCount, options.typeRatio.color);
	const dimensionCount = countFor(
		options.tokenCount,
		options.typeRatio.dimension,
	);
	const shadowCount = countFor(options.tokenCount, options.typeRatio.shadow);
	const gradientCount = countFor(
		options.tokenCount,
		options.typeRatio.gradient,
	);
	const compositeCount = Math.max(
		0,
		options.tokenCount -
			colorCount -
			dimensionCount -
			shadowCount -
			gradientCount,
	);

	const colorScale: Record<string, unknown> = {};
	for (let i = 0; i < colorCount; i++) {
		colorScale[`c${i}`] = buildColorToken(i, random, options);
	}

	const dimensions: Record<string, unknown> = {};
	for (let i = 0; i < dimensionCount; i++) {
		dimensions[`d${i}`] = buildDimensionToken(i, random, options);
	}

	const shadows: Record<string, unknown> = {};
	for (let i = 0; i < shadowCount; i++) {
		shadows[`s${i}`] = buildShadowToken(i, random, options);
	}

	const gradients: Record<string, unknown> = {};
	for (let i = 0; i < gradientCount; i++) {
		gradients[`g${i}`] = buildGradientToken(i);
	}

	const composites: Record<string, unknown> = {};
	for (let i = 0; i < compositeCount; i++) {
		composites[`component${i}`] = buildCompositeToken(i);
	}

	const document = {
		$schema: 'https://www.designtokens.org/tr/2025.10/format/',
		$config: {
			theme: `synthetic-${options.tokenCount}`,
			resource: {
				palette: ['./resources/tailwindcss.yaml'],
				dimension: ['./resources/wave.yaml'],
			},
			parameter: {
				outputDir: './theme',
				platform: options.platforms,
				filterLayer: options.filterLayer,
				night: options.includeNight,
				variants: options.includeVariants,
			},
		},
		theme: {
			color: {
				scale: colorScale,
				deep: buildDeepReferences(options.maxReferenceDepth),
			},
			dimension: dimensions,
			style: {
				shadow: shadows,
				gradient: gradients,
			},
			component: composites,
		},
	};

	return yaml.dump(document, { lineWidth: -1 });
}

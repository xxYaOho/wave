import chroma from 'chroma-js';
import {
	type ContrastEvaluationResult,
	type DoctorScoreLine,
	isDtcgColorSpaceValue,
} from '../../types/index.ts';

function resolveColorToChroma(
	value: unknown,
): { color: chroma.Color; alpha: number } | null {
	if (typeof value === 'string') {
		if (value.startsWith('#')) {
			try {
				const color = chroma(value);
				const hex = value.replace('#', '');
				let alpha = 1;
				if (hex.length === 4 || hex.length === 8) {
					const alphaHex =
						hex.length === 4 ? hex[3]! + hex[3]! : hex.slice(6, 8);
					alpha = parseInt(alphaHex, 16) / 255;
				}
				return { color, alpha };
			} catch {
				return null;
			}
		}
		try {
			const color = chroma(value);
			return { color, alpha: color.alpha() };
		} catch {
			return null;
		}
	}

	if (isDtcgColorSpaceValue(value)) {
		try {
			let color: chroma.Color;
			const [a, b, c] = value.components;
			switch (value.colorSpace) {
				case 'oklch':
					color = chroma.oklch(a, b, c);
					break;
				case 'srgb':
					color = chroma.rgb(a * 255, b * 255, c * 255);
					break;
				case 'hsl':
					color = chroma.hsl(a, b / 100, c / 100);
					break;
				default:
					return null;
			}
			return { color, alpha: value.alpha ?? 1 };
		} catch {
			return null;
		}
	}

	return null;
}

function computeRatio(
	background: chroma.Color,
	foreground: chroma.Color,
): number {
	const l1 = background.luminance();
	const l2 = foreground.luminance();
	const lighter = Math.max(l1, l2);
	const darker = Math.min(l1, l2);
	return (lighter + 0.05) / (darker + 0.05);
}

const THRESHOLDS: Record<string, Record<string, number>> = {
	'Normal Text': { AA: 4.5, AAA: 7 },
	'Large Text': { AA: 3, AAA: 4.5 },
	'UI Components': { AA: 3 },
};

export function evaluateContrast(
	backgroundValue: unknown,
	foregroundValue: unknown,
): ContrastEvaluationResult {
	const bg = resolveColorToChroma(backgroundValue);
	if (!bg) {
		return { success: false, error: 'Invalid background color value' };
	}

	const fg = resolveColorToChroma(foregroundValue);
	if (!fg) {
		return { success: false, error: 'Invalid foreground color value' };
	}

	if (bg.alpha < 1 || fg.alpha < 1) {
		return { success: false, error: 'alpha < 1 not supported in v1' };
	}

	const ratio = computeRatio(bg.color, fg.color);

	const scores: DoctorScoreLine[] = [];

	const normalAA = ratio >= THRESHOLDS['Normal Text'].AA;
	const normalAAA = ratio >= THRESHOLDS['Normal Text'].AAA;
	scores.push({ dimension: 'Normal Text', level: 'AA', pass: normalAA });
	scores.push({ dimension: 'Normal Text', level: 'AAA', pass: normalAAA });

	const largeAA = ratio >= THRESHOLDS['Large Text'].AA;
	const largeAAA = ratio >= THRESHOLDS['Large Text'].AAA;
	scores.push({ dimension: 'Large Text', level: 'AA', pass: largeAA });
	scores.push({ dimension: 'Large Text', level: 'AAA', pass: largeAAA });

	const uiAA = ratio >= THRESHOLDS['UI Components'].AA;
	scores.push({ dimension: 'UI Components', level: 'AA', pass: uiAA });

	return { success: true, ratio, scores };
}

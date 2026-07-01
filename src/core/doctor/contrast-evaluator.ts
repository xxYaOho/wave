import chroma from 'chroma-js';
import type {
	ContrastEvaluationResult,
	DoctorScoreLine,
} from '../../types/index.ts';
import { normalizeColorValue } from '../transformer/color-value.ts';

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

	if (typeof value === 'object' && value !== null) {
		try {
			const normalized = normalizeColorValue(value, 'hex');
			const color = chroma(normalized.value);
			return { color, alpha: normalized.alpha };
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

	const normalAA = ratio >= 4.5;
	const normalAAA = ratio >= 7;
	scores.push({ dimension: 'Normal Text', level: 'AA', pass: normalAA });
	scores.push({ dimension: 'Normal Text', level: 'AAA', pass: normalAAA });

	const largeAA = ratio >= 3;
	const largeAAA = ratio >= 4.5;
	scores.push({ dimension: 'Large Text', level: 'AA', pass: largeAA });
	scores.push({ dimension: 'Large Text', level: 'AAA', pass: largeAAA });

	const uiAA = ratio >= 3;
	scores.push({ dimension: 'UI Components', level: 'AA', pass: uiAA });

	return { success: true, ratio, scores };
}

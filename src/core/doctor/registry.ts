import type {
	DoctorFinding,
	DoctorRunResult,
	DoctorThemeReport,
	ResolvedTokenGroup,
} from '../../types/index.ts';
import { evaluateContrast } from './contrast-evaluator.ts';
import { extractDoctorPairs } from './pair-extractor.ts';

function lookupResolved(tree: ResolvedTokenGroup, path: string): unknown {
	const parts = path.split('.');
	let current: unknown = tree;
	for (const part of parts) {
		if (typeof current !== 'object' || current === null) return undefined;
		current = (current as Record<string, unknown>)[part];
	}
	return current;
}

export async function runThemeContrastCheck(context: {
	resolvedTree: ResolvedTokenGroup;
	doctorConfig?: Record<string, unknown>;
}): Promise<DoctorRunResult> {
	if (!context.doctorConfig) {
		return { ok: true, blockingErrors: [], reports: [] };
	}

	const { pairs, errors } = extractDoctorPairs(
		context.doctorConfig,
		context.resolvedTree,
	);

	if (errors.length > 0) {
		return { ok: false, blockingErrors: errors, reports: [] };
	}

	const reports: DoctorThemeReport[] = [];
	const blockingErrors: DoctorFinding[] = [];

	for (const pair of pairs) {
		const bgNode = lookupResolved(context.resolvedTree, pair.backgroundPath);
		const fgNode = lookupResolved(context.resolvedTree, pair.foregroundPath);
		const bgValue =
			typeof bgNode === 'object' && bgNode !== null
				? (bgNode as Record<string, unknown>).$value
				: undefined;
		const fgValue =
			typeof fgNode === 'object' && fgNode !== null
				? (fgNode as Record<string, unknown>).$value
				: undefined;

		const evalResult = evaluateContrast(bgValue, fgValue);
		if (!evalResult.success) {
			blockingErrors.push({
				level: 'error',
				message: evalResult.error || 'Contrast evaluation failed',
				pair,
			});
			continue;
		}

		reports.push({
			pair,
			ratio: evalResult.ratio!,
			scores: evalResult.scores!,
			findings: [],
		});
	}

	if (blockingErrors.length > 0) {
		return { ok: false, blockingErrors, reports };
	}

	return { ok: true, blockingErrors: [], reports };
}

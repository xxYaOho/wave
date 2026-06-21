import type { QualityHarnessMode } from '../shared/types.ts';

export type DesignTokenEntryKind = 'main-config' | 'themefile-legacy';

export interface SyntheticDesignTokenOptions {
	seed: number;
	tokenCount: number;
	typeRatio: {
		color: number;
		dimension: number;
		shadow: number;
		gradient: number;
		composite: number;
	};
	referenceRatio: number;
	internalReferenceRatio: number;
	externalReferenceRatio: number;
	sketchExtensionRatio: number;
	inheritColorRatio: number;
	smoothShadowRatio: number;
	maxReferenceDepth: number;
	platforms: string[];
	filterLayer: number;
	includeNight: boolean;
	includeVariants: boolean;
}

export interface DesignTokenCase {
	id: string;
	caseVersion: number;
	suites: QualityHarnessMode[];
	entryKind: DesignTokenEntryKind;
	source:
		| {
				kind: 'fixture';
				path: string;
		  }
		| {
				kind: 'synthetic';
				options: SyntheticDesignTokenOptions;
		  };
	platforms: string[];
	filterLayer: number;
	includeNight: boolean;
	includeVariants: boolean;
	compareDurations: boolean;
}

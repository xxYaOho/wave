import type { QualityHarnessMode } from '../shared/types.ts';

export type DesignTokenEntryKind = 'main-config' | 'themefile-legacy';

export type DesignTokenCaseOrigin =
	| 'synthetic'
	| 'internal-fixture'
	| 'example-derived';

export interface ExampleTrace {
	sourceName: string;
	capturedFrom?: string;
	reason: string;
	risks: string[];
}

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
	includeProfiles: boolean;
}

export interface DesignTokenCase {
	id: string;
	caseVersion: number;
	suites: QualityHarnessMode[];
	entryKind: DesignTokenEntryKind;
	origin: DesignTokenCaseOrigin;
	example?: ExampleTrace;
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
	includeProfiles: boolean;
	compareDurations: boolean;
}

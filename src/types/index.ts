export const ExitCode = {
	SUCCESS: 0,
	GENERAL_ERROR: 1,
	INVALID_COMMAND: 2,
	THEME_NOT_FOUND: 3,
	MISSING_PARAMETER: 4,
	INVALID_PARAMETER: 5,
	FILE_NOT_FOUND: 10,
	PERMISSION_DENIED: 11,
	FORMAT_ERROR: 12,
	INVALID_RESOURCE: 13,
	MISSING_BRAND: 14,
	BRAND_FORMAT_ERROR: 15,
} as const;

export type ExitCodeType = (typeof ExitCode)[keyof typeof ExitCode];

export interface ResourceDeclaration {
	kind: string;
	ref: string;
}

/** 参数键值对，key 不限制，value 统一为 string */
export interface ParameterSet {
	[key: string]: string | undefined;
}

/** 合并全局参数与组参数后，解析出的构建参数 */
export interface ResolvedGroupParameters {
	groupName?: string;
	platforms: string[];
	filterLayer: number | undefined;
	colorSpace: ColorSpaceFormat | undefined;
	outputDir: string;
}

export interface DesignTokenBuildConfig {
	theme: string;
	parameter: ParameterSet;
	resources: ResourceDeclaration[];
	parameterGroups: ParameterGroup[];
}

export interface ParameterGroup {
	name: string;
	parameter: ParameterSet;
}

export type ResourceType = 'palette' | 'dimension' | 'brand';

export interface ResolvedResource {
	path: string;
	isBuiltin: boolean;
	exists: boolean;
}

export interface DetectionResult {
	available: boolean;
	files: string[];
	message: string;
}

export interface GenerateOptions {
	night: boolean;
	profile?: string | undefined;
	profiles?: 'all' | undefined;
	brand?: string | undefined;
	platform?: string[];
	colorSpace?: ColorSpaceFormat;
}

export interface ThemeInfo {
	name: string;
	path: string;
	hasNight: boolean;
	profiles: string[];
}

export interface DoctorCheck {
	name: string;
	check: () => Promise<CheckResult>;
}

export interface CheckResult {
	success: boolean;
	message: string;
	suggestion?: string;
}

export type DoctorFindingLevel = 'error' | 'warning' | 'info';

export interface DoctorFinding {
	level: DoctorFindingLevel;
	message: string;
	path?: string;
	pair?: DoctorNamedPair;
}

export interface DoctorNamedPair {
	name: string;
	foregroundPath: string;
	backgroundPath: string;
}

export interface DoctorScoreLine {
	dimension: 'Normal Text' | 'Large Text' | 'UI Components';
	level: 'AA' | 'AAA';
	pass: boolean;
}

export interface DoctorThemeReport {
	pair: DoctorNamedPair;
	ratio: number;
	scores: DoctorScoreLine[];
	findings: DoctorFinding[];
}

export interface DoctorRunResult {
	ok: boolean;
	blockingErrors: DoctorFinding[];
	reports: DoctorThemeReport[];
}

export interface ContrastEvaluationResult {
	success: boolean;
	ratio?: number;
	scores?: DoctorScoreLine[];
	error?: string;
}

export interface WaveConfig {
	version: string;
	defaultOutput: string;
	defaultPlatform: string[];
}

export interface ParseError {
	line: number;
	message: string;
}

export interface PaletteResult {
	name: string;
	color: ColorPalette;
}

export interface ColorPalette {
	$type: string;
	$description?: string;
	$extensions?: {
		light?: Record<string, string | number>;
		dark?: Record<string, string | number>;
	};
	[colorName: string]: unknown;
}

export interface DimensionValue {
	$description?: string;
	$type?: string;
	$value: string | number;
}

export interface DimensionScale {
	$description?: string;
	$type?: string;
	[key: string]: DimensionValue | string | number | undefined;
}

export interface DimensionCategory {
	[dimensionName: string]:
		| DimensionValue
		| DimensionScale
		| string
		| number
		| undefined;
}

export interface DimensionResult {
	name: string;
	dimension: Record<string, DimensionCategory>;
}

export interface BuiltinPalette {
	[paletteName: string]: {
		color?: {
			$type: string;
			$description?: string;
			[colorName: string]: unknown;
		};
	};
}

export interface BuiltinDimension {
	[dimensionName: string]: {
		dimension?: {
			[dimensionKey: string]: {
				$description?: string;
				$type?: string;
				$value?: unknown;
				[scaleName: string]: unknown;
			};
		};
	};
}

// DTCG types

export type DtcgScalarValue = string | number | boolean;
export type DtcgObjectValue = {
	[key: string]: DtcgValue | undefined;
};

// DTCG $ref 引用类型 - 允许 $ref 与其他属性共存
export interface DtcgRefValue {
	$ref: string;
	[key: string]: DtcgValue | undefined;
}

export type DtcgValue =
	| DtcgScalarValue
	| DtcgObjectValue
	| DtcgRefValue
	| DtcgValue[];

export interface DtcgDimensionValue {
	value: number;
	unit: 'px' | 'rem';
}

export interface DtcgDurationValue {
	value: number;
	unit: 'ms' | 's';
}

export type DtcgStrokeLineCap = 'round' | 'butt' | 'square';
export type DtcgStrokeStyleName =
	| 'solid'
	| 'dashed'
	| 'dotted'
	| 'double'
	| 'groove'
	| 'ridge'
	| 'outset'
	| 'inset';

export interface DtcgCustomStrokeStyleValue {
	dashArray: DtcgValue[];
	lineCap: DtcgStrokeLineCap;
}

export type DtcgStrokeStyleValue =
	| DtcgStrokeStyleName
	| DtcgCustomStrokeStyleValue;

export interface DtcgBorderValue {
	color: DtcgValue;
	width: DtcgValue;
	style: DtcgValue;
}

export interface DtcgTransitionValue {
	duration: DtcgValue;
	delay: DtcgValue;
	timingFunction: DtcgValue;
}

export interface WaveTypographyValue {
	fontFamily?: string | string[];
	fontSize?: DtcgValue;
	fontWeight?: DtcgValue;
	letterSpacing?: DtcgValue;
	lineHeight?: DtcgValue;
	color?: DtcgValue;
}

export type TypographyDefaults = Omit<WaveTypographyValue, 'color'>;

export interface DtcgToken {
	$value: DtcgValue;
	$type?: string;
	$description?: string;
	$deprecated?: boolean | string;
	/**
	 * Token-level identity. Three states: key absent (unregistered), null or
	 * empty/whitespace string (pre-declared empty slot), non-empty string
	 * (identity of any form).
	 */
	$id?: string | null;
	$extensions?: Record<string, unknown>;
}

export type DtcgTokenNode = DtcgToken | DtcgTokenGroup | string | number;

export interface DtcgTokenGroup {
	$extends?: string;
	$type?: string;
	$description?: string;
	$extensions?: Record<string, unknown>;
	[key: string]:
		| DtcgTokenNode
		| Record<string, unknown>
		| string
		| number
		| boolean
		| undefined;
}

export interface ThemeYamlResult {
	raw: DtcgTokenGroup;
}

// Theme document processing result types (CQ-001 fix)
export type ThemeDocumentFailureReason =
	| 'file_not_found'
	| 'parse_error'
	| 'schema_error'
	| 'circular_reference'
	| 'unresolved_reference';

export interface ThemeDocumentFailure {
	ok: false;
	reason: ThemeDocumentFailureReason;
	message: string;
	exitCode: ExitCodeType;
	line?: number;
}

export interface ThemeDocumentSuccess {
	ok: true;
	tree: WaveToken[];
	order: string[];
	groupComments: Record<string, string>;
	resolved: ResolvedTokenGroup;
}

export type ThemeDocumentResult = ThemeDocumentSuccess | ThemeDocumentFailure;

export interface ReferenceDataSources {
	[namespace: string]: unknown;
}

export interface ResolvedDtcgToken {
	$value: DtcgValue;
	$type?: string;
	$description?: string;
	$deprecated?: boolean | string;
	/** Token identity carried through resolution; see DtcgToken.$id. */
	$id?: string | null;
	$extensions?: Record<string, unknown>;
	_swatchName?: string;
	/** Direct reference authored at a composite token's `$value.color`. */
	_colorReference?: string;
}

export interface ResolvedTokenGroup {
	$type?: string;
	$description?: string;
	$extensions?: Record<string, unknown>;
	[key: string]:
		| ResolvedDtcgToken
		| ResolvedTokenGroup
		| Record<string, unknown>
		| string
		| number
		| boolean
		| undefined;
}

export interface SketchPropertyMap {
	opacity?: true;
	cornerRadius?: true;
}

/**
 * Sketch payload v2 asset kinds (sync-token protocol 10a/10b).
 * color -> Swatch, text -> Shared Text Style, layer -> Shared Layer Style.
 */
export type SketchAssetKind = 'color' | 'text' | 'layer';

/** Color position: HEX8 snapshot; alpha overrides stay folded into the hex. */
export type SketchColorSlot = string;

export interface SketchColorAsset {
	uuid?: string;
	name: string;
	kind: 'color';
	/** HEX8; alpha overrides stay folded into the hex snapshot. */
	color: string;
}

export interface SketchTextPayload {
	fontFamily?: string;
	fontSize: number;
	/** 100-900 integer-hundred scale only (sketch pass platform contract). */
	fontWeight: number;
	lineHeight: number;
	kerning: number;
}

export interface SketchTextAsset {
	uuid?: string;
	name: string;
	kind: 'text';
	text: SketchTextPayload;
}

export interface SketchLayerShadow {
	x: number;
	y: number;
	blur: number;
	spread: number;
	color: SketchColorSlot;
	inset?: boolean;
}

export interface SketchLayerGradientStop {
	color: SketchColorSlot;
	position: number;
}

export interface SketchLayerAsset {
	uuid?: string;
	name: string;
	kind: 'layer';
	/** Protocol-reserved; wave currently has no producer. */
	fills?: Array<{ color: SketchColorSlot; fillType: 'solid' }>;
	shadows?: SketchLayerShadow[];
	gradient?: SketchLayerGradientStop[];
	opacity?: number;
	corners?: { radii: number };
}

export type SketchAsset = SketchColorAsset | SketchTextAsset | SketchLayerAsset;

export interface SketchPayloadMeta {
	/** Identity of the current day document; null when unregistered. */
	themeId: string | null;
	/**
	 * Series grouping key for Token Manage (`currentByBaseId`).
	 * Named profiles use the main document identity; main uses its own
	 * themeId (or `$config.theme` stem when unregistered). Never null when
	 * the pipeline can derive a concrete series id.
	 */
	baseId: string | null;
	version: 2;
}

export interface SketchPayloadV2 {
	meta: SketchPayloadMeta;
	assets: SketchAsset[];
}

export interface SketchExtension {
	path?: string;
	property?: SketchPropertyMap;
	skip?: boolean;
}

/**
 * Wave-native flat token shape produced by the transformer and consumed by formats.
 * The single source of truth for the data model that crosses layer boundaries.
 */
export interface WaveToken {
	/** kebab-case identifier joined from path, e.g. "theme-color-primary-main" */
	name: string;
	/** original path segments from the resolved tree */
	path: string[];
	/** processed value (after color-space conversion, smoothShadow expansion, ...) */
	value: unknown;
	/** DTCG $type or inherited group $type (color | shadow | gradient | dimension | ...) */
	type?: string;
	/**
	 * Source-side token identity from `$id`, carried through the resolver.
	 * Present only for non-empty identities; empty slots stay a source-level
	 * concern and never surface as `id`.
	 */
	id?: string;
	/** $description copied from the source token */
	comment?: string;
	/** $deprecated flag */
	deprecated?: string | boolean;
	/** stable emit order assigned by the transformer (used for sorting) */
	_order: number;
	/** composite group path; sibling tokens with the same value are grouped on output */
	_composite?: string;
	/** normalized Sketch-specific output hints */
	_sketch?: SketchExtension;
	/** outline metadata for border tokens */
	_outline?: { offset: number };
	/** original referenced token path for Sketch variable swatch mapping */
	_swatchName?: string;
	/** direct reference authored at a composite token's color field */
	_colorReference?: string;
	/** requested output color space retained when a DTCG color object cannot be converted */
	_targetColorSpace?: ColorSpaceFormat;
	/** formatter-ready typography color in the active target color space */
	_typographyColor?: string;
	/** resolved root typography rem base, retained for platform formatters only */
	_typographyBaseFontSize?: number;
	/** inheritColor metadata */
	inheritColor?: boolean;
	inheritColorOpacity?: number;
	inheritColorAlpha?: number;
	inheritColorSiblingSlot?: string;
	/** @deprecated legacy currentColor metadata; prefer inheritColor */
	currentColorOpacity?: number;
	/** @deprecated legacy currentColor metadata; prefer inheritColor */
	currentColorShadowAlpha?: number;
}

/**
 * Signature of a wave format function: takes the flat token list plus an opaque
 * options bag, returns the serialized output (json / css / sketch json / ...).
 */
export type WaveFormatFn = (
	tokens: WaveToken[],
	options?: Record<string, unknown>,
) => string;

export function isDtcgToken(node: unknown): node is DtcgToken {
	return (
		typeof node === 'object' &&
		node !== null &&
		'$value' in node &&
		!Array.isArray(node)
	);
}

// 类型守卫函数：检查是否为 DTCG $ref 引用
export function isDtcgRefValue(value: unknown): value is DtcgRefValue {
	return (
		typeof value === 'object' &&
		value !== null &&
		'$ref' in value &&
		typeof (value as Record<string, unknown>).$ref === 'string'
	);
}

export function isResolvedToken(node: unknown): node is ResolvedDtcgToken {
	return (
		typeof node === 'object' &&
		node !== null &&
		'$value' in node &&
		!Array.isArray(node)
	);
}

export type ComputableColorSpaceType = 'oklch' | 'srgb' | 'hsl';
export type DtcgColorSpaceType =
	| ComputableColorSpaceType
	| 'srgb-linear'
	| 'hwb'
	| 'lab'
	| 'lch'
	| 'oklab'
	| 'display-p3'
	| 'a98-rgb'
	| 'prophoto-rgb'
	| 'rec2020'
	| 'xyz-d65'
	| 'xyz-d50';
export type ColorSpaceType = ComputableColorSpaceType;
export type ColorSpaceFormat = 'hex' | ComputableColorSpaceType;
export type DtcgColorComponent = number | 'none';

export interface DtcgColorSpaceValue {
	colorSpace: DtcgColorSpaceType;
	components: DtcgColorComponent[];
	alpha?: number;
	hex?: string;
}

export function isDtcgColorSpaceValue(
	value: unknown,
): value is DtcgColorSpaceValue {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const obj = value as Record<string, unknown>;
	const supportedSpaces: DtcgColorSpaceType[] = [
		'oklch',
		'srgb',
		'hsl',
		'srgb-linear',
		'hwb',
		'lab',
		'lch',
		'oklab',
		'display-p3',
		'a98-rgb',
		'prophoto-rgb',
		'rec2020',
		'xyz-d65',
		'xyz-d50',
	];
	return (
		'colorSpace' in obj &&
		'components' in obj &&
		typeof obj.colorSpace === 'string' &&
		supportedSpaces.includes(obj.colorSpace as DtcgColorSpaceType) &&
		Array.isArray(obj.components) &&
		obj.components.every((c) => typeof c === 'number' || c === 'none')
	);
}

// Shadow 相关类型
export interface DtcgShadowLayer {
	color: DtcgValue;
	offsetX: DtcgValue | { value: number; unit?: string };
	offsetY: DtcgValue | { value: number; unit?: string };
	blur: DtcgValue | { value: number; unit?: string };
	spread: DtcgValue | { value: number; unit?: string };
	inset?: boolean;
}

export type DtcgShadowValue = DtcgShadowLayer | DtcgShadowLayer[];

// Gradient 相关类型
export interface DtcgGradientStop {
	color: DtcgValue;
	position: number;
}

export type DtcgGradientValue = DtcgGradientStop[];

// 类型守卫函数：检查是否为 Shadow Layer
export function isDtcgShadowLayer(value: unknown): value is DtcgShadowLayer {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const obj = value as Record<string, unknown>;
	return (
		'color' in obj &&
		('offsetX' in obj || 'offsetY' in obj || 'blur' in obj || 'spread' in obj)
	);
}

// 类型守卫函数：检查是否为 Gradient Stop
export function isDtcgGradientStop(value: unknown): value is DtcgGradientStop {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const obj = value as Record<string, unknown>;
	return (
		'color' in obj && 'position' in obj && typeof obj.position === 'number'
	);
}

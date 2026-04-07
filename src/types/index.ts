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

export interface ParsedThemefile {
  THEME: string;
  PARAMETER: {
    night?: 'auto' | 'false';
    variants?: string;
    output?: string;
    platform?: string;
    brand?: string;
    filterLayer?: number | string;
    colorSpace?: ColorSpaceFormat;
  };
  resources: ResourceDeclaration[];
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
  variants?: string[] | undefined;
  brand?: string | undefined;
  platform?: string[];
  colorSpace?: ColorSpaceFormat;
}

export interface ThemeInfo {
  name: string;
  path: string;
  hasNight: boolean;
  variants: string[];
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
        [variantName: string]: unknown;
      };
    };
  };
}

// DTCG types

export type DtcgScalarValue = string | number | boolean;
export type DtcgObjectValue = Record<string, DtcgScalarValue | DtcgScalarValue[]>;

// DTCG $ref 引用类型 - 允许 $ref 与其他属性共存
export interface DtcgRefValue {
  $ref: string;
  [key: string]: DtcgScalarValue | DtcgScalarValue[] | undefined;
}

export type DtcgValue = DtcgScalarValue | DtcgObjectValue | DtcgRefValue | DtcgValue[];

export interface DtcgToken {
  $value: DtcgValue;
  $type?: string;
  $description?: string;
  $deprecated?: boolean | string;
  $extensions?: Record<string, unknown>;
}

export type DtcgTokenNode = DtcgToken | DtcgTokenGroup | string | number;

export interface DtcgTokenGroup {
  $type?: string;
  $description?: string;
  [key: string]: DtcgTokenNode | string | number | boolean | undefined;
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
  tree: SdTokenTree;
  order: string[];
  groupComments: Record<string, string>;
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
  $extensions?: Record<string, unknown>;
}

export interface ResolvedTokenGroup {
  $type?: string;
  $description?: string;
  [key: string]: ResolvedDtcgToken | ResolvedTokenGroup | string | number | boolean | undefined;
}

export interface SdTokenValue {
  value: DtcgValue;
  type?: string;
  comment?: string;
  deprecated?: string | boolean;
  _order?: number;
  currentColorOpacity?: number;
}

export type SdTokenTree = {
  [key: string]: SdTokenValue | SdTokenTree;
};

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

export type ColorSpaceType = 'oklch' | 'srgb' | 'hsl';
export type ColorSpaceFormat = 'hex' | ColorSpaceType;

export interface DtcgColorSpaceValue {
  colorSpace: ColorSpaceType;
  components: number[];
  alpha?: number;
  hex?: string;
}

export function isDtcgColorSpaceValue(value: unknown): value is DtcgColorSpaceValue {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    'colorSpace' in obj &&
    'components' in obj &&
    typeof obj.colorSpace === 'string' &&
    ['oklch', 'srgb', 'hsl'].includes(obj.colorSpace) &&
    Array.isArray(obj.components) &&
    obj.components.every(c => typeof c === 'number')
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
    'color' in obj &&
    'position' in obj &&
    typeof obj.position === 'number'
  );
}

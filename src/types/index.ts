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

export interface ParsedThemefile {
  PALETTE: string;
  DIMENSION: string;
  THEME: string;
  PARAMETER: {
    night?: 'auto' | 'false';
    variants?: string;
    output?: string;
    platform?: string;
    brand?: string;
  };
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
  platform?: 'general' | 'css';
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
  global: {
    color: ColorPalette;
  };
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
  global: {
    dimension: Record<string, DimensionCategory>;
  };
}

export interface BuiltinPalette {
  [paletteName: string]: {
    global?: {
      color?: {
        $type: string;
        $description?: string;
        [colorName: string]: unknown;
      };
    };
  };
}

export interface BuiltinDimension {
  [dimensionName: string]: {
    global?: {
      dimension?: {
        [dimensionKey: string]: {
          $description?: string;
          $type?: string;
          $value?: unknown;
          [variantName: string]: unknown;
        };
      };
    };
  };
}

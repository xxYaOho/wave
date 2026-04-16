import * as path from 'node:path';
import type {
	CheckResult,
	ParsedThemefile,
	ParseError,
} from '../../types/index.ts';
import { parseThemefile } from '../parser/themefile.ts';
import { getResourcesDir, resolveResource } from '../resolver/index.ts';
import { validateCustomResourceExtension } from '../schema/resource.ts';

export interface ValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
	config?: ParsedThemefile;
}

export interface ThemeValidationOptions {
	themefilePath?: string;
	themefileContent?: string;
	themefileDir?: string;
}

export async function validateThemefile(
	options: ThemeValidationOptions,
): Promise<ValidationResult> {
	const errors: string[] = [];
	const warnings: string[] = [];
	let config: ParsedThemefile | undefined;

	let content: string;
	let themefileDir: string;

	if (options.themefileContent) {
		content = options.themefileContent;
		themefileDir = options.themefileDir || process.cwd();
	} else if (options.themefilePath) {
		themefileDir = path.dirname(options.themefilePath);
		try {
			const file = Bun.file(options.themefilePath);
			if (!(file.size > 0)) {
				return {
					valid: false,
					errors: [`Themefile not found: ${options.themefilePath}`],
					warnings: [],
				};
			}
			content = await file.text();
		} catch {
			return {
				valid: false,
				errors: [`Cannot read themefile: ${options.themefilePath}`],
				warnings: [],
			};
		}
	} else {
		return {
			valid: false,
			errors: ['No themefile path or content provided'],
			warnings: [],
		};
	}

	const parseResult = parseThemefile(content);

	if ('line' in parseResult) {
		const parseError = parseResult as ParseError;
		return {
			valid: false,
			errors: [`Parse error at line ${parseError.line}: ${parseError.message}`],
			warnings: [],
		};
	}

	config = parseResult as ParsedThemefile;

	// Validate RESOURCE mode
	if (config.resources && config.resources.length > 0) {
		const seenKinds = new Set<string>();
		for (const res of config.resources) {
			if (res.kind === 'custom') {
				const extError = validateCustomResourceExtension(res.ref);
				if (extError) {
					errors.push(extError.message);
					continue;
				}
			}

			// Validate resource exists
			// CQ-004: kind is already validated by parser, only palette/dimension/custom allowed
			const resolved = resolveResource(
				res.ref,
				res.kind as 'palette' | 'dimension' | 'brand',
				themefileDir,
			);
			if (!resolved.exists) {
				errors.push(`${res.kind} resource not found: ${res.ref}`);
			}
		}
	}

	if (!config.THEME || config.THEME.trim() === '') {
		errors.push('THEME directive is empty');
	}

	if (
		config.PARAMETER.night &&
		!['auto', 'false'].includes(config.PARAMETER.night)
	) {
		warnings.push(
			`Invalid night parameter: ${config.PARAMETER.night}, expected 'auto' or 'false'`,
		);
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
		config,
	};
}

export function createConfigCheck(
	themefilePath?: string,
): () => Promise<CheckResult & { name: string }> {
	return async () => {
		if (!themefilePath) {
			return {
				name: 'Config File',
				success: true,
				message: 'No themefile specified (use --file to specify)',
			};
		}

		const result = await validateThemefile({ themefilePath });

		if (result.valid) {
			return {
				name: 'Config File',
				success: true,
				message: `Valid themefile: ${result.config?.THEME || 'unknown'}`,
			};
		}

		return {
			name: 'Config File',
			success: false,
			message: result.errors[0] || 'Unknown validation error',
			suggestion: 'Check themefile syntax and referenced resources',
		};
	};
}

export function checkBuiltinResources(): CheckResult & { name: string } {
	const resourcesDir = getResourcesDir();
	const palettesDir = path.join(resourcesDir, 'palettes');
	const dimensionsDir = path.join(resourcesDir, 'dimensions');

	const issues: string[] = [];

	try {
		const palettes = Bun.file(palettesDir);
		if (!(palettes.size !== undefined)) {
			issues.push('palettes directory missing');
		}
	} catch {
		issues.push('palettes directory missing');
	}

	try {
		const dimensions = Bun.file(dimensionsDir);
		if (!(dimensions.size !== undefined)) {
			issues.push('dimensions directory missing');
		}
	} catch {
		issues.push('dimensions directory missing');
	}

	const requiredPalettes = ['tailwindcss4.yaml', 'leonardo.yaml'];
	const requiredDimensions = ['wave.yaml'];

	for (const palette of requiredPalettes) {
		const file = Bun.file(path.join(palettesDir, palette));
		if (!(file.size > 0)) {
			issues.push(`palette ${palette} missing`);
		}
	}

	for (const dimension of requiredDimensions) {
		const file = Bun.file(path.join(dimensionsDir, dimension));
		if (!(file.size > 0)) {
			issues.push(`dimension ${dimension} missing`);
		}
	}

	if (issues.length === 0) {
		return {
			name: 'Resources',
			success: true,
			message: 'All built-in resources available',
		};
	}

	return {
		name: 'Resources',
		success: false,
		message: `Missing: ${issues.join(', ')}`,
		suggestion: 'Reinstall wave or check resources directory',
	};
}

export function checkOutputDir(
	outputPath?: string,
): CheckResult & { name: string } {
	const testPath = outputPath || `${process.env.HOME}/Downloads`;

	try {
		const dir = Bun.file(testPath);
		if (dir.size !== undefined) {
			return {
				name: 'Output Directory',
				success: true,
				message: `${testPath} is accessible`,
			};
		}
	} catch {
		return {
			name: 'Output Directory',
			success: true,
			message: `${testPath} (will create if needed)`,
		};
	}

	return {
		name: 'Output Directory',
		success: true,
		message: `${testPath} (will create if needed)`,
	};
}

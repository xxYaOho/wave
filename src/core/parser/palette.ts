import * as yaml from 'js-yaml';
import type { ColorPalette, PaletteResult, ParseError } from '../../types';
import { paletteSchema } from '../schema/palette.ts';
import { validateGenericResource } from '../schema/resource.ts';

export async function validatePaletteSchema(
	content: string,
	resourcePath?: string,
): Promise<ParseError | null> {
	let parsed: unknown;
	try {
		parsed = yaml.load(content);
	} catch (err) {
		if (err instanceof yaml.YAMLException) {
			return {
				line: err.mark?.line ? err.mark.line + 1 : 1,
				message: `YAML syntax error: ${err.message}`,
			};
		}
		return {
			line: 1,
			message: `Parse error: ${err instanceof Error ? err.message : String(err)}`,
		};
	}

	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return {
			line: 1,
			message: 'Palette root must be an object',
		};
	}

	const generic = validateGenericResource(
		parsed as Record<string, unknown>,
		resourcePath,
	);
	if (!generic.success) {
		return generic.error;
	}

	const result = paletteSchema.safeParse(parsed);
	if (!result.success) {
		const issues = result.error.issues.map(
			(issue) => `${issue.path.join('.')}: ${issue.message}`,
		);
		return {
			line: 1,
			message: `Palette validation failed: ${issues.join('; ')}`,
		};
	}

	return null;
}

export function parsePalette(content: string): PaletteResult | ParseError {
	try {
		const parsed = yaml.load(content) as unknown;

		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return {
				line: 1,
				message: '无效的 YAML 格式：根节点必须是对象',
			};
		}

		const generic = validateGenericResource(parsed as Record<string, unknown>);
		if (!generic.success) {
			return generic.error;
		}

		const result = paletteSchema.safeParse(parsed);
		if (!result.success) {
			const issues = result.error.issues.map(
				(issue) => `${issue.path.join('.')}: ${issue.message}`,
			);
			return {
				line: 1,
				message: `Palette 校验失败: ${issues.join('; ')}`,
			};
		}

		const paletteName = generic.namespace;
		const paletteData = (parsed as Record<string, unknown>)[
			paletteName
		] as Record<string, unknown>;
		const color = paletteData.color as ColorPalette;

		return {
			name: paletteName,
			color,
		};
	} catch (error) {
		if (error instanceof yaml.YAMLException) {
			return {
				line: error.mark?.line ? error.mark.line + 1 : 1,
				message: `YAML 语法错误: ${error.message}`,
			};
		}

		return {
			line: 1,
			message: `解析错误: ${error instanceof Error ? error.message : '未知错误'}`,
		};
	}
}

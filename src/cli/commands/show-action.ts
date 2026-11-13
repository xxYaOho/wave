import { ExitCode } from '../../types/index.ts';
import { logger } from '../../utils/logger.ts';
import {
	listBuiltinResources,
	showResource,
	VALID_CATEGORIES,
} from '../../core/inspect/resource-service.ts';

export type { ResourceMatch } from '../../core/inspect/resource-service.ts';

export interface ShowCommandOptions {
	format?: string;
}

function printResourceList(category: string): void {
	const names = listBuiltinResources(category);
	logger.info(`${category === 'palette' ? 'Palettes' : 'Dimensions'}:`);
	for (const name of names) console.log(`  ${name}`);
	console.log();
}

export function createShowCommandAction() {
	return async (
		category?: string,
		name?: string,
		options?: ShowCommandOptions,
	) => {
		const format = options?.format ?? 'flat-json';
		if (!category) {
			const palettes = listBuiltinResources('palette');
			const dimensions = listBuiltinResources('dimension');
			if (palettes.length > 0) {
				logger.info('Palettes:');
				for (const n of palettes) console.log(`  ${n}`);
				console.log();
			}
			if (dimensions.length > 0) {
				logger.info('Dimensions:');
				for (const n of dimensions) console.log(`  ${n}`);
				console.log();
			}
			process.exitCode = ExitCode.SUCCESS;
			return;
		}

		if (category && !name) {
			if (VALID_CATEGORIES.includes(category.toLowerCase())) {
				printResourceList(category.toLowerCase());
				process.exitCode = ExitCode.SUCCESS;
				return;
			}
			const result = await showResource(
				category,
				format,
				undefined,
				process.cwd(),
			);
			if (!result.ok) {
				logger.error(result.message);
				process.exitCode = result.exitCode;
				return;
			}
			console.log(result.output);
			process.exitCode = ExitCode.SUCCESS;
			return;
		}

		if (category && name) {
			if (!VALID_CATEGORIES.includes(category.toLowerCase())) {
				logger.error(
					`Unknown category: ${category}. Supported: palette, dimension`,
				);
				process.exitCode = ExitCode.INVALID_PARAMETER;
				return;
			}
			const result = await showResource(
				name,
				format,
				category.toLowerCase(),
				process.cwd(),
			);
			if (!result.ok) {
				logger.error(result.message);
				process.exitCode = result.exitCode;
				return;
			}
			console.log(result.output);
			process.exitCode = ExitCode.SUCCESS;
		}
	};
}

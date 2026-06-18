import matter from 'gray-matter';
import { ManualLoadError, type ManualPageFrontmatter } from './types.ts';

function asRecord(value: unknown, label: string, sourcePath: string) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new ManualLoadError(`${label} must be an object`, sourcePath);
	}
	return value as Record<string, unknown>;
}

function readString(
	data: Record<string, unknown>,
	key: string,
	sourcePath: string,
): string {
	const value = data[key];
	if (typeof value !== 'string' || value.trim() === '') {
		throw new ManualLoadError(
			`Missing required frontmatter "${key}"`,
			sourcePath,
		);
	}
	return value.trim();
}

function readStringList(
	data: Record<string, unknown>,
	key: string,
	sourcePath: string,
): string[] {
	const value = data[key];
	if (
		!Array.isArray(value) ||
		value.length === 0 ||
		value.some((item) => typeof item !== 'string' || item.trim() === '')
	) {
		throw new ManualLoadError(
			`Frontmatter "${key}" must be a non-empty string array`,
			sourcePath,
		);
	}
	return value.map((item) => item.trim());
}

export interface ParsedManualMarkdown {
	frontmatter: ManualPageFrontmatter;
	body: string;
}

export function parseManualMarkdown(
	content: string,
	sourcePath: string,
): ParsedManualMarkdown {
	const parsed = matter(content);
	const data = asRecord(parsed.data, 'Frontmatter', sourcePath);
	const body = parsed.content.trim();

	if (body === '') {
		throw new ManualLoadError('Manual page body must not be empty', sourcePath);
	}

	return {
		frontmatter: {
			title: readString(data, 'title', sourcePath),
			description: readString(data, 'description', sourcePath),
			category: readString(data, 'category', sourcePath),
			commands: readStringList(data, 'commands', sourcePath),
			appliesTo: readStringList(data, 'appliesTo', sourcePath),
		},
		body,
	};
}

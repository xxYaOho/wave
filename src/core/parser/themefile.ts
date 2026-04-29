import type {
	GroupBlock,
	ParsedThemefile,
	ParseError,
	ResourceDeclaration,
} from '../../types/index.ts';

export function parseThemefile(content: string): ParsedThemefile | ParseError {
	const result: Partial<ParsedThemefile> = {
		PARAMETER: {},
		resources: [],
		groups: [],
	};

	const lines = content.split('\n');
	let lineNum = 0;
	let inGroup = false;
	let currentGroup: GroupBlock | null = null;

	for (const line of lines) {
		lineNum++;
		const trimmedLine = line.trim();

		if (!trimmedLine || trimmedLine.startsWith('#')) {
			continue;
		}

		// GROUP "name" { — intercept before keyValueMatch
		const groupMatch = trimmedLine.match(/^GROUP\s*(?:"([^"]*)")?\s*\{$/);
		if (groupMatch) {
			inGroup = true;
			currentGroup = { name: groupMatch[1] ?? undefined, PARAMETER: {} };
			continue;
		}

		// } closes GROUP
		if (trimmedLine === '}') {
			if (!inGroup) {
				return { line: lineNum, message: 'Unexpected closing }' };
			}
			result.groups!.push(currentGroup!);
			inGroup = false;
			currentGroup = null;
			continue;
		}

		// Inside GROUP: only PARAMETER, comments, empty lines (already handled)
		if (inGroup) {
			const keyValueMatch = trimmedLine.match(/^(\w+)\s+(.+)$/);
			if (!keyValueMatch) {
				return {
					line: lineNum,
					message: `Invalid line format inside GROUP: ${trimmedLine}`,
				};
			}
			const [, key, value] = keyValueMatch;
			if (!key || !value) {
				return {
					line: lineNum,
					message: `Invalid line format inside GROUP: ${trimmedLine}`,
				};
			}
			if (key !== 'PARAMETER') {
				return {
					line: lineNum,
					message: `Only PARAMETER is allowed inside GROUP, got: ${key}`,
				};
			}
			const paramMatch = value.match(/^(\w+)\s+(.+)$/);
			if (paramMatch && paramMatch[1] && paramMatch[2]) {
				currentGroup!.PARAMETER[paramMatch[1]] = paramMatch[2];
			} else {
				return {
					line: lineNum,
					message: `Invalid PARAMETER format inside GROUP: ${trimmedLine}`,
				};
			}
			continue;
		}

		const keyValueMatch = trimmedLine.match(/^(\w+)\s+(.+)$/);
		if (keyValueMatch) {
			const [, key, value] = keyValueMatch;
			if (!value) {
				return {
					line: lineNum,
					message: `Missing value for key: ${key}`,
				};
			}

			if (key === 'THEME') {
				result.THEME = value;
				continue;
			}

			if (key === 'RESOURCE') {
				const resourceMatch = value.match(/^(\S+)\s+(.+)$/);
				if (!resourceMatch || !resourceMatch[1] || !resourceMatch[2]) {
					return {
						line: lineNum,
						message: `Invalid RESOURCE format: ${trimmedLine}. Expected: RESOURCE <kind> <ref>`,
					};
				}
				const [, kind, ref] = resourceMatch;

				const validKinds = ['palette', 'dimension', 'custom'] as const;
				if (!validKinds.includes(kind as (typeof validKinds)[number])) {
					return {
						line: lineNum,
						message: `Invalid RESOURCE kind: "${kind}". Valid kinds are: ${validKinds.join(', ')}`,
					};
				}

				result.resources!.push({ kind, ref } as ResourceDeclaration);
				continue;
			}

			if (key === 'PARAMETER') {
				const paramMatch = value.match(/^(\w+)\s+(.+)$/);
				if (paramMatch && paramMatch[1] && paramMatch[2]) {
					result.PARAMETER![paramMatch[1]] = paramMatch[2];
				} else {
					return {
						line: lineNum,
						message: `Invalid PARAMETER format: ${trimmedLine}`,
					};
				}
				continue;
			}

			return {
				line: lineNum,
				message: `Unknown directive: ${key}`,
			};
		}

		return {
			line: lineNum,
			message: `Invalid line format: ${trimmedLine}`,
		};
	}

	// Unclosed GROUP at EOF
	if (inGroup && currentGroup) {
		const label = currentGroup.name ? `"${currentGroup.name}"` : '(anonymous)';
		return {
			line: lineNum,
			message: `Unterminated GROUP block ${label}`,
		};
	}

	// Validation: require THEME
	if (!result.THEME || result.THEME.trim() === '') {
		return {
			line: 0,
			message: 'Missing required directive: THEME',
		};
	}

	// Validation: require at least one RESOURCE
	if (!result.resources || result.resources.length === 0) {
		return {
			line: 0,
			message:
				'Missing required RESOURCE declarations. At least one RESOURCE is required.',
		};
	}

	return result as ParsedThemefile;
}

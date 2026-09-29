import type { DtcgTokenGroup, TypographyDefaults } from '../../types/index.ts';
import { validateStandardTokenValue } from '../token-values/composites.ts';
import {
	isTypographyReference,
	materializeTypographyValue,
	mergeTypographyDefaults,
	missingTypographyFields,
	parseTypographyBaseFontSize,
	TYPOGRAPHY_FIELDS,
	type TypographySchemaPhase,
	typographyDefaultsFromExtensions,
	validateTypographyField,
} from '../typography-value.ts';

export interface ThemeSchemaIssue {
	path: string;
	level: 'error' | 'warning';
	message: string;
}

export interface ThemeSchemaResult {
	valid: boolean;
	issues: ThemeSchemaIssue[];
}

const KNOWN_TYPES = new Set([
	'color',
	'shadow',
	'gradient',
	'border',
	'dimension',
	'number',
	'fontFamily',
	'fontWeight',
	'duration',
	'cubicBezier',
	'strokeStyle',
	'transition',
	'typography',
]);

// $extends 格式验证：必须是 {group.path.to.group} 格式
const EXTENDS_PATTERN = /^\{([a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9-]+)*)\}$/;

const KNOWN_EXTENSIONS = new Set([
	'smoothShadow',
	'smoothGradient',
	'currentColor', // deprecated: use inheritColor instead
	'inheritColor',
	'platform',
	// "sketch" / "outline" are legacy forms: not accepted, but listed here so
	// the dedicated rejection below carries the migration hint instead of a
	// generic unknown-extension warning.
	'sketch',
	'outline',
	'typography',
]);

const EXTENSION_TYPE_MAP: Record<string, string> = {
	smoothShadow: 'shadow',
	smoothGradient: 'gradient',
	inheritColor: 'color',
};

const SKETCH_PROPERTY_KEYS = new Set(['opacity', 'cornerRadius']);
const PLATFORM_SKETCH_KEYS = new Set(['path', 'property', 'skip', 'outline']);
const SKETCH_PATH_PATTERN = /^[^/.\s][^/.]*(?:\/[^/.\s][^/.]*)*$/;

const MIGRATE_HINT =
	'run `wave dt migrate-extensions` to rename legacy sketch extensions';

/**
 * Legacy sketch family (`$extensions.sketch.*` / `$extensions.outline`) is
 * rejected outright (Decision 9: no compatibility layer).
 */
function rejectLegacySketchExtensions(
	extensions: Record<string, unknown>,
	tokenPath: string,
	issues: ThemeSchemaIssue[],
): void {
	if ('sketch' in extensions) {
		issues.push({
			path: `${tokenPath}.$extensions.sketch`,
			level: 'error',
			message: `legacy extension "sketch" is no longer supported; rename it to "platform.sketch" — ${MIGRATE_HINT}`,
		});
	}
	if ('outline' in extensions) {
		issues.push({
			path: `${tokenPath}.$extensions.outline`,
			level: 'error',
			message: `legacy extension "outline" is no longer supported; rename it to "platform.sketch.outline" — ${MIGRATE_HINT}`,
		});
	}
}

function checkDanglingJsonPointer(
	value: unknown,
	path: string,
	issues: ThemeSchemaIssue[],
): void {
	if (typeof value === 'string' && value.startsWith('#/')) {
		issues.push({
			path,
			level: 'error',
			message: `"#/..." string outside $ref object, use $ref: "${value}" instead`,
		});
	}
}

function checkValueDeep(
	value: unknown,
	parentPath: string,
	issues: ThemeSchemaIssue[],
): void {
	if (typeof value === 'string') {
		checkDanglingJsonPointer(value, parentPath, issues);
		return;
	}

	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			checkValueDeep(value[i], `${parentPath}[${i}]`, issues);
		}
		return;
	}

	if (typeof value === 'object' && value !== null) {
		const obj = value as Record<string, unknown>;

		// Skip $ref objects — the $ref value itself is validated separately
		if ('$ref' in obj && typeof obj.$ref === 'string') {
			return;
		}

		for (const [key, val] of Object.entries(obj)) {
			if (key.startsWith('$')) continue;
			checkValueDeep(val, `${parentPath}.${key}`, issues);
		}
	}
}

function validateInheritColor(
	extensions: Record<string, unknown>,
	tokenType: string | undefined,
	tokenPath: string,
	issues: ThemeSchemaIssue[],
): void {
	if (!('inheritColor' in extensions)) return;

	// Rule: inheritColor only applies to color tokens
	if (tokenType !== undefined && tokenType !== 'color') {
		issues.push({
			path: tokenPath,
			level: 'error',
			message: `inheritColor can only be used with $type "color", got "${tokenType}"`,
		});
		return;
	}

	const inheritColor = extensions.inheritColor;

	// Accept boolean form: inheritColor: true
	if (typeof inheritColor === 'boolean') {
		return;
	}

	// Accept object form: inheritColor: { property?: { opacity?: number | alias | $ref }, siblingSlot?: string }
	if (typeof inheritColor === 'object' && inheritColor !== null) {
		const obj = inheritColor as Record<string, unknown>;

		// Validate property.opacity / property.alpha if present
		const property = obj.property;
		if (
			property !== undefined &&
			typeof property === 'object' &&
			property !== null
		) {
			const propObj = property as Record<string, unknown>;
			for (const propKey of ['opacity', 'alpha'] as const) {
				if (propKey in propObj) {
					const val = propObj[propKey];
					const isValid =
						typeof val === 'number' ||
						(typeof val === 'string' &&
							val.startsWith('{') &&
							val.endsWith('}')) ||
						(typeof val === 'object' && val !== null && '$ref' in val);

					if (!isValid) {
						issues.push({
							path: `${tokenPath}.$extensions.inheritColor.property.${propKey}`,
							level: 'error',
							message: `inheritColor.property.${propKey} must be a number, alias (string), or $ref object`,
						});
					}
				}
			}
		}

		// siblingSlot is Sketch-specific hint, no validation needed for value type
		return;
	}

	// Invalid form
	issues.push({
		path: `${tokenPath}.$extensions.inheritColor`,
		level: 'error',
		message: `inheritColor must be a boolean (true) or an object with optional opacity and siblingSlot`,
	});
}

function isSketchPropertyPath(propertyKey: string, tokenPath: string): boolean {
	const parts = tokenPath.split('.');
	const rootIndex = parts[0] === 'theme' ? 1 : 0;
	const root = parts[rootIndex];
	if (propertyKey === 'cornerRadius') {
		return root === 'radius' || root === 'dimension';
	}
	return root === 'dimension' || root === 'state';
}

function sketchPropertyRootMessage(propertyKey: string): string {
	if (propertyKey === 'cornerRadius') {
		return 'sketch.property.cornerRadius must be under a radius or dimension root for Sketch property output';
	}
	return `sketch.property.${propertyKey} must be under a dimension or state root for Sketch property output`;
}

/**
 * Sketch-family rule contract for the new `$extensions.platform.sketch`
 * mount point. Group-level `outline` stays silently ignored — parity with
 * the legacy behavior, where group validation never inspected outline.
 */
function validatePlatformSketchRecord(
	sketchObj: Record<string, unknown>,
	prefix: string,
	tokenPath: string,
	tokenType: string | undefined,
	issues: ThemeSchemaIssue[],
	context: 'token' | 'group',
): void {
	for (const key of Object.keys(sketchObj)) {
		if (!PLATFORM_SKETCH_KEYS.has(key)) {
			issues.push({
				path: `${prefix}.${key}`,
				level: 'error',
				message: `Unknown sketch field "${key}". Supported fields: path, property, skip, outline`,
			});
		}
	}

	if ('skip' in sketchObj && typeof sketchObj.skip !== 'boolean') {
		issues.push({
			path: `${prefix}.skip`,
			level: 'error',
			message: 'sketch.skip must be a boolean',
		});
	}

	if (context === 'group' && 'property' in sketchObj) {
		issues.push({
			path: `${prefix}.property`,
			level: 'error',
			message: 'sketch.property is only supported on token extensions',
		});
	}

	if ('path' in sketchObj) {
		if (
			typeof sketchObj.path !== 'string' ||
			sketchObj.path.trim() === '' ||
			!SKETCH_PATH_PATTERN.test(sketchObj.path)
		) {
			issues.push({
				path: `${prefix}.path`,
				level: 'error',
				message:
					'sketch.path must be a slash-delimited group path without empty segments or dots',
			});
		}
	}

	// Outline lives inside the new-form platform.sketch on tokens only. At group
	// level it stays silently ignored — parity with the legacy top-level
	// outline extension, which group validation never inspected.
	if (context === 'token' && 'outline' in sketchObj) {
		validateOutlineValue(
			sketchObj.outline,
			tokenType,
			`${prefix}.outline`,
			`${prefix}.outline`,
			issues,
		);
	}

	if (context === 'group' || !('property' in sketchObj)) return;
	const property = sketchObj.property;
	if (
		typeof property !== 'object' ||
		property === null ||
		Array.isArray(property)
	) {
		issues.push({
			path: `${prefix}.property`,
			level: 'error',
			message: 'sketch.property must be an object',
		});
		return;
	}

	const propertyObj = property as Record<string, unknown>;
	for (const [key, value] of Object.entries(propertyObj)) {
		if (!SKETCH_PROPERTY_KEYS.has(key)) {
			issues.push({
				path: `${prefix}.property.${key}`,
				level: 'error',
				message: `Unknown sketch property "${key}". Supported properties: opacity, cornerRadius`,
			});
			continue;
		}
		if (value !== true) {
			issues.push({
				path: `${prefix}.property.${key}`,
				level: 'error',
				message: `sketch.property.${key} must be true`,
			});
		}
		if (
			tokenType !== undefined &&
			tokenType !== 'number' &&
			tokenType !== 'dimension'
		) {
			issues.push({
				path: `${prefix}.property.${key}`,
				level: 'error',
				message: `${key} requires $type "number" or "dimension", got "${tokenType}"`,
			});
		}
		if (!isSketchPropertyPath(key, tokenPath)) {
			issues.push({
				path: `${prefix}.property.${key}`,
				level: 'error',
				message: sketchPropertyRootMessage(key),
			});
		}
	}
}

function validatePlatformExtension(
	extensions: Record<string, unknown>,
	tokenType: string | undefined,
	tokenPath: string,
	issues: ThemeSchemaIssue[],
	context: 'token' | 'group' = 'token',
): void {
	if (!('platform' in extensions)) return;

	const platform = extensions.platform;
	if (!isRecord(platform)) {
		issues.push({
			path: `${tokenPath}.$extensions.platform`,
			level: 'error',
			message: 'platform extension must be an object',
		});
		return;
	}

	for (const key of Object.keys(platform)) {
		if (key !== 'sketch') {
			issues.push({
				path: `${tokenPath}.$extensions.platform.${key}`,
				level: 'warning',
				message: `Unknown platform extension "${key}"`,
			});
		}
	}

	const sketch = platform.sketch;
	if (sketch !== undefined && !isRecord(sketch)) {
		issues.push({
			path: `${tokenPath}.$extensions.platform.sketch`,
			level: 'error',
			message: 'sketch extension must be an object',
		});
		return;
	}
	if (sketch === undefined) return;

	validatePlatformSketchRecord(
		sketch,
		`${tokenPath}.$extensions.platform.sketch`,
		tokenPath,
		tokenType,
		issues,
		context,
	);
}

function validateOutlineValue(
	outline: unknown,
	tokenType: string | undefined,
	outlinePath: string,
	typeErrorPath: string,
	issues: ThemeSchemaIssue[],
): void {
	if (tokenType !== 'border') {
		issues.push({
			path: typeErrorPath,
			level: 'error',
			message: `outline can only be used with $type "border", got "${tokenType ?? 'undefined'}"`,
		});
		return;
	}
	if (
		typeof outline !== 'object' ||
		outline === null ||
		Array.isArray(outline)
	) {
		issues.push({
			path: outlinePath,
			level: 'error',
			message: 'outline extension must be an object',
		});
		return;
	}
	const offset = (outline as Record<string, unknown>).offset;
	if (typeof offset !== 'number' || !Number.isFinite(offset) || offset < 0) {
		issues.push({
			path: `${outlinePath}.offset`,
			level: 'error',
			message: 'outline.offset must be a non-negative finite number',
		});
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateTypographyFields(
	value: unknown,
	valuePath: string,
	allowLegacyColor: boolean,
	phase: TypographySchemaPhase,
	issues: ThemeSchemaIssue[],
): Record<string, unknown> | undefined {
	if (!isRecord(value)) {
		issues.push({
			path: valuePath,
			level: 'error',
			message: 'typography value must be an object',
		});
		return undefined;
	}

	const allowed = new Set<string>(TYPOGRAPHY_FIELDS);
	if (allowLegacyColor) allowed.add('color');
	for (const key of Object.keys(value)) {
		if (!allowed.has(key)) {
			issues.push({
				path: `${valuePath}.${key}`,
				level: 'error',
				message: `Unknown typography field "${key}"`,
			});
		}
	}

	for (const field of TYPOGRAPHY_FIELDS) {
		if (value[field] === undefined) continue;
		const message = validateTypographyField(field, value[field], phase);
		if (message) {
			issues.push({
				path: `${valuePath}.${field}`,
				level: 'error',
				message: `typography.${field} ${message}`,
			});
		}
	}
	if (allowLegacyColor && value.color !== undefined) {
		for (const issue of validateStandardTokenValue(
			'color',
			value.color,
			`${valuePath}.color`,
			phase,
		)) {
			issues.push({ ...issue, level: 'error' });
		}
	}
	return value;
}

function validateTypographyToken(
	token: Record<string, unknown>,
	tokenPath: string,
	phase: TypographySchemaPhase,
	fallbacks: TypographyDefaults | undefined,
	_typographyBaseFontSize: number | undefined,
	issues: ThemeSchemaIssue[],
): void {
	if (phase === 'raw' && isTypographyReference(token.$value)) return;
	const tokenValue = validateTypographyFields(
		token.$value,
		`${tokenPath}.$value`,
		true,
		phase,
		issues,
	);
	if (phase !== 'resolved') return;
	const materialized = materializeTypographyValue(fallbacks, tokenValue);
	const missing = missingTypographyFields(materialized);
	if (missing.length > 0) {
		issues.push({
			path: tokenPath,
			level: 'error',
			message: `materialized typography is missing required fields: ${missing.join(', ')}`,
		});
	}
}

function validateTypographyGroupExtension(
	extensions: Record<string, unknown>,
	groupType: string | undefined,
	group: Record<string, unknown>,
	groupPath: string,
	phase: TypographySchemaPhase,
	issues: ThemeSchemaIssue[],
): TypographyDefaults | undefined {
	if (!('typography' in extensions)) return undefined;
	const extensionPath = `${groupPath}.$extensions.typography`;
	const extension = extensions.typography;
	if (!isRecord(extension)) {
		issues.push({
			path: extensionPath,
			level: 'error',
			message: 'typography extension must be an object',
		});
		return undefined;
	}
	const allowed = new Set<string>(['baseFontSize', ...TYPOGRAPHY_FIELDS]);
	for (const key of Object.keys(extension)) {
		if (key === 'defaults') {
			issues.push({
				path: `${extensionPath}.${key}`,
				level: 'error',
				message:
					'typography.defaults is no longer supported; flatten its fields, for example typography: { fontFamily: "Inter", letterSpacing: 0 }',
			});
		} else if (!allowed.has(key)) {
			issues.push({
				path: `${extensionPath}.${key}`,
				level: 'error',
				message: `Unknown typography extension field "${key}"`,
			});
		}
	}

	const deferTypeCheck =
		phase === 'raw' &&
		groupType === undefined &&
		typeof group.$extends === 'string';
	if (!deferTypeCheck && groupType !== 'typography') {
		issues.push({
			path: extensionPath,
			level: 'error',
			message: `typography defaults require effective $type "typography", got "${groupType ?? 'undefined'}"`,
		});
	}

	if (!Object.keys(extension).some((key) => allowed.has(key))) {
		issues.push({
			path: extensionPath,
			level: 'error',
			message: `typography extension must declare at least one field: ${[...allowed].join(', ')}`,
		});
	}
	if ('baseFontSize' in extension) {
		const basePath = `${extensionPath}.baseFontSize`;
		const baseFontSize = extension.baseFontSize;
		const mayDeferReference =
			phase === 'raw' && isTypographyReference(baseFontSize);
		if (groupPath !== 'theme.font') {
			issues.push({
				path: basePath,
				level: 'error',
				message: 'typography.baseFontSize is only supported on theme.font',
			});
		} else if (
			!mayDeferReference &&
			parseTypographyBaseFontSize(extensions) === undefined
		) {
			issues.push({
				path: basePath,
				level: 'error',
				message: 'typography.baseFontSize must be a finite positive number',
			});
		}
	}
	const defaults = typographyDefaultsFromExtensions(extensions);
	if (defaults) {
		validateTypographyFields(defaults, extensionPath, false, phase, issues);
	}
	return defaults;
}

function validateToken(
	token: Record<string, unknown>,
	tokenPath: string,
	issues: ThemeSchemaIssue[],
	inheritedType?: string,
	phase: TypographySchemaPhase = 'raw',
	typographyDefaults?: TypographyDefaults,
	typographyBaseFontSize?: number,
): void {
	const value = token.$value;
	if (value !== undefined) {
		checkValueDeep(value, `${tokenPath}.$value`, issues);
	}

	// Rule: $extends is NOT allowed on tokens (group-only)
	if ('$extends' in token) {
		issues.push({
			path: tokenPath,
			level: 'error',
			message: `$extends is only allowed on groups, not on tokens (objects with $value)`,
		});
	}

	// Rule: $id three-state contract (missing key | empty slot | identity string)
	if (
		token.$id !== undefined &&
		token.$id !== null &&
		typeof token.$id !== 'string'
	) {
		issues.push({
			path: `${tokenPath}.$id`,
			level: 'error',
			message: `$id must be a string or null, got ${typeof token.$id}`,
		});
	}

	// Rule (DTCG §6.1): $value and authored child nodes are mutually exclusive.
	// `_`-prefixed keys are Wave runtime metadata injected during resolution,
	// not authored children.
	const childKeys = Object.keys(token).filter(
		(key) => !key.startsWith('$') && !key.startsWith('_'),
	);
	if (childKeys.length > 0) {
		issues.push({
			path: tokenPath,
			level: 'error',
			message: `token cannot mix $value with child nodes (${childKeys.join(', ')}) at "${tokenPath}"`,
		});
	}

	// Rule (DTCG §5.2.2): type must not be guessed. Tokens whose type cannot be
	// determined when consumed through the typed-reference contract are
	// rejected there (dtcg-reference-types.ts); the raw walk keeps legacy
	// untyped literal tolerance.

	// Rule 2: $ref format
	if ('$ref' in token && typeof token.$ref === 'string') {
		const ref = token.$ref;
		if (!ref.startsWith('#/')) {
			issues.push({
				path: tokenPath,
				level: 'error',
				message: `$ref must start with "#/", got "${ref}"`,
			});
		}
	}

	const explicitTokenType =
		typeof token.$type === 'string' ? token.$type : undefined;
	const tokenType = explicitTokenType ?? inheritedType;
	if (tokenType !== undefined && tokenType !== 'typography') {
		for (const issue of validateStandardTokenValue(
			tokenType,
			value,
			`${tokenPath}.$value`,
			phase,
		)) {
			issues.push({ ...issue, level: 'error' });
		}
	}
	if (tokenType === 'typography') {
		validateTypographyToken(
			token,
			tokenPath,
			phase,
			typographyDefaults,
			typographyBaseFontSize,
			issues,
		);
	}

	// Rule 3: unknown $type
	if (explicitTokenType !== undefined && !KNOWN_TYPES.has(explicitTokenType)) {
		issues.push({
			path: tokenPath,
			level: 'warning',
			message: `Unknown $type "${explicitTokenType}"`,
		});
	}

	// Rule 4 & 5: $extensions validation
	if (
		token.$extensions !== undefined &&
		typeof token.$extensions === 'object' &&
		token.$extensions !== null
	) {
		const extensions = token.$extensions as Record<string, unknown>;
		if ('typography' in extensions) {
			issues.push({
				path: `${tokenPath}.$extensions.typography`,
				level: 'error',
				message: 'typography defaults are only supported on groups',
			});
		}

		// Check for deprecated currentColor
		if ('currentColor' in extensions) {
			issues.push({
				path: `${tokenPath}.$extensions`,
				level: 'warning',
				message: `currentColor is deprecated, use inheritColor instead`,
			});
		}

		for (const extKey of Object.keys(extensions)) {
			if (!KNOWN_EXTENSIONS.has(extKey)) {
				issues.push({
					path: `${tokenPath}.$extensions`,
					level: 'warning',
					message: `Unknown extension "${extKey}"`,
				});
			}
		}

		// Rule 5: $type / $extensions mismatch
		for (const [extKey, expectedType] of Object.entries(EXTENSION_TYPE_MAP)) {
			if (
				extKey in extensions &&
				tokenType !== undefined &&
				tokenType !== expectedType
			) {
				issues.push({
					path: tokenPath,
					level: 'warning',
					message: `${extKey} expects $type "${expectedType}", got "${tokenType}"`,
				});
			}
		}

		// Validate extension-specific contracts
		validateInheritColor(extensions, tokenType, tokenPath, issues);
		rejectLegacySketchExtensions(extensions, tokenPath, issues);
		validatePlatformExtension(extensions, tokenType, tokenPath, issues);
	}
}

function validateExtends(
	group: Record<string, unknown>,
	groupPath: string,
	issues: ThemeSchemaIssue[],
): void {
	if (!('$extends' in group)) return;

	const extendsValue = group.$extends;

	// Rule: $extends must be a string
	if (typeof extendsValue !== 'string') {
		issues.push({
			path: groupPath,
			level: 'error',
			message: `$extends must be a string in the form "{path.to.group}", got ${typeof extendsValue}`,
		});
		return;
	}

	// Rule: $extends must match {path.to.group} format
	const match = extendsValue.match(EXTENDS_PATTERN);
	if (!match) {
		issues.push({
			path: groupPath,
			level: 'error',
			message: `$extends must be in the form "{group.path.to.group}", got "${extendsValue}"`,
		});
		return;
	}
}

function validateComposite(
	obj: Record<string, unknown>,
	groupPath: string,
	issues: ThemeSchemaIssue[],
): void {
	const extensions = obj.$extensions;
	if (typeof extensions !== 'object' || extensions === null) return;

	const ext = extensions as Record<string, unknown>;
	if (ext.composite !== true) return;

	// composite group 的直接子节点必须都是 token
	for (const [key, child] of Object.entries(obj)) {
		if (key.startsWith('$')) continue;
		if (typeof child !== 'object' || child === null || Array.isArray(child)) {
			issues.push({
				path: groupPath,
				level: 'error',
				message: `composite group "${groupPath}" child "${key}" must be a token ($value required)`,
			});
		} else if (!('$value' in child)) {
			issues.push({
				path: groupPath,
				level: 'error',
				message: `composite group "${groupPath}" child "${key}" must be a token, not a group`,
			});
		}
	}
}

function walkNode(
	node: unknown,
	path: string,
	issues: ThemeSchemaIssue[],
	inheritedType?: string,
	phase: TypographySchemaPhase = 'raw',
	inheritedTypographyDefaults?: TypographyDefaults,
	inheritedTypographyBaseFontSize?: number,
): void {
	if (node === null || node === undefined) return;

	if (typeof node === 'object' && !Array.isArray(node)) {
		const obj = node as Record<string, unknown>;
		const nodeType = typeof obj.$type === 'string' ? obj.$type : inheritedType;

		if ('$value' in obj) {
			validateToken(
				obj,
				path,
				issues,
				inheritedType,
				phase,
				inheritedTypographyDefaults,
				inheritedTypographyBaseFontSize,
			);
			return;
		}

		// Rule: $id only exists on the document root and token nodes, never on groups
		if ('$id' in obj) {
			issues.push({
				path: `${path}.$id`,
				level: 'error',
				message: `$id is only supported on the document root and token nodes; remove $id from group "${path}"`,
			});
		}

		// Group node — validate $extends and recurse into non-meta children
		validateExtends(obj, path, issues);
		let localTypographyDefaults: TypographyDefaults | undefined;
		let localTypographyBaseFontSize: number | undefined;
		if ('$extensions' in obj) {
			const extensions = obj.$extensions;
			if (
				typeof extensions === 'object' &&
				extensions !== null &&
				!Array.isArray(extensions)
			) {
				rejectLegacySketchExtensions(
					extensions as Record<string, unknown>,
					path,
					issues,
				);
				validatePlatformExtension(
					extensions as Record<string, unknown>,
					nodeType,
					path,
					issues,
					'group',
				);
				localTypographyDefaults = validateTypographyGroupExtension(
					extensions as Record<string, unknown>,
					nodeType,
					obj,
					path,
					phase,
					issues,
				);
				if (path === 'theme.font') {
					localTypographyBaseFontSize = parseTypographyBaseFontSize(
						extensions as Record<string, unknown>,
					);
				}
			}
		}
		validateComposite(obj, path, issues);
		const typographyDefaults =
			nodeType === 'typography'
				? mergeTypographyDefaults(
						inheritedTypographyDefaults,
						localTypographyDefaults ??
							typographyDefaultsFromExtensions(
								obj.$extensions as Record<string, unknown> | undefined,
							),
					)
				: undefined;
		const typographyBaseFontSize =
			nodeType === 'typography'
				? (localTypographyBaseFontSize ?? inheritedTypographyBaseFontSize)
				: undefined;

		for (const [key, child] of Object.entries(obj)) {
			if (key.startsWith('$')) continue;
			walkNode(
				child,
				path ? `${path}.${key}` : key,
				issues,
				nodeType,
				phase,
				typographyDefaults,
				typographyBaseFontSize,
			);
		}
	}
}

export function validateThemeSchema(
	tree: DtcgTokenGroup,
	phase: TypographySchemaPhase = 'raw',
): ThemeSchemaResult {
	const issues: ThemeSchemaIssue[] = [];

	// Walk from root keys (skip $-prefixed like $schema)
	for (const [key, child] of Object.entries(tree)) {
		if (key.startsWith('$')) continue;
		if (key === 'doctor') continue; // validated separately
		walkNode(child, key, issues, undefined, phase);
	}

	// Validate doctor section
	validateDoctorSection(tree, issues);

	return {
		valid: !issues.some((i) => i.level === 'error'),
		issues,
	};
}

const DOCTOR_ALIAS_PATTERN =
	/^\{([a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9-]+)*)\}$/;

function validateDoctorSection(
	tree: DtcgTokenGroup,
	issues: ThemeSchemaIssue[],
): void {
	const doctor = tree.doctor;
	if (doctor === undefined || doctor === null) return;

	if (typeof doctor !== 'object' || Array.isArray(doctor)) {
		issues.push({
			path: 'doctor',
			level: 'error',
			message: `doctor must be an object`,
		});
		return;
	}

	const doctorObj = doctor as Record<string, unknown>;

	if (!('wcagPairs' in doctorObj)) {
		issues.push({
			path: 'doctor',
			level: 'error',
			message: `doctor must contain "wcagPairs"`,
		});
		return;
	}

	const wcagPairs = doctorObj.wcagPairs;
	if (
		typeof wcagPairs !== 'object' ||
		wcagPairs === null ||
		Array.isArray(wcagPairs)
	) {
		issues.push({
			path: 'doctor.wcagPairs',
			level: 'error',
			message: `wcagPairs must be an object`,
		});
		return;
	}

	for (const [pairName, pairValue] of Object.entries(
		wcagPairs as Record<string, unknown>,
	)) {
		const pairPath = `doctor.wcagPairs.${pairName}`;

		if (
			typeof pairValue !== 'object' ||
			pairValue === null ||
			Array.isArray(pairValue)
		) {
			issues.push({
				path: pairPath,
				level: 'error',
				message: `wcagPairs entry "${pairName}" must be an object with "foreground" and "background"`,
			});
			continue;
		}

		const pair = pairValue as Record<string, unknown>;

		for (const field of ['foreground', 'background'] as const) {
			const value = pair[field];
			if (typeof value !== 'string' || !DOCTOR_ALIAS_PATTERN.test(value)) {
				issues.push({
					path: `${pairPath}.${field}`,
					level: 'error',
					message: `${field} must be an alias string in "{path.to.token}" format`,
				});
			}
		}
	}
}

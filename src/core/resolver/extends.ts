import type { DtcgTokenGroup } from '../../types/index.ts';
import { ExtendsCycleError } from './errors.ts';

// 展开 $extends 继承
export function expandExtends(
	tree: DtcgTokenGroup,
	rootKeys: Set<string>,
): DtcgTokenGroup {
	const result: DtcgTokenGroup = {};

	// 复制非子节点属性
	for (const [key, value] of Object.entries(tree)) {
		if (
			key.startsWith('$') ||
			typeof value !== 'object' ||
			value === null ||
			Array.isArray(value)
		) {
			result[key] = value;
		}
	}

	// 处理子节点
	for (const [key, value] of Object.entries(tree)) {
		if (key.startsWith('$')) continue;
		if (typeof value !== 'object' || value === null || Array.isArray(value)) {
			continue;
		}

		const child = value as DtcgTokenGroup;

		// 检查是否是 token（有 $value）
		if ('$value' in child) {
			result[key] = child;
		} else {
			// 是 group，需要处理 $extends
			result[key] = expandGroupExtends(child, tree, [key], rootKeys);
		}
	}

	return result;
}

// 递归展开 group 的 $extends
function expandGroupExtends(
	group: DtcgTokenGroup,
	rootTree: DtcgTokenGroup,
	path: string[],
	rootKeys: Set<string>,
): DtcgTokenGroup {
	const result: DtcgTokenGroup = {};

	// 先复制当前 group 的所有属性（不包括 $extends）
	for (const [key, value] of Object.entries(group)) {
		if (key === '$extends') continue;
		result[key] = value;
	}

	// 如果有 $extends，先展开父 group
	if (group.$extends) {
		const parentPath = parseExtendsPath(group.$extends, rootKeys);
		if (!parentPath) {
			throw new Error(
				`Invalid $extends path: ${group.$extends} at ${path.join('.')}`,
			);
		}

		// 循环检测
		if (path.includes(parentPath.join('.'))) {
			throw new ExtendsCycleError([...path, parentPath.join('.')]);
		}

		// 查找父 group
		const parentGroup = findGroupAtPath(rootTree, parentPath);
		if (!parentGroup) {
			throw new Error(
				`$extends target not found: ${group.$extends} at ${path.join('.')}`,
			);
		}

		// 验证父是 group 不是 token
		if ('$value' in parentGroup) {
			throw new Error(
				`$extends cannot target a token: ${group.$extends} at ${path.join('.')}`,
			);
		}

		// 递归展开父 group
		const expandedParent = expandGroupExtends(
			parentGroup as DtcgTokenGroup,
			rootTree,
			[...path, parentPath.join('.')],
			rootKeys,
		);

		// Deep merge：父在前，子在后（子覆盖父）
		const merged = deepMergeGroups(expandedParent, result);

		// 复制合并结果
		for (const [key, value] of Object.entries(merged)) {
			result[key] = value;
		}
	}

	// 递归处理子节点
	for (const [key, value] of Object.entries(result)) {
		if (key.startsWith('$')) continue;
		if (
			typeof value === 'object' &&
			value !== null &&
			!Array.isArray(value) &&
			!('$value' in value)
		) {
			result[key] = expandGroupExtends(
				value as DtcgTokenGroup,
				rootTree,
				[...path, key],
				rootKeys,
			);
		}
	}

	return result;
}

// 解析 $extends 路径：{a.b.c} -> ['a', 'b', 'c']，要求首段属于文档内部根 key
function parseExtendsPath(
	extendsValue: string,
	rootKeys: Set<string>,
): string[] | null {
	const match = extendsValue.match(
		/^\{([a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9-]+)*)\}$/,
	);
	if (!match) return null;

	const path = match[1]!.split('.');
	if (!rootKeys.has(path[0]!)) return null;

	return path;
}

// 根据路径查找 group
function findGroupAtPath(
	tree: DtcgTokenGroup,
	path: string[],
): DtcgTokenGroup | undefined {
	let current: unknown = tree;

	for (const segment of path) {
		if (
			typeof current !== 'object' ||
			current === null ||
			Array.isArray(current)
		) {
			return undefined;
		}
		current = (current as Record<string, unknown>)[segment];
	}

	if (
		typeof current === 'object' &&
		current !== null &&
		!Array.isArray(current)
	) {
		return current as DtcgTokenGroup;
	}

	return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeExtensions(
	parentExtensions: unknown,
	childExtensions: unknown,
): unknown {
	if (!isPlainObject(parentExtensions) || !isPlainObject(childExtensions)) {
		return childExtensions;
	}

	const result: Record<string, unknown> = {
		...parentExtensions,
		...childExtensions,
	};
	return result;
}

// Deep merge 两个 group：parent 被 child 覆盖
function deepMergeGroups(
	parent: DtcgTokenGroup,
	child: DtcgTokenGroup,
): DtcgTokenGroup {
	const result: DtcgTokenGroup = {};

	// 先复制父的所有属性
	for (const [key, value] of Object.entries(parent)) {
		if (key.startsWith('$')) {
			result[key] = value;
		} else {
			result[key] = value;
		}
	}

	// 再用子的属性覆盖
	for (const [key, childValue] of Object.entries(child)) {
		if (key.startsWith('$')) {
			if (key === '$extensions') {
				result[key] = mergeExtensions(result.$extensions, childValue) as
					| Record<string, unknown>
					| undefined;
			} else {
				// $type, $description 等：子直接覆盖父
				result[key] = childValue;
			}
		} else if (
			typeof childValue === 'object' &&
			childValue !== null &&
			!Array.isArray(childValue) &&
			!('$value' in childValue)
		) {
			// 子属性是嵌套 group
			const parentValue = result[key];
			if (
				typeof parentValue === 'object' &&
				parentValue !== null &&
				!Array.isArray(parentValue) &&
				!('$value' in parentValue)
			) {
				// 父也是 group，递归 merge
				result[key] = deepMergeGroups(
					parentValue as DtcgTokenGroup,
					childValue as DtcgTokenGroup,
				);
			} else {
				// 父不存在或不是 group，直接用子
				result[key] = childValue;
			}
		} else {
			// 子属性是 token 或其他值，直接覆盖
			result[key] = childValue;
		}
	}

	return result;
}

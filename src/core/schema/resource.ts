import { z } from 'zod';
import type { ParseError } from '../../types/index.ts';

/**
 * 通用资源文件结构校验
 *
 * 规则：
 * - 根节点必须是对象
 * - 恰好有 1 个顶层 namespace（排除 $schema）
 * - namespace 的值必须是对象
 */
export function validateGenericResource(
  parsed: Record<string, unknown>,
  _filePath?: string
): { success: true; namespace: string; data: Record<string, unknown> } | { success: false; error: ParseError } {
  const keys = Object.keys(parsed).filter((k) => k !== '$schema');

  if (keys.length === 0) {
    return {
      success: false,
      error: { line: 1, message: 'Resource file root must be a non-empty object' },
    };
  }

  if (keys.length > 1) {
    return {
      success: false,
      error: {
        line: 1,
        message: `Resource file must have exactly one top-level namespace, found ${keys.length}: ${keys.join(', ')}`,
      },
    };
  }

  const namespace = keys[0]!;
  const data = parsed[namespace];

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      success: false,
      error: { line: 1, message: `Namespace "${namespace}" must be an object` },
    };
  }

  return { success: true, namespace, data: data as Record<string, unknown> };
}

/**
 * 校验 custom 资源扩展名是否合法
 */
export function validateCustomResourceExtension(filePath: string): ParseError | null {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.yaml') || lower.endsWith('.yml') || lower.endsWith('.json')) {
    return null;
  }
  return {
    line: 1,
    message: `Unsupported custom resource format: ${filePath}. Only .yml, .yaml, .json are supported.`,
  };
}

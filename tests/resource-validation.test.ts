import { describe, test, expect } from 'bun:test';
import { validateGenericResource, validateCustomResourceExtension } from '../src/core/schema/resource.ts';
import { validatePaletteSchema, validateDimensionSchema } from '../src/core/parser/index.ts';

describe('validateGenericResource', () => {
  test('accepts a valid resource with exactly one namespace', () => {
    const result = validateGenericResource({ leonardo: { global: { color: {} } } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.namespace).toBe('leonardo');
    }
  });

  test('rejects empty object', () => {
    const result = validateGenericResource({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('non-empty object');
      expect(result.error.line).toBe(1);
    }
  });

  test('rejects multiple top-level namespaces', () => {
    const result = validateGenericResource({
      leonardo: { global: { color: {} } },
      tailwind: { global: { color: {} } },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('exactly one top-level namespace');
      expect(result.error.line).toBe(1);
    }
  });

  test('ignores $schema when counting namespaces', () => {
    const result = validateGenericResource({
      $schema: 'http://json-schema.org/draft-07/schema#',
      leonardo: { global: { color: {} } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.namespace).toBe('leonardo');
    }
  });

  test('rejects namespace that is not an object', () => {
    const result = validateGenericResource({ leonardo: 'string' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('must be an object');
      expect(result.error.line).toBe(1);
    }
  });

  test('rejects namespace that is an array', () => {
    const result = validateGenericResource({ leonardo: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('must be an object');
    }
  });
});

describe('validateCustomResourceExtension', () => {
  test('accepts .yaml', () => {
    expect(validateCustomResourceExtension('./colors.yaml')).toBeNull();
  });

  test('accepts .yml', () => {
    expect(validateCustomResourceExtension('./colors.yml')).toBeNull();
  });

  test('accepts .json', () => {
    expect(validateCustomResourceExtension('./colors.json')).toBeNull();
  });

  test('rejects unsupported extension', () => {
    const error = validateCustomResourceExtension('./colors.csv');
    expect(error).not.toBeNull();
    expect(error!.message).toContain('Unsupported custom resource format');
  });
});

describe('validatePaletteSchema', () => {
  test('accepts a valid palette YAML', async () => {
    const yaml = `
leonardo:
  global:
    color:
      $type: color
      black:
        $value: "#000000"
`;
    const error = await validatePaletteSchema(yaml);
    expect(error).toBeNull();
  });

  test('rejects palette with multiple namespaces', async () => {
    const yaml = `
leonardo:
  global:
    color:
      $type: color
tailwind:
  global:
    color:
      $type: color
`;
    const error = await validatePaletteSchema(yaml);
    expect(error).not.toBeNull();
    expect(error!.message).toContain('exactly one top-level namespace');
  });

  test('rejects palette missing global.color', async () => {
    const yaml = `
leonardo:
  global: {}
`;
    const error = await validatePaletteSchema(yaml);
    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toContain('validation failed');
  });

  test('reports YAML syntax error with line number', async () => {
    const yaml = 'leonardo:\n  global:\n    color: [ : invalid';
    const error = await validatePaletteSchema(yaml);
    expect(error).not.toBeNull();
    expect(error!.line).toBeGreaterThanOrEqual(1);
    expect(error!.message.toLowerCase()).toContain('yaml');
  });
});

describe('validateDimensionSchema', () => {
  test('accepts a valid dimension YAML', async () => {
    const yaml = `
wave:
  global:
    dimension:
      alpha:
        50:
          $value: 0
`;
    const error = await validateDimensionSchema(yaml);
    expect(error).toBeNull();
  });

  test('rejects dimension with multiple namespaces', async () => {
    const yaml = `
wave:
  global:
    dimension: {}
other:
  global:
    dimension: {}
`;
    const error = await validateDimensionSchema(yaml);
    expect(error).not.toBeNull();
    expect(error!.message).toContain('exactly one top-level namespace');
  });

  test('rejects dimension missing global.dimension', async () => {
    const yaml = `
wave:
  global: {}
`;
    const error = await validateDimensionSchema(yaml);
    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toContain('validation failed');
  });

  test('reports YAML syntax error with line number', async () => {
    const yaml = 'wave:\n  global:\n    dimension: [ : invalid';
    const error = await validateDimensionSchema(yaml);
    expect(error).not.toBeNull();
    expect(error!.line).toBeGreaterThanOrEqual(1);
    expect(error!.message.toLowerCase()).toContain('yaml');
  });
});

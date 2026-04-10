import { describe, expect, test } from 'bun:test';
import { validateThemeSchema } from '../src/core/schema/theme.ts';
import type { DtcgTokenGroup } from '../src/types/index.ts';

describe('inheritColor Schema Validation', () => {
  describe('Valid inheritColor usage', () => {
    test('should accept inheritColor: true on color token', () => {
      const tree: DtcgTokenGroup = {
        theme: {
          color: {
            primary: {
              $type: 'color',
              $value: '#0066cc',
              $extensions: {
                inheritColor: true,
              },
            },
          },
        },
      };

      const result = validateThemeSchema(tree);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    test('should accept inheritColor object with opacity number', () => {
      const tree: DtcgTokenGroup = {
        theme: {
          color: {
            primary: {
              $type: 'color',
              $value: '#0066cc',
              $extensions: {
                inheritColor: {
                  property: {
                    opacity: 0.5,
                  },
                },
              },
            },
          },
        },
      };

      const result = validateThemeSchema(tree);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    test('should accept inheritColor object with opacity alias', () => {
      const tree: DtcgTokenGroup = {
        theme: {
          color: {
            primary: {
              $type: 'color',
              $value: '#0066cc',
              $extensions: {
                inheritColor: {
                  property: {
                    opacity: '{theme.opacity.medium}',
                  },
                },
              },
            },
          },
        },
      };

      const result = validateThemeSchema(tree);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    test('should accept inheritColor object with opacity $ref', () => {
      const tree: DtcgTokenGroup = {
        theme: {
          color: {
            primary: {
              $type: 'color',
              $value: '#0066cc',
              $extensions: {
                inheritColor: {
                  property: {
                    opacity: { $ref: '#/theme/opacity/medium/$value' },
                  },
                },
              },
            },
          },
        },
      };

      const result = validateThemeSchema(tree);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    test('should accept inheritColor with siblingSlot', () => {
      const tree: DtcgTokenGroup = {
        theme: {
          color: {
            primary: {
              $type: 'color',
              $value: '#0066cc',
              $extensions: {
                inheritColor: {
                  siblingSlot: 'label',
                },
              },
            },
          },
        },
      };

      const result = validateThemeSchema(tree);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    test('should accept inheritColor with both opacity and siblingSlot', () => {
      const tree: DtcgTokenGroup = {
        theme: {
          color: {
            primary: {
              $type: 'color',
              $value: '#0066cc',
              $extensions: {
                inheritColor: {
                  property: {
                    opacity: 0.5,
                  },
                  siblingSlot: 'label',
                },
              },
            },
          },
        },
      };

      const result = validateThemeSchema(tree);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('Invalid inheritColor usage', () => {
    test('should reject inheritColor on shadow token', () => {
      const tree: DtcgTokenGroup = {
        theme: {
          shadow: {
            elevated: {
              $type: 'shadow',
              $value: [
                {
                  color: '#000000',
                  offsetX: 0,
                  offsetY: 4,
                  blur: 8,
                  spread: 0,
                },
              ],
              $extensions: {
                inheritColor: true,
              },
            },
          },
        },
      };

      const result = validateThemeSchema(tree);
      expect(result.valid).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          level: 'error',
          message: 'inheritColor can only be used with $type "color", got "shadow"',
        })
      );
    });

    test('should reject inheritColor on border token', () => {
      const tree: DtcgTokenGroup = {
        theme: {
          border: {
            primary: {
              $type: 'border',
              $value: {
                color: '#0066cc',
                width: '1px',
                style: 'solid',
              },
              $extensions: {
                inheritColor: true,
              },
            },
          },
        },
      };

      const result = validateThemeSchema(tree);
      expect(result.valid).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          level: 'error',
          message: 'inheritColor can only be used with $type "color", got "border"',
        })
      );
    });

    test('should reject inheritColor with invalid opacity type', () => {
      const tree: DtcgTokenGroup = {
        theme: {
          color: {
            primary: {
              $type: 'color',
              $value: '#0066cc',
              $extensions: {
                inheritColor: {
                  property: {
                    opacity: true, // invalid type
                  },
                },
              },
            },
          },
        },
      };

      const result = validateThemeSchema(tree);
      expect(result.valid).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          level: 'error',
          path: 'theme.color.primary.$extensions.inheritColor.property.opacity',
          message: 'inheritColor.property.opacity must be a number, alias (string), or $ref object',
        })
      );
    });

    test('should reject inheritColor with invalid string opacity', () => {
      const tree: DtcgTokenGroup = {
        theme: {
          color: {
            primary: {
              $type: 'color',
              $value: '#0066cc',
              $extensions: {
                inheritColor: {
                  property: {
                    opacity: 'not-an-alias', // invalid string
                  },
                },
              },
            },
          },
        },
      };

      const result = validateThemeSchema(tree);
      expect(result.valid).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          level: 'error',
          path: 'theme.color.primary.$extensions.inheritColor.property.opacity',
          message: 'inheritColor.property.opacity must be a number, alias (string), or $ref object',
        })
      );
    });

    test('should reject invalid inheritColor type (string)', () => {
      const tree: DtcgTokenGroup = {
        theme: {
          color: {
            primary: {
              $type: 'color',
              $value: '#0066cc',
              $extensions: {
                inheritColor: 'invalid-string',
              },
            },
          },
        },
      };

      const result = validateThemeSchema(tree);
      expect(result.valid).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          level: 'error',
          path: 'theme.color.primary.$extensions.inheritColor',
          message: 'inheritColor must be a boolean (true) or an object with optional opacity and siblingSlot',
        })
      );
    });
  });

  describe('currentColor deprecation', () => {
    test('should warn about deprecated currentColor', () => {
      const tree: DtcgTokenGroup = {
        theme: {
          color: {
            primary: {
              $type: 'color',
              $value: '#0066cc',
              $extensions: {
                currentColor: {
                  opacity: 0.5,
                },
              },
            },
          },
        },
      };

      const result = validateThemeSchema(tree);
      // currentColor itself doesn't cause validation error, just warning
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          level: 'warning',
          path: 'theme.color.primary.$extensions',
          message: 'currentColor is deprecated, use inheritColor instead',
        })
      );
    });
  });
});

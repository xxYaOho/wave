import { describe, expect, test } from 'bun:test';
import {
	ExtendsCycleError,
	expandExtends,
} from '../src/core/resolver/theme-reference.ts';
import type { DtcgTokenGroup } from '../src/types/index.ts';

describe('group $extends inheritance', () => {
	test('basic group inheritance with $extends', () => {
		const tree: DtcgTokenGroup = {
			theme: {
				button: {
					base: {
						$type: 'color',
						background: { $value: '#cccccc' },
						text: { $value: '#333333' },
					},
					primary: {
						$extends: '{theme.button.base}',
						background: { $value: '#0066cc' },
					},
				},
			},
		};

		const result = expandExtends(tree, new Set(['theme']));
		const primary = (
			result.theme as {
				button: {
					primary: { background: { $value: string }; text: { $value: string } };
				};
			}
		).button.primary;

		// Should inherit text from base
		expect(primary.text.$value).toBe('#333333');
		// Should override background
		expect(primary.background.$value).toBe('#0066cc');
	});

	test('$extends is removed after expansion', () => {
		const tree: DtcgTokenGroup = {
			theme: {
				base: {
					$type: 'color',
					value: { $value: '#cccccc' },
				},
				derived: {
					$extends: '{theme.base}',
					value: { $value: '#ff0000' },
				},
			},
		};

		const result = expandExtends(tree, new Set(['theme']));
		const derived = (result.theme as Record<string, unknown>)
			?.derived as Record<string, unknown>;

		expect('$extends' in derived).toBe(false);
		expect(derived.value).toBeDefined();
	});

	test('circular $extends throws ExtendsCycleError', () => {
		const tree: DtcgTokenGroup = {
			theme: {
				a: {
					$extends: '{theme.b}',
					value: { $value: '#ff0000' },
				},
				b: {
					$extends: '{theme.a}',
					value: { $value: '#00ff00' },
				},
			},
		};

		expect(() => expandExtends(tree, new Set(['theme']))).toThrow(
			ExtendsCycleError,
		);
	});

	test('overwrites sketch extension fields during extends', () => {
		const tree: DtcgTokenGroup = {
			theme: {
				base: {
					$extensions: {
						sketch: {
							path: 'foundation/base',
							property: { opacity: true },
						},
						smoothShadow: {
							step: 3,
							target: { alpha: 0.1 },
						},
					},
					value: { $value: 1, $type: 'number' },
				},
				derived: {
					$extends: '{theme.base}',
					$extensions: {
						sketch: {
							property: { cornerRadius: true },
						},
						smoothShadow: {
							step: 4,
						},
					},
				},
			},
		};

		const expanded = expandExtends(tree, new Set(['theme']));
		const derived = (expanded.theme as Record<string, unknown>)
			.derived as Record<string, unknown>;
		const extensions = derived.$extensions as Record<string, unknown>;

		expect(extensions.sketch).toEqual({
			property: { cornerRadius: true },
		});
		expect(extensions.smoothShadow).toEqual({ step: 4 });
	});

	test('keeps non-sketch extension override semantics during extends', () => {
		const tree: DtcgTokenGroup = {
			theme: {
				base: {
					$extensions: {
						smoothGradient: {
							steps: 5,
							curve: [0, 0, 1, 1],
						},
						inheritColor: {
							property: { opacity: 0.2 },
							siblingSlot: 'foreground',
						},
						composite: true,
					},
					value: { $value: 1, $type: 'number' },
				},
				derived: {
					$extends: '{theme.base}',
					$extensions: {
						smoothGradient: { steps: 7 },
						inheritColor: { property: { alpha: 0.4 } },
						composite: false,
					},
				},
			},
		};

		const expanded = expandExtends(tree, new Set(['theme']));
		const derived = (expanded.theme as Record<string, unknown>)
			.derived as Record<string, unknown>;
		const extensions = derived.$extensions as Record<string, unknown>;

		expect(extensions.smoothGradient).toEqual({ steps: 7 });
		expect(extensions.inheritColor).toEqual({ property: { alpha: 0.4 } });
		expect(extensions.composite).toBe(false);
	});

	test('replaces the typography extension namespace during extends', () => {
		const tree: DtcgTokenGroup = {
			theme: {
				base: {
					$type: 'typography',
					$extensions: {
						typography: {
							defaults: { fontFamily: 'Inter', fontWeight: 400 },
						},
					},
				},
				derived: {
					$extends: '{theme.base}',
					$extensions: {
						typography: { defaults: { fontFamily: 'Helvetica' } },
					},
				},
			},
		};

		const expanded = expandExtends(tree, new Set(['theme']));
		const theme = expanded.theme as Record<string, unknown>;
		const derived = theme.derived as Record<string, unknown>;
		const extensions = derived.$extensions as Record<string, unknown>;
		expect(extensions.typography).toEqual({
			defaults: { fontFamily: 'Helvetica' },
		});
	});

	test('deep merges nested groups while child tokens override parent tokens', () => {
		const tree: DtcgTokenGroup = {
			theme: {
				card: {
					base: {
						$type: 'dimension',
						padding: {
							sm: { $value: 8 },
							md: { $value: 12 },
						},
						radius: {
							sm: { $value: 4 },
						},
						state: {
							default: { $value: 'base' },
						},
					},
					compact: {
						$extends: '{theme.card.base}',
						padding: {
							sm: { $value: 6 },
						},
						state: {
							hover: { $value: 'compact-hover' },
						},
					},
				},
			},
		};

		const expanded = expandExtends(tree, new Set(['theme']));
		const compact = (
			expanded.theme as {
				card: {
					compact: {
						padding: { sm: { $value: number }; md: { $value: number } };
						radius: { sm: { $value: number } };
						state: {
							default: { $value: string };
							hover: { $value: string };
						};
					};
				};
			}
		).card.compact;

		expect(compact.padding.sm.$value).toBe(6);
		expect(compact.padding.md.$value).toBe(12);
		expect(compact.radius.sm.$value).toBe(4);
		expect(compact.state.default.$value).toBe('base');
		expect(compact.state.hover.$value).toBe('compact-hover');
	});
});

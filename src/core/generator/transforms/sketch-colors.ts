import type { Format, Dictionary, TransformedToken } from 'style-dictionary/types';

export interface SketchColorsFormatOptions {
  filterLayer?: number;
}

function isColorToken(token: TransformedToken): boolean {
  return token.type === 'color' || token.$type === 'color';
}

function buildNestedTree(
  tokens: TransformedToken[],
  filterLayer: number
): Record<string, unknown> {
  const root: Record<string, unknown> = {};

  for (const token of tokens) {
    if (!isColorToken(token)) {
      continue;
    }

    const tokenValue = token.$value ?? token.value;
    if (tokenValue === undefined) {
      continue;
    }

    const path = token.path;
    const effectivePath = filterLayer > 0 ? path.slice(filterLayer) : path;

    if (effectivePath.length === 0) {
      continue;
    }

    let current: Record<string, unknown> = root;
    for (let i = 0; i < effectivePath.length - 1; i++) {
      const key = effectivePath[i]!;
      if (typeof current[key] !== 'object' || current[key] === null) {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }

    const lastKey = effectivePath[effectivePath.length - 1]!;
    current[lastKey] = tokenValue;
  }

  return root;
}

export const sketchColorsFormat: Format = {
  name: 'wave/sketch-colors',
  format: ({ dictionary, options }: { dictionary: Dictionary; options: Record<string, unknown> }) => {
    const filterLayer = (options?.filterLayer as number) ?? 0;

    const sortedTokens = [...dictionary.allTokens].sort(
      (a, b) => (a._order ?? 0) - (b._order ?? 0)
    );

    const tree = buildNestedTree(sortedTokens, filterLayer);

    return JSON.stringify(tree, null, 2);
  },
};

export default sketchColorsFormat;

import type { Transform, TransformedToken } from 'style-dictionary/types';
import { transformTypes } from 'style-dictionary/enums';

export const valueCssVarTransform: Transform = {
  name: 'wave/value/cssVar',
  type: transformTypes.value,
  transitive: true,
  filter: (token: TransformedToken) => {
    return token.type === 'color' || token.$type === 'color';
  },
  transform: (token: TransformedToken) => {
    const varName = token.path.join('-').toLowerCase();
    return `var(--${varName})`;
  },
};

export default valueCssVarTransform;

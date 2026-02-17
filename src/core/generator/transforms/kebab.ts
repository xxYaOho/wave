import type { Transform, TransformedToken } from 'style-dictionary/types';
import { transformTypes } from 'style-dictionary/enums';

export const nameKebabTransform: Transform = {
  name: 'wave/name/kebab',
  type: transformTypes.name,
  transform: (token: TransformedToken) => {
    return token.path.join('-').toLowerCase();
  },
};

export default nameKebabTransform;

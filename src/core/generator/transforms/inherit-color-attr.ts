import type { Transform, TransformedToken } from "style-dictionary/types";
import { transformTypes } from "style-dictionary/enums";

/**
 * Transform to copy inheritColor metadata from token value to token attributes
 * This makes inheritColor metadata accessible to formatters
 */
export const inheritColorAttributeTransform: Transform = {
  name: "wave/attribute/inheritColor",
  type: transformTypes.attribute,
  filter: (token: TransformedToken) => {
    // Check if token has inheritColor-related metadata in value
    const tokenValue = token.value ?? token.$value;
    if (typeof tokenValue === "object" && tokenValue !== null) {
      return (
        "inheritColor" in tokenValue ||
        "inheritColorOpacity" in tokenValue ||
        "inheritColorAlpha" in tokenValue ||
        "inheritColorSiblingSlot" in tokenValue ||
        "currentColorOpacity" in tokenValue ||
        "currentColorShadowAlpha" in tokenValue
      );
    }
    return false;
  },
  transform: (token: TransformedToken) => {
    const tokenValue = token.value ?? token.$value;
    if (typeof tokenValue !== "object" || tokenValue === null) {
      return token;
    }

    const value = tokenValue as Record<string, unknown>;
    const attrs: Record<string, unknown> = {};

    // Copy inheritColor metadata to token attributes
    if ("inheritColor" in value) {
      attrs.inheritColor = value.inheritColor;
    }
    if ("inheritColorOpacity" in value) {
      attrs.inheritColorOpacity = value.inheritColorOpacity;
    }
    if ("inheritColorAlpha" in value) {
      attrs.inheritColorAlpha = value.inheritColorAlpha;
    }
    if ("inheritColorSiblingSlot" in value) {
      attrs.inheritColorSiblingSlot = value.inheritColorSiblingSlot;
    }
    if ("currentColorOpacity" in value) {
      attrs.currentColorOpacity = value.currentColorOpacity;
    }
    if ("currentColorShadowAlpha" in value) {
      attrs.currentColorShadowAlpha = value.currentColorShadowAlpha;
    }

    return attrs;
  },
};

export default inheritColorAttributeTransform;

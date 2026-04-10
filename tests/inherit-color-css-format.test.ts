import { describe, expect, test } from "bun:test";
import { cssVariablesWithDescFormat } from "../src/core/generator/transforms/css-variables-with-desc.ts";
import type { TransformedToken } from "style-dictionary/types";
import type { Dictionary } from "style-dictionary/types";

function createMockDictionary(tokens: Partial<TransformedToken>[]): Dictionary {
  return {
    allTokens: tokens.map((t, i) => ({
      name: t.name || `token-${i}`,
      path: t.path || ["theme", "color", `token-${i}`],
      value: t.value || "#000000",
      $value: t.$value || "#000000",
      _order: t._order ?? i,
      // Include custom attributes
      ...t,
    })) as TransformedToken[],
    tokens: {},
  };
}

describe("inheritColor CSS Format", () => {
  test("should output currentColor for inheritColor: true", () => {
    const dictionary = createMockDictionary([
      {
        name: "theme-color-primary",
        path: ["theme", "color", "primary"],
        value: "#0066cc",
        $value: "#0066cc",
        type: "color",
        inheritColor: true,
      },
    ]);

    const result = cssVariablesWithDescFormat.format({ dictionary, options: {}, file: {} as any });
    expect(result).toContain("currentColor");
    expect(result).not.toContain("color-mix");
  });

  test("should output color-mix for inheritColor with opacity", () => {
    const dictionary = createMockDictionary([
      {
        name: "theme-color-primary",
        path: ["theme", "color", "primary"],
        value: "#0066cc",
        $value: "#0066cc",
        type: "color",
        inheritColor: true,
        inheritColorOpacity: 0.12,
      },
    ]);

    const result = cssVariablesWithDescFormat.format({ dictionary, options: {}, file: {} as any });
    expect(result).toContain("color-mix(in srgb, currentColor 12%, transparent)");
  });

  test("should output color-mix with correct percentage for different opacity values", () => {
    const dictionary = createMockDictionary([
      {
        name: "theme-color-semi",
        path: ["theme", "color", "semi"],
        value: "#cc0000",
        $value: "#cc0000",
        type: "color",
        inheritColor: true,
        inheritColorOpacity: 0.5,
      },
    ]);

    const result = cssVariablesWithDescFormat.format({ dictionary, options: {}, file: {} as any });
    expect(result).toContain("color-mix(in srgb, currentColor 50%, transparent)");
  });

  test("should still support legacy currentColorOpacity", () => {
    const dictionary = createMockDictionary([
      {
        name: "theme-color-legacy",
        path: ["theme", "color", "legacy"],
        value: "#0066cc",
        $value: "#0066cc",
        type: "color",
        currentColorOpacity: 0.3,
      },
    ]);

    const result = cssVariablesWithDescFormat.format({ dictionary, options: {}, file: {} as any });
    expect(result).toContain("color-mix(in srgb, currentColor 30%, transparent)");
  });

  test("should not affect non-inheritColor tokens", () => {
    const dictionary = createMockDictionary([
      {
        name: "theme-color-normal",
        path: ["theme", "color", "normal"],
        value: "#ff0000",
        $value: "#ff0000",
        type: "color",
      },
    ]);

    const result = cssVariablesWithDescFormat.format({ dictionary, options: {}, file: {} as any });
    expect(result).toContain("#ff0000");
    expect(result).not.toContain("currentColor");
  });

  test("should not leak siblingSlot into CSS output", () => {
    const dictionary = createMockDictionary([
      {
        name: "theme-color-border",
        path: ["theme", "color", "border"],
        value: "#cc0000",
        $value: "#cc0000",
        type: "color",
        inheritColor: true,
        inheritColorSiblingSlot: "label",
      },
    ]);

    const result = cssVariablesWithDescFormat.format({ dictionary, options: {}, file: {} as any });
    expect(result).toContain("currentColor");
    expect(result).not.toContain("label");
    expect(result).not.toContain("siblingSlot");
  });
});

import { describe, expect, it } from "vitest";

import { DEFAULT_READER_SETTINGS } from "@/lib/reader/defaults";

import {
  createEpubSurfaceStyle,
  createEpubThemeRules,
  createFoliateEpubStyles,
  getEpubContentWidth,
} from "./theme";

describe("EPUB theme", () => {
  it("clamps content width and emits reader typography", () => {
    const settings = {
      ...DEFAULT_READER_SETTINGS,
      contentWidth: 2_000,
      fontSize: 23,
      lineHeight: 2,
      paragraphSpacing: 1.1,
    };
    const rules = createEpubThemeRules(settings);
    const surface = createEpubSurfaceStyle(settings);

    expect(getEpubContentWidth(settings)).toBe(980);
    expect(rules.body["font-size"]).toBe("23px !important");
    expect(rules.body["line-height"]).toBe("2 !important");
    expect(rules["body, body *"]["line-height"]).toBe("2 !important");
    expect(rules["body p"]["margin-bottom"]).toBe("1.1em !important");
    expect(surface["--epub-content-width" as keyof typeof surface]).toBe(
      "980px",
    );
  });

  it("does not add body padding to Foliate columns", () => {
    const styles = createFoliateEpubStyles(DEFAULT_READER_SETTINGS);

    expect(styles).toContain("padding-left:0 !important");
    expect(styles).toContain("padding-right:0 !important");
  });

  it("falls back to safe colors for malformed custom settings", () => {
    const settings = {
      ...DEFAULT_READER_SETTINGS,
      themeId: "custom" as const,
      customBackground: "red; background-image: url(https://bad)",
      customForeground: "not-a-color",
    };
    const rules = createEpubThemeRules(settings);
    const serialized = JSON.stringify(rules);

    expect(rules["html, body"]["background-color"]).toBe(
      "#fffdf8 !important",
    );
    expect(rules["html, body"].color).toBe("#24231f !important");
    expect(serialized).not.toContain("https://bad");
  });
});

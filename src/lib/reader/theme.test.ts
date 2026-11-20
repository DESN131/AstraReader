import { describe, expect, it } from "vitest";

import {
  DEFAULT_READER_SETTINGS,
  resolveReaderTheme,
} from "@/lib/reader/defaults";
import { normalizeReaderSettings } from "@/lib/reader/settings";
import { createAppThemeVariables } from "@/lib/reader/theme";

describe("reader themes", () => {
  it("provides a VS Code-like graphite theme for the app and reader", () => {
    const settings = {
      ...DEFAULT_READER_SETTINGS,
      themeId: "graphite" as const,
    };
    const theme = resolveReaderTheme(settings);
    const variables = createAppThemeVariables(theme);

    expect(theme.label).toContain("VS Code");
    expect(theme.dark).toBe(true);
    expect(theme.background).toBe("#1e1e1e");
    expect(theme.accent).toBe("#007acc");
    expect(variables["--background"]).toBe("#1e1e1e");
    expect(variables["--foreground"]).toBe("#d4d4d4");
  });

  it("falls back safely when stored settings contain an unknown theme", () => {
    const settings = normalizeReaderSettings({
      ...DEFAULT_READER_SETTINGS,
      themeId: "removed-theme" as "paper",
      fontSize: 80,
    });

    expect(settings.themeId).toBe("paper");
    expect(settings.fontSize).toBe(32);
  });

  it("preserves the vertical scroll reading mode", () => {
    const settings = normalizeReaderSettings({
      ...DEFAULT_READER_SETTINGS,
      animation: "scroll",
    });

    expect(settings.animation).toBe("scroll");
  });
});

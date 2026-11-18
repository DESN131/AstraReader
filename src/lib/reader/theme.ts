import type { CSSProperties } from "react";

import {
  type ReaderTheme,
  resolveReaderTheme,
} from "@/lib/reader/defaults";
import type { ReaderSettings } from "@/shared/types";

export interface AppThemeVariables {
  "--background": string;
  "--surface": string;
  "--surface-raised": string;
  "--foreground": string;
  "--muted": string;
  "--line": string;
  "--accent": string;
  "--accent-strong": string;
  "--accent-soft": string;
}

export function createAppThemeVariables(
  theme: ReaderTheme,
): AppThemeVariables {
  return {
    "--background": theme.background,
    "--surface": `color-mix(in srgb, ${theme.background} 94%, ${theme.foreground} 6%)`,
    "--surface-raised": `color-mix(in srgb, ${theme.background} 86%, ${theme.foreground} 14%)`,
    "--foreground": theme.foreground,
    "--muted": theme.muted,
    "--line": theme.border,
    "--accent": theme.accent,
    "--accent-strong": theme.accentStrong,
    "--accent-soft": theme.accentSoft,
  };
}

export function createAppThemeStyle(
  settings: ReaderSettings,
): CSSProperties {
  return createAppThemeVariables(resolveReaderTheme(settings)) as CSSProperties;
}

export function applyAppTheme(settings: ReaderSettings): void {
  if (typeof document === "undefined") {
    return;
  }

  const theme = resolveReaderTheme(settings);
  const variables = createAppThemeVariables(theme);
  const root = document.documentElement;

  for (const [name, value] of Object.entries(variables)) {
    root.style.setProperty(name, value);
  }

  root.dataset.astraTheme = theme.id;
  root.style.colorScheme = theme.dark ? "dark" : "light";
}

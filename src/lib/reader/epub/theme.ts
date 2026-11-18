import type { CSSProperties } from "react";

import {
  FONT_STACKS,
  resolveReaderTheme,
} from "@/lib/reader/defaults";
import type { ReaderSettings } from "@/shared/types";

const HEX_COLOR = /^#[\da-f]{3,8}$/i;
const FUNCTIONAL_COLOR = /^(?:rgb|hsl)a?\([^)]*\)$/i;

export type EpubThemeRules = Record<string, Record<string, string>>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function safeColor(value: string, fallback: string): string {
  return HEX_COLOR.test(value) || FUNCTIONAL_COLOR.test(value)
    ? value
    : fallback;
}

export function getEpubContentWidth(settings: ReaderSettings): number {
  return clamp(
    Number.isFinite(settings.contentWidth) ? settings.contentWidth : 760,
    320,
    980,
  );
}

export function createEpubSurfaceStyle(
  settings: ReaderSettings,
): CSSProperties {
  const theme = resolveReaderTheme(settings);

  return {
    "--epub-background": safeColor(theme.background, "#fffdf8"),
    "--epub-foreground": safeColor(theme.foreground, "#24231f"),
    "--epub-muted": safeColor(theme.muted, "#737068"),
    "--epub-border": safeColor(theme.border, "#ddd9cd"),
    "--epub-content-width": `${getEpubContentWidth(settings)}px`,
  } as CSSProperties;
}

export function createEpubThemeRules(
  settings: ReaderSettings,
): EpubThemeRules {
  const theme = resolveReaderTheme(settings);
  const background = safeColor(theme.background, "#fffdf8");
  const foreground = safeColor(theme.foreground, "#24231f");
  const fontSize = clamp(
    Number.isFinite(settings.fontSize) ? settings.fontSize : 19,
    12,
    40,
  );
  const lineHeight = clamp(
    Number.isFinite(settings.lineHeight) ? settings.lineHeight : 1.8,
    1.2,
    2.6,
  );
  const paragraphSpacing = clamp(
    Number.isFinite(settings.paragraphSpacing)
      ? settings.paragraphSpacing
      : 0.8,
    0,
    3,
  );
  const textAlign = settings.textAlign === "left" ? "left" : "justify";
  const fontStack = FONT_STACKS[settings.fontFamily] ?? FONT_STACKS.serif;
  const isDark = theme.dark;

  return {
    "html, body": {
      "background-color": `${background} !important`,
      color: `${foreground} !important`,
      "color-scheme": isDark ? "dark" : "light",
    },
    body: {
      "font-family": `${fontStack} !important`,
      "font-size": `${fontSize}px !important`,
      "line-height": `${lineHeight} !important`,
      "text-align": `${textAlign} !important`,
      "text-justify": "inter-ideograph",
      "overflow-wrap": "break-word",
      "word-break": "normal",
      "column-gap": "0 !important",
      "-webkit-text-size-adjust": "100%",
    },
    "body p, body li, body dd, body dt, body blockquote": {
      "text-align": "inherit !important",
    },
    "body p": {
      "margin-top": "0 !important",
      "margin-bottom": `${paragraphSpacing}em !important`,
    },
    "body h1, body h2, body h3, body h4, body h5, body h6": {
      color: "inherit !important",
      "line-height": "1.35 !important",
      "text-align": "inherit !important",
      "overflow-wrap": "break-word",
    },
    "body img, body svg, body video, body canvas": {
      "max-width": "100% !important",
      height: "auto !important",
    },
    "body img[data-astra-blocked], body video[data-astra-blocked], body audio[data-astra-blocked]":
      {
        display: "none !important",
      },
    "body table": {
      "max-width": "100% !important",
    },
    "body pre, body code": {
      "white-space": "pre-wrap !important",
      "overflow-wrap": "anywhere",
    },
    "body a": {
      color: "inherit !important",
      "text-decoration-color": foreground,
      "text-underline-offset": "0.16em",
    },
    "body ::selection": {
      background: `color-mix(in srgb, ${foreground} 18%, transparent)`,
      color: foreground,
    },
  };
}

import type {
  ReaderFontFamily,
  ReaderSettings,
  ReaderThemeId,
} from "@/shared/types";

export const READER_SETTINGS_STORAGE_KEY = "astra-reader:settings:v1";

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontFamily: "serif",
  fontSize: 19,
  lineHeight: 1.8,
  paragraphSpacing: 0.8,
  contentWidth: 760,
  textAlign: "justify",
  themeId: "paper",
  customBackground: "#f8f5ec",
  customForeground: "#26231e",
  animation: "slide",
};

export const FONT_STACKS: Record<ReaderFontFamily, string> = {
  sans: '"Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif',
  serif: 'Georgia, "Songti SC", SimSun, "Noto Serif CJK SC", serif',
  kai: '"KaiTi", "STKaiti", "Noto Serif CJK SC", serif',
};

export const FONT_LABELS: Record<ReaderFontFamily, string> = {
  sans: "黑体",
  serif: "宋体",
  kai: "楷体",
};

export interface ReaderTheme {
  id: ReaderThemeId;
  label: string;
  background: string;
  foreground: string;
  muted: string;
  border: string;
}

export const READER_THEMES: ReaderTheme[] = [
  {
    id: "paper",
    label: "纸白",
    background: "#fffdf8",
    foreground: "#24231f",
    muted: "#737068",
    border: "#ddd9cd",
  },
  {
    id: "warm",
    label: "米黄",
    background: "#f5ead3",
    foreground: "#332d23",
    muted: "#786d5b",
    border: "#d9c7a4",
  },
  {
    id: "green",
    label: "护眼",
    background: "#dce8dc",
    foreground: "#233128",
    muted: "#647267",
    border: "#bdccbf",
  },
  {
    id: "night",
    label: "深灰",
    background: "#252927",
    foreground: "#e7e5de",
    muted: "#a8aca6",
    border: "#3b413e",
  },
  {
    id: "black",
    label: "纯黑",
    background: "#0c0e0d",
    foreground: "#d8dad5",
    muted: "#8d918c",
    border: "#282c29",
  },
  {
    id: "custom",
    label: "自定义",
    background: "#f8f5ec",
    foreground: "#26231e",
    muted: "#777168",
    border: "#ddd7ca",
  },
];

export function resolveReaderTheme(settings: ReaderSettings): ReaderTheme {
  if (settings.themeId === "custom") {
    return {
      ...READER_THEMES[READER_THEMES.length - 1],
      background: settings.customBackground,
      foreground: settings.customForeground,
    };
  }

  return (
    READER_THEMES.find((theme) => theme.id === settings.themeId) ??
    READER_THEMES[0]
  );
}

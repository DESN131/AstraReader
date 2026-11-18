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
  accent: string;
  accentStrong: string;
  accentSoft: string;
  dark: boolean;
}

export const READER_THEMES: ReaderTheme[] = [
  {
    id: "paper",
    label: "纸白",
    background: "#fffdf8",
    foreground: "#24231f",
    muted: "#737068",
    border: "#ddd9cd",
    accent: "#176b5b",
    accentStrong: "#0b5144",
    accentSoft: "#dcece6",
    dark: false,
  },
  {
    id: "warm",
    label: "米黄",
    background: "#f5ead3",
    foreground: "#332d23",
    muted: "#786d5b",
    border: "#d9c7a4",
    accent: "#7b5a24",
    accentStrong: "#624417",
    accentSoft: "#eadbb9",
    dark: false,
  },
  {
    id: "green",
    label: "护眼",
    background: "#dce8dc",
    foreground: "#233128",
    muted: "#647267",
    border: "#bdccbf",
    accent: "#2d6f4f",
    accentStrong: "#1d563b",
    accentSoft: "#c8dcc9",
    dark: false,
  },
  {
    id: "night",
    label: "深灰",
    background: "#252927",
    foreground: "#e7e5de",
    muted: "#a8aca6",
    border: "#3b413e",
    accent: "#4fb39c",
    accentStrong: "#78cbb8",
    accentSoft: "#2d4b43",
    dark: true,
  },
  {
    id: "graphite",
    label: "VS Code 深灰",
    background: "#1e1e1e",
    foreground: "#d4d4d4",
    muted: "#9d9d9d",
    border: "#3c3c3c",
    accent: "#007acc",
    accentStrong: "#0e639c",
    accentSoft: "#264f78",
    dark: true,
  },
  {
    id: "black",
    label: "纯黑",
    background: "#0c0e0d",
    foreground: "#d8dad5",
    muted: "#8d918c",
    border: "#282c29",
    accent: "#68b6a4",
    accentStrong: "#8acdbc",
    accentSoft: "#23322d",
    dark: true,
  },
  {
    id: "custom",
    label: "自定义",
    background: "#f8f5ec",
    foreground: "#26231e",
    muted: "#777168",
    border: "#ddd7ca",
    accent: "#176b5b",
    accentStrong: "#0b5144",
    accentSoft: "#dcece6",
    dark: false,
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

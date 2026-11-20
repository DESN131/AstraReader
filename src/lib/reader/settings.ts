"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import {
  DEFAULT_READER_SETTINGS,
  READER_SETTINGS_STORAGE_KEY,
} from "@/lib/reader/defaults";
import type {
  ReaderAnimation,
  ReaderFontFamily,
  ReaderSettings,
  ReaderTextAlign,
  ReaderThemeId,
} from "@/shared/types";

const SETTINGS_CHANGED_EVENT = "astra-reader:settings-changed";
const THEME_IDS = new Set<ReaderThemeId>([
  "paper",
  "warm",
  "green",
  "night",
  "black",
  "graphite",
  "custom",
]);
const FONT_FAMILIES = new Set<ReaderFontFamily>(["sans", "serif", "kai"]);
const ANIMATIONS = new Set<ReaderAnimation>([
  "slide",
  "fade",
  "none",
  "scroll",
]);
const TEXT_ALIGNS = new Set<ReaderTextAlign>(["left", "justify"]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeReaderSettings(
  input: Partial<ReaderSettings>,
): ReaderSettings {
  return {
    ...DEFAULT_READER_SETTINGS,
    ...input,
    fontFamily: FONT_FAMILIES.has(input.fontFamily as ReaderFontFamily)
      ? (input.fontFamily as ReaderFontFamily)
      : DEFAULT_READER_SETTINGS.fontFamily,
    fontSize: clamp(
      Number(input.fontSize ?? DEFAULT_READER_SETTINGS.fontSize),
      14,
      32,
    ),
    lineHeight: clamp(
      Number(input.lineHeight ?? DEFAULT_READER_SETTINGS.lineHeight),
      1.4,
      2.2,
    ),
    paragraphSpacing: clamp(
      Number(
        input.paragraphSpacing ?? DEFAULT_READER_SETTINGS.paragraphSpacing,
      ),
      0,
      2,
    ),
    contentWidth: clamp(
      Number(input.contentWidth ?? DEFAULT_READER_SETTINGS.contentWidth),
      520,
      980,
    ),
    textAlign: TEXT_ALIGNS.has(input.textAlign as ReaderTextAlign)
      ? (input.textAlign as ReaderTextAlign)
      : DEFAULT_READER_SETTINGS.textAlign,
    themeId: THEME_IDS.has(input.themeId as ReaderThemeId)
      ? (input.themeId as ReaderThemeId)
      : DEFAULT_READER_SETTINGS.themeId,
    animation: ANIMATIONS.has(input.animation as ReaderAnimation)
      ? (input.animation as ReaderAnimation)
      : DEFAULT_READER_SETTINGS.animation,
    customBackground:
      typeof input.customBackground === "string"
        ? input.customBackground
        : DEFAULT_READER_SETTINGS.customBackground,
    customForeground:
      typeof input.customForeground === "string"
        ? input.customForeground
        : DEFAULT_READER_SETTINGS.customForeground,
  };
}

function subscribe(callback: () => void): () => void {
  function handleStorage(event: StorageEvent) {
    if (event.key === READER_SETTINGS_STORAGE_KEY) {
      callback();
    }
  }

  window.addEventListener("storage", handleStorage);
  window.addEventListener(SETTINGS_CHANGED_EVENT, callback);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(SETTINGS_CHANGED_EVENT, callback);
  };
}

function getSnapshot(): string {
  return window.localStorage.getItem(READER_SETTINGS_STORAGE_KEY) ?? "";
}

function getServerSnapshot(): string {
  return "";
}

function parseSnapshot(snapshot: string): ReaderSettings {
  if (!snapshot) {
    return DEFAULT_READER_SETTINGS;
  }

  try {
    return normalizeReaderSettings(
      JSON.parse(snapshot) as Partial<ReaderSettings>,
    );
  } catch {
    return DEFAULT_READER_SETTINGS;
  }
}

export function writeReaderSettings(settings: ReaderSettings): void {
  window.localStorage.setItem(
    READER_SETTINGS_STORAGE_KEY,
    JSON.stringify(settings),
  );
  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
}

export function useReaderSettings(): {
  settings: ReaderSettings;
  setSettings: (settings: ReaderSettings) => void;
} {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const settings = useMemo(() => parseSnapshot(snapshot), [snapshot]);
  const setSettings = useCallback((nextSettings: ReaderSettings) => {
    writeReaderSettings(normalizeReaderSettings(nextSettings));
  }, []);

  return { settings, setSettings };
}

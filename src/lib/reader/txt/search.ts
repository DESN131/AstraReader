import type { SearchResult, TocItem } from "@/shared/types";
import {
  getChapterAtOffset,
  getChapterLabel,
  type TxtChapter,
} from "@/lib/reader/txt/document";

export interface NormalizedSearchIndex {
  text: string;
  offsets: number[];
}

export interface SearchOptions {
  signal?: AbortSignal;
  maxResults?: number;
}

const DEFAULT_MAX_RESULTS = 500;
const YIELD_EVERY_RESULTS = 40;

function abortError(): Error {
  const error = new Error("Search aborted");
  error.name = "AbortError";
  return error;
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function normalizeCodePoint(value: string): string {
  if (/\s/u.test(value)) {
    return " ";
  }

  return value.normalize("NFKC").toLowerCase();
}

export function normalizeForSearch(value: string): string {
  let output = "";
  let pendingSpace = false;

  for (const character of value) {
    const normalized = normalizeCodePoint(character);
    for (const unit of normalized) {
      if (unit === " ") {
        pendingSpace = output.length > 0;
        continue;
      }

      if (pendingSpace) {
        output += " ";
        pendingSpace = false;
      }
      output += unit;
    }
  }

  return output;
}

export function buildNormalizedSearchIndex(
  source: string,
): NormalizedSearchIndex {
  const units: string[] = [];
  const offsets: number[] = [];
  let pendingSpaceOffset = -1;
  let offset = 0;

  for (const character of source) {
    const normalized = normalizeCodePoint(character);
    for (let unitIndex = 0; unitIndex < normalized.length; unitIndex += 1) {
      const unit = normalized[unitIndex];
      if (unit === " ") {
        if (units.length > 0 && pendingSpaceOffset < 0) {
          pendingSpaceOffset = offset;
        }
        continue;
      }

      if (pendingSpaceOffset >= 0) {
        units.push(" ");
        offsets.push(pendingSpaceOffset);
        pendingSpaceOffset = -1;
      }

      units.push(unit);
      offsets.push(offset);
    }

    offset += character.length;
  }

  return { text: units.join(""), offsets };
}

function excerptAt(source: string, start: number, end: number): string {
  const contextBefore = 48;
  const contextAfter = 72;
  const excerptStart = Math.max(0, start - contextBefore);
  let excerptEnd = Math.min(source.length, end + contextAfter);

  if (
    excerptEnd < source.length &&
    /[\ud800-\udbff]/u.test(source[excerptEnd - 1])
  ) {
    excerptEnd += 1;
  }

  return source
    .slice(excerptStart, excerptEnd)
    .replace(/\s+/gu, " ")
    .trim();
}

function resultLabel(
  chapters: TxtChapter[],
  toc: TocItem[],
  offset: number,
): string {
  const chapter = getChapterAtOffset(chapters, offset);
  if (chapter) {
    return chapter.label;
  }

  return toc[0]?.label ?? getChapterLabel(chapters, offset);
}

export async function searchTxtText(
  source: string,
  chapters: TxtChapter[],
  toc: TocItem[],
  query: string,
  normalizedIndex: NormalizedSearchIndex,
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const normalizedQuery = normalizeForSearch(query);
  if (!normalizedQuery) {
    return [];
  }

  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
  const results: SearchResult[] = [];
  let searchFrom = 0;

  while (results.length < maxResults) {
    if (options.signal?.aborted) {
      throw abortError();
    }

    const found = normalizedIndex.text.indexOf(normalizedQuery, searchFrom);
    if (found < 0) {
      break;
    }

    const mappedStart = normalizedIndex.offsets[found] ?? 0;
    const lastQueryCharacter = found + normalizedQuery.length - 1;
    const mappedLast =
      normalizedIndex.offsets[lastQueryCharacter] ?? mappedStart;
    const mappedEnd = Math.min(source.length, mappedLast + 1);
    const chapterId = getChapterAtOffset(chapters, mappedStart)?.id;

    results.push({
      id: `txt-search-${results.length}`,
      location: {
        kind: "txt-offset",
        offset: mappedStart,
        chapterId,
      },
      label: resultLabel(chapters, toc, mappedStart),
      excerpt: excerptAt(source, mappedStart, mappedEnd),
    });

    searchFrom = found + Math.max(1, normalizedQuery.length);

    if (results.length % YIELD_EVERY_RESULTS === 0) {
      await yieldToEventLoop();
    }
  }

  return results;
}

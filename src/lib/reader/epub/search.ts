import type { Book } from "epubjs";

import type { SearchResult, TocItem } from "@/shared/types";

import {
  createEpubChapterLabelLookup,
  findEpubChapterLabel,
} from "./navigation";

export const EPUB_MAX_SEARCH_RESULTS = 200;
export const EPUB_MAX_SEARCH_QUERY_LENGTH = 160;
export const EPUB_MAX_SEARCH_SECTIONS = 2000;

interface EpubFindMatch {
  cfi?: string;
  excerpt?: string;
}

interface EpubSearchSection {
  index: number;
  href: string;
  load(request: (path: string) => Promise<unknown>): Promise<unknown>;
  find(query: string): EpubFindMatch[];
}

export interface SearchEpubOptions {
  book: Book;
  toc: TocItem[];
  query: string;
  signal?: AbortSignal;
}

function createAbortError(): Error {
  return new DOMException("搜索已取消", "AbortError");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function cleanExcerpt(value: string | undefined): string {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

export async function searchEpubBook({
  book,
  toc,
  query,
  signal,
}: SearchEpubOptions): Promise<SearchResult[]> {
  const normalizedQuery = query
    .trim()
    .slice(0, EPUB_MAX_SEARCH_QUERY_LENGTH);

  if (!normalizedQuery) {
    return [];
  }

  const labels = createEpubChapterLabelLookup(toc);
  const results: SearchResult[] = [];
  const sectionCount = Math.min(
    Number((book.spine as unknown as { length?: number }).length ?? 0),
    EPUB_MAX_SEARCH_SECTIONS,
  );
  let firstError: Error | null = null;
  let loadedSections = 0;

  for (let index = 0; index < sectionCount; index += 1) {
    throwIfAborted(signal);

    const section = book.spine.get(index) as unknown as
      | EpubSearchSection
      | null;

    if (!section) {
      continue;
    }

    try {
      await section.load(book.load.bind(book));
      throwIfAborted(signal);
      loadedSections += 1;

      const matches = section.find(normalizedQuery);

      for (
        let matchIndex = 0;
        matchIndex < matches.length &&
        results.length < EPUB_MAX_SEARCH_RESULTS;
        matchIndex += 1
      ) {
        const match = matches[matchIndex];
        const cfi = match.cfi?.trim();

        if (!cfi) {
          continue;
        }

        results.push({
          id: `epub-search-${section.index}-${matchIndex}-${cfi}`,
          location: {
            kind: "epub-cfi",
            cfi,
            href: section.href,
          },
          label:
            findEpubChapterLabel(labels, section.href) ||
            `第 ${section.index + 1} 节`,
          excerpt: cleanExcerpt(match.excerpt),
        });
      }
    } catch (error) {
      if (signal?.aborted) {
        throw createAbortError();
      }

      firstError ??=
        error instanceof Error ? error : new Error("搜索章节时发生错误");
    }

    if (results.length >= EPUB_MAX_SEARCH_RESULTS) {
      break;
    }
  }

  throwIfAborted(signal);

  if (results.length === 0 && loadedSections === 0 && firstError) {
    throw firstError;
  }

  return results;
}

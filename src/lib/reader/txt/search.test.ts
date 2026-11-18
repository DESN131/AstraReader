import { describe, expect, it } from "vitest";

import {
  findTxtChapters,
  chaptersToToc,
} from "@/lib/reader/txt/document";
import {
  buildNormalizedSearchIndex,
  normalizeForSearch,
  searchTxtText,
} from "@/lib/reader/txt/search";

describe("normalizeForSearch", () => {
  it("normalizes full-width characters, case and whitespace", () => {
    expect(normalizeForSearch("  ＨＥＬＬＯ\n\t World  ")).toBe(
      "hello world",
    );
  });
});

describe("buildNormalizedSearchIndex", () => {
  it("maps normalized positions back to source offsets", () => {
    const source = "Alpha\n   BETA";
    const index = buildNormalizedSearchIndex(source);

    expect(index.text).toBe("alpha beta");
    expect(source.slice(index.offsets[0])).toMatch(/^Alpha/);
    expect(source.slice(index.offsets[6])).toMatch(/^BETA/);
  });

  it("keeps UTF-16 source offsets for characters outside the BMP", () => {
    const source = "😀 Book";
    const index = buildNormalizedSearchIndex(source);
    const bookPosition = index.text.indexOf("book");

    expect(index.offsets[bookPosition]).toBe(source.indexOf("Book"));
  });
});

describe("searchTxtText", () => {
  it("returns absolute locations, chapter labels and excerpts", async () => {
    const source =
      "前言\n\n第一章 开始\nAlpha\n  BETA and beta\n\n第二章 结束\n结尾";
    const chapters = findTxtChapters(source);
    const toc = chaptersToToc(chapters);
    const index = buildNormalizedSearchIndex(source);
    const results = await searchTxtText(
      source,
      chapters,
      toc,
      "alpha beta",
      index,
    );

    expect(results).toHaveLength(1);
    expect(results[0].location).toMatchObject({
      kind: "txt-offset",
      offset: source.indexOf("Alpha"),
    });
    expect(results[0].label).toBe("第一章 开始");
    expect(results[0].excerpt).toContain("Alpha BETA");
  });

  it("respects the result limit", async () => {
    const source = "word word word word";
    const results = await searchTxtText(
      source,
      [],
      chaptersToToc([]),
      "word",
      buildNormalizedSearchIndex(source),
      { maxResults: 2 },
    );

    expect(results).toHaveLength(2);
    expect(results[0].label).toBe("正文");
  });

  it("throws an AbortError when canceled", async () => {
    const controller = new AbortController();
    controller.abort();
    const source = "search me";

    await expect(
      searchTxtText(
        source,
        [],
        chaptersToToc([]),
        "search",
        buildNormalizedSearchIndex(source),
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("returns no results for an empty query", async () => {
    const source = "anything";
    await expect(
      searchTxtText(
        source,
        [],
        chaptersToToc([]),
        "   ",
        buildNormalizedSearchIndex(source),
      ),
    ).resolves.toEqual([]);
  });
});

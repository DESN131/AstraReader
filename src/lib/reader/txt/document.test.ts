import { describe, expect, it } from "vitest";

import {
  chaptersToToc,
  createTextChunks,
  findChunkIndex,
  findTxtChapters,
  getChapterAtOffset,
  getChapterLabel,
  isChapterHeading,
} from "@/lib/reader/txt/document";

describe("findTxtChapters", () => {
  it("finds Chinese chapter headings and preserves absolute offsets", () => {
    const text =
      "书名\r\n作者\r\n\r\n第一章 初见\r\n正文一\r\n\r\n第2章：归来\r\n正文二";
    const chapters = findTxtChapters(text);

    expect(chapters.map((chapter) => chapter.label)).toEqual([
      "第一章 初见",
      "第2章：归来",
    ]);
    expect(chapters[0].offset).toBe(text.indexOf("第一章"));
    expect(chapters[1].offset).toBe(text.indexOf("第2章"));
  });

  it("recognizes common Chinese and English special headings", () => {
    const text =
      "序章\n内容\n\nChapter 1\nThe start\n\nPROLOGUE\nBefore";
    const chapters = findTxtChapters(text);

    expect(chapters.map((chapter) => chapter.label)).toEqual([
      "序章",
      "Chapter 1",
      "PROLOGUE",
    ]);
  });

  it("does not treat an ordinary long sentence as a heading", () => {
    expect(
      isChapterHeading(
        "Chapter one tells the story of a very long journey across the world and back again.",
      ),
    ).toBe(false);
  });

  it("returns a single 正文 TOC item when no headings exist", () => {
    const toc = chaptersToToc(findTxtChapters("只有正文。\n第二行。"));

    expect(toc).toHaveLength(1);
    expect(toc[0].label).toBe("正文");
    expect(toc[0].location).toEqual({
      kind: "txt-offset",
      offset: 0,
      chapterId: "txt-body",
    });
  });

  it("resolves the chapter that contains an offset", () => {
    const text = "前言\n\n第一章 开始\n内容\n\n第二章 结束\n内容";
    const chapters = findTxtChapters(text);
    const secondOffset = text.indexOf("第二章");

    expect(getChapterAtOffset(chapters, 0)?.label).toBe("前言");
    expect(getChapterAtOffset(chapters, secondOffset)?.label).toBe(
      "第二章 结束",
    );
    expect(getChapterLabel(chapters, text.length - 1)).toBe("第二章 结束");
  });
});

describe("createTextChunks", () => {
  it("creates bounded chunks at line boundaries without losing characters", () => {
    const text = `${"甲".repeat(900)}\n${"乙".repeat(900)}\n${"丙".repeat(900)}`;
    const chunks = createTextChunks(text, 1_000);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].start).toBe(0);
    expect(chunks.at(-1)?.end).toBe(text.length);

    for (const chunk of chunks) {
      expect(chunk.end).toBeGreaterThan(chunk.start);
      expect(text.slice(chunk.start, chunk.end)).not.toBe("");
    }
  });

  it("finds chunks at exact boundaries and offsets beyond the end", () => {
    const chunks = [
      { index: 0, start: 0, end: 10 },
      { index: 1, start: 10, end: 20 },
      { index: 2, start: 20, end: 30 },
    ];

    expect(findChunkIndex(chunks, 9)).toBe(0);
    expect(findChunkIndex(chunks, 10)).toBe(1);
    expect(findChunkIndex(chunks, 50)).toBe(2);
  });
});

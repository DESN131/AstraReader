import { describe, expect, it } from "vitest";

import {
  formatFoliateSearchExcerpt,
  getFoliateKeyboardDirection,
  getFoliateTotalProgress,
  mapFoliateToc,
  normalizeFoliateTocLabel,
} from "./foliate";

function createBook(sections: Array<[number, string]>): FoliateBook {
  return {
    sections: sections.map(([size, linear], index) => ({
      id: `section-${index}`,
      size,
      linear,
      load: async () => "",
    })),
  };
}

describe("Foliate navigation", () => {
  it("maps nested TOC entries and keeps href navigation targets", () => {
    const toc = mapFoliateToc([
      {
        id: "chapter-1",
        href: "OEBPS/Text/chapter-1.xhtml#start",
        label: "第一章",
        subitems: [
          {
            id: "part-1",
            href: "OEBPS/Text/chapter-1.xhtml#part-1",
            label: { zh: "第一节", en: "Part 1" },
          },
        ],
      },
    ]);

    expect(toc[0]?.label).toBe("第一章");
    expect(toc[0]?.location).toEqual({
      kind: "epub-cfi",
      cfi: "OEBPS/Text/chapter-1.xhtml#start",
      href: "OEBPS/Text/chapter-1.xhtml#start",
    });
    expect(toc[0]?.children[0]?.label).toBe("第一节");
  });

  it("normalizes empty and multilingual labels", () => {
    expect(normalizeFoliateTocLabel(undefined)).toBe("未命名章节");
    expect(normalizeFoliateTocLabel("  第一章  ")).toBe("第一章");
    expect(normalizeFoliateTocLabel({ en: "Chapter one" })).toBe(
      "Chapter one",
    );
  });

  it("weights section progress by spine size", () => {
    const book = createBook([
      [100, "yes"],
      [300, "yes"],
      [200, "no"],
    ]);

    expect(getFoliateTotalProgress(book, 0, 0.5)).toBe(0.125);
    expect(getFoliateTotalProgress(book, 1, 0.5)).toBe(0.625);
    expect(getFoliateTotalProgress(book, 1, 1)).toBe(1);
  });
});

describe("Foliate search and keyboard helpers", () => {
  it("joins structured search excerpts", () => {
    expect(
      formatFoliateSearchExcerpt({
        pre: "前文",
        match: "关键词",
        post: "后文",
      }),
    ).toBe("前文关键词后文");
    expect(formatFoliateSearchExcerpt("  已有   摘要  ")).toBe("已有 摘要");
  });

  it("keeps horizontal arrows as page turns in both modes", () => {
    const event = {
      key: "ArrowRight",
      altKey: false,
      ctrlKey: false,
      metaKey: false,
    } as KeyboardEvent;

    expect(getFoliateKeyboardDirection(event, "paginated")).toBe("next");
    expect(getFoliateKeyboardDirection(event, "scroll")).toBe("next");
  });

  it("only maps vertical arrows in scroll mode", () => {
    const event = {
      key: "ArrowDown",
      altKey: false,
      ctrlKey: false,
      metaKey: false,
    } as KeyboardEvent;

    expect(getFoliateKeyboardDirection(event, "scroll")).toBe("next");
    expect(getFoliateKeyboardDirection(event, "paginated")).toBeNull();
  });
});

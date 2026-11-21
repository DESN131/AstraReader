import type { Book } from "epubjs";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_READER_SETTINGS } from "@/lib/reader/defaults";

import {
  createEpubChapterLabelLookup,
  findEpubChapterLabel,
  getEpubInitialDisplayTargets,
  mapEpubNavigationToToc,
} from "./navigation";
import {
  EPUB_MAX_SEARCH_RESULTS,
  searchEpubBook,
} from "./search";
import {
  createEpubSurfaceStyle,
  createEpubThemeRules,
  getEpubContentWidth,
} from "./theme";

describe("EPUB navigation", () => {
  it("maps nested navigation items and keeps href targets", () => {
    const toc = mapEpubNavigationToToc([
      {
        id: "chapter-1",
        href: "Text/Chapter%201.xhtml#start",
        label: "第一章",
        subitems: [
          {
            id: "section-1",
            href: "Text/Chapter%201.xhtml#part-a",
            label: "第一节",
          },
        ],
      },
    ]);

    expect(toc[0]?.label).toBe("第一章");
    expect(toc[0]?.location).toEqual({
      kind: "epub-cfi",
      cfi: "Text/Chapter%201.xhtml#start",
      href: "Text/Chapter%201.xhtml#start",
    });
    expect(toc[0]?.children[0]?.label).toBe("第一节");
  });

  it("resolves chapter labels across encoded and unencoded hrefs", () => {
    const toc = mapEpubNavigationToToc([
      {
        href: "Text/Chapter%201.xhtml#start",
        label: "第一章",
      },
    ]);
    const labels = createEpubChapterLabelLookup(toc);

    expect(findEpubChapterLabel(labels, "Text/Chapter 1.xhtml")).toBe(
      "第一章",
    );
  });

  it("only resumes an existing reading location", () => {
    expect(getEpubInitialDisplayTargets(null)).toEqual([]);
    expect(
      getEpubInitialDisplayTargets({
        kind: "epub-cfi",
        cfi: "epubcfi(/6/2!/4/2/2:0)",
        href: "Text/cover.xhtml",
      }),
    ).toEqual([
      "epubcfi(/6/2!/4/2/2:0)",
      "Text/cover.xhtml",
    ]);
    expect(
      getEpubInitialDisplayTargets({
        kind: "txt-offset",
        offset: 0,
      }),
    ).toEqual([]);
  });
});

describe("EPUB theme", () => {
  it("clamps content width and emits reader typography", () => {
    const settings = {
      ...DEFAULT_READER_SETTINGS,
      contentWidth: 2_000,
      fontSize: 23,
      lineHeight: 2,
      paragraphSpacing: 1.1,
    };
    const rules = createEpubThemeRules(settings);
    const surface = createEpubSurfaceStyle(settings);

    expect(getEpubContentWidth(settings)).toBe(980);
    expect(rules.body["font-size"]).toBe("23px !important");
    expect(rules.body["line-height"]).toBe("2 !important");
    expect(rules.body["padding-left"]).toBe("16px !important");
    expect(rules.body["padding-right"]).toBe("16px !important");
    expect(rules["body p"]["margin-bottom"]).toBe("1.1em !important");
    expect(surface["--epub-content-width" as keyof typeof surface]).toBe(
      "980px",
    );
  });

  it("falls back to safe colors for malformed custom settings", () => {
    const settings = {
      ...DEFAULT_READER_SETTINGS,
      themeId: "custom" as const,
      customBackground: "red; background-image: url(https://bad)",
      customForeground: "not-a-color",
    };
    const rules = createEpubThemeRules(settings);
    const serialized = JSON.stringify(rules);

    expect(rules["html, body"]["background-color"]).toBe(
      "#fffdf8 !important",
    );
    expect(rules["html, body"].color).toBe("#24231f !important");
    expect(serialized).not.toContain("https://bad");
  });
});

describe("EPUB search", () => {
  it("searches sections sequentially and maps chapter labels", async () => {
    const load = vi.fn(async () => ({}));
    const sections = [
      {
        index: 0,
        href: "Text/one.xhtml",
        load,
        find: () => [{ cfi: "epubcfi(/6/2!1)", excerpt: " Alpha   beta " }],
      },
      {
        index: 1,
        href: "Text/two.xhtml",
        load,
        find: () => [{ cfi: "epubcfi(/6/4!1)", excerpt: "Alpha again" }],
      },
    ];
    const book = {
      spine: {
        length: sections.length,
        get: (index: number) => sections[index],
      },
      load: vi.fn(async () => ({})),
    } as unknown as Book;

    const results = await searchEpubBook({
      book,
      toc: mapEpubNavigationToToc([
        { href: "Text/one.xhtml", label: "第一章" },
        { href: "Text/two.xhtml", label: "第二章" },
      ]),
      query: "alpha",
    });

    expect(load).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      label: "第一章",
      excerpt: "Alpha beta",
      location: {
        kind: "epub-cfi",
        cfi: "epubcfi(/6/2!1)",
        href: "Text/one.xhtml",
      },
    });
    expect(results[1]?.label).toBe("第二章");
  });

  it("caps results and honors an already-aborted signal", async () => {
    const matches = Array.from(
      { length: EPUB_MAX_SEARCH_RESULTS + 25 },
      (_, index) => ({
        cfi: `epubcfi(/6/2!${index})`,
        excerpt: "match",
      }),
    );
    const book = {
      spine: {
        length: 1,
        get: () => ({
          index: 0,
          href: "Text/one.xhtml",
          load: async () => ({}),
          find: () => matches,
        }),
      },
      load: async () => ({}),
    } as unknown as Book;
    const toc = mapEpubNavigationToToc([
      { href: "Text/one.xhtml", label: "第一章" },
    ]);

    await expect(
      searchEpubBook({ book, toc, query: "match" }),
    ).resolves.toHaveLength(EPUB_MAX_SEARCH_RESULTS);

    const controller = new AbortController();
    controller.abort();

    await expect(
      searchEpubBook({
        book,
        toc,
        query: "match",
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

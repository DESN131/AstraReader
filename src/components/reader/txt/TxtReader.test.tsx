// @vitest-environment jsdom

import { createRef } from "react";
import {
  cleanup,
  render,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { TxtReader } from "@/components/reader/txt/TxtReader";
import { DEFAULT_READER_SETTINGS } from "@/lib/reader/defaults";
import type { ReaderHandle } from "@/lib/reader/types";
import type {
  BookDetails,
  TocItem,
} from "@/shared/types";

const BOOK: BookDetails = {
  id: "7d8f7d3a-4943-4ae7-8bad-d4471f7d1a8e",
  format: "txt",
  title: "测试图书",
  author: "作者",
  description: "",
  language: "zh-CN",
  publisher: "",
  publishedAt: "",
  originalFilename: "book.txt",
  fileSize: 128,
  sha256: "a".repeat(64),
  coverUrl: null,
  textEncoding: "utf-8",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  lastOpenedAt: null,
  progressPercentage: 0,
  progress: null,
  bookmarks: [],
};

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function textResponse(text: string): Response {
  return new Response(new TextEncoder().encode(text), {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("TxtReader", () => {
  it("loads the book file, reports the TOC and exposes search", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        textResponse("第一章 开始\nAlpha\n  beta\n\n第二章 结束\n结尾"),
      );
    const onReady = vi.fn<(toc: TocItem[]) => void>();
    const onRelocated = vi.fn();
    const onError = vi.fn();
    const ref = createRef<ReaderHandle>();

    render(
      <TxtReader
        ref={ref}
        book={BOOK}
        initialLocation={{ kind: "txt-offset", offset: 0 }}
        settings={DEFAULT_READER_SETTINGS}
        onReady={onReady}
        onRelocated={onRelocated}
        onError={onError}
      />,
    );

    await waitFor(() => {
      expect(onReady).toHaveBeenCalledTimes(1);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/books/${BOOK.id}/file`,
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(onReady.mock.calls[0][0].map((item) => item.label)).toEqual([
      "第一章 开始",
      "第二章 结束",
    ]);
    expect(onError).not.toHaveBeenCalled();
    expect(onRelocated).toHaveBeenCalled();
    const reportedPercentage = onRelocated.mock.calls.at(-1)?.[1] as number;
    expect(reportedPercentage).toBeGreaterThanOrEqual(0);
    expect(reportedPercentage).toBeLessThanOrEqual(1);

    const results = await ref.current?.search("alpha beta");
    expect(results).toEqual([
      expect.objectContaining({
        label: "第一章 开始",
        location: {
          kind: "txt-offset",
          offset: 7,
          chapterId: "txt-chapter-0",
        },
      }),
    ]);
    await expect(ref.current?.next()).resolves.toBe(false);
  });

  it("reports fetch failures through onError", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 }),
    );
    const onError = vi.fn();

    const { findByRole } = render(
      <TxtReader
        book={BOOK}
        initialLocation={null}
        settings={DEFAULT_READER_SETTINGS}
        onReady={vi.fn()}
        onRelocated={vi.fn()}
        onError={onError}
      />,
    );

    await findByRole("alert");
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("HTTP 500"),
      }),
    );
  });

  it("renders the vertical scroll surface without fixed columns", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      textResponse("第一章\n这是一段用于滚动阅读的文本。"),
    );

    const { findByRole, container } = render(
      <TxtReader
        book={BOOK}
        initialLocation={null}
        settings={{
          ...DEFAULT_READER_SETTINGS,
          animation: "scroll",
        }}
        onReady={vi.fn()}
        onRelocated={vi.fn()}
        onError={vi.fn()}
      />,
    );

    const region = await findByRole("region", {
      name: `${BOOK.title} 阅读区`,
    });
    expect(region).toHaveClass("astra-txt-viewport-scroll");
    expect(
      container.querySelector(".astra-txt-content-scroll"),
    ).not.toBeNull();
    expect(
      container.querySelector<HTMLElement>(".astra-txt-content")
        ?.style.columnWidth,
    ).toBe("");
  });
});

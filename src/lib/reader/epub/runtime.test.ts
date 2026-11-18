// @vitest-environment jsdom

import type { Book, Rendition } from "epubjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderEpubWithoutUnload } from "./runtime";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("renderEpubWithoutUnload", () => {
  it("filters only the obsolete EPUB.js unload listener", () => {
    const element = document.createElement("div");
    const rendition = {} as Rendition;
    let unloadCalled = false;
    let resizeCalled = false;
    const book = {
      renderTo: vi.fn(() => {
        window.addEventListener("unload", () => {
          unloadCalled = true;
        });
        window.addEventListener("resize", () => {
          resizeCalled = true;
        });
        return rendition;
      }),
    } as unknown as Book;

    const result = renderEpubWithoutUnload(book, element, {
      flow: "paginated",
    });

    expect(result).toBe(rendition);
    window.dispatchEvent(new Event("unload"));
    window.dispatchEvent(new Event("resize"));
    expect(unloadCalled).toBe(false);
    expect(resizeCalled).toBe(true);
  });
});

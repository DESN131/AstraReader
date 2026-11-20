// @vitest-environment jsdom

import type { Book, Rendition } from "epubjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getEpubKeyboardDirection,
  renderEpubWithoutUnload,
} from "./runtime";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("renderEpubWithoutUnload", () => {
  it("filters the obsolete EPUB.js unload listener during startup and display", async () => {
    const element = document.createElement("div");
    let resolveStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve;
    });
    let displayUnloadCalled = false;
    const rendition = {
      started,
      display: vi.fn(async () => {
        window.addEventListener("unload", () => {
          displayUnloadCalled = true;
        });
      }),
    } as unknown as Rendition;
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

    resolveStarted();
    await started;
    await Promise.resolve();
    await result.display();
    expect(displayUnloadCalled).toBe(false);

    let unloadAfterStartup = false;
    window.addEventListener("unload", () => {
      unloadAfterStartup = true;
    });
    window.dispatchEvent(new Event("unload"));
    expect(unloadAfterStartup).toBe(true);
  });
});

describe("getEpubKeyboardDirection", () => {
  it("maps navigation keys and ignores modified keys", () => {
    const event = (key: string, shiftKey = false) =>
      new KeyboardEvent("keydown", { key, shiftKey });

    expect(getEpubKeyboardDirection(event("ArrowRight"))).toBe("next");
    expect(getEpubKeyboardDirection(event("PageDown"))).toBe("next");
    expect(getEpubKeyboardDirection(event(" "))).toBe("next");
    expect(getEpubKeyboardDirection(event("ArrowLeft"))).toBe("previous");
    expect(getEpubKeyboardDirection(event("PageUp"))).toBe("previous");
    expect(getEpubKeyboardDirection(event(" ", true))).toBe("previous");
    expect(
      getEpubKeyboardDirection(
        new KeyboardEvent("keydown", { key: "ArrowRight", ctrlKey: true }),
      ),
    ).toBeNull();
  });

  it("maps vertical scrolling keys only in scroll mode", () => {
    const event = (key: string) => new KeyboardEvent("keydown", { key });

    expect(getEpubKeyboardDirection(event("ArrowDown"))).toBeNull();
    expect(getEpubKeyboardDirection(event("ArrowUp"))).toBeNull();
    expect(
      getEpubKeyboardDirection(event("ArrowDown"), "scroll"),
    ).toBe("next");
    expect(
      getEpubKeyboardDirection(event("ArrowUp"), "scroll"),
    ).toBe("previous");
    expect(
      getEpubKeyboardDirection(event("ArrowRight"), "scroll"),
    ).toBe("next");
  });
});

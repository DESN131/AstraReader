import type { Book, Rendition } from "epubjs";

import type { ReadingLocation } from "@/shared/types";

export interface EpubDisplayedLocation {
  index?: number;
  href?: string;
  cfi?: string;
  percentage?: number;
  displayed?: {
    page?: number;
    total?: number;
  };
}

export interface EpubRelocatedLocation {
  start?: EpubDisplayedLocation;
  end?: EpubDisplayedLocation;
  atStart?: boolean;
  atEnd?: boolean;
}

type EpubRenderOptions = NonNullable<Parameters<Book["renderTo"]>[1]>;

export type EpubNavigationDirection = "next" | "previous";
export type EpubReadingMode = "paginated" | "scroll";

let unloadFilterDepth = 0;
let originalWindowAddEventListener: typeof window.addEventListener | null =
  null;

function beginEpubUnloadFilter(): void {
  if (unloadFilterDepth === 0) {
    originalWindowAddEventListener = window.addEventListener;
    window.addEventListener = function filteredAddEventListener(
      this: Window,
      type: string,
      listener: EventListenerOrEventListenerObject,
      eventOptions?: boolean | AddEventListenerOptions,
    ) {
      if (type === "unload") {
        return;
      }

      return originalWindowAddEventListener?.call(
        this,
        type,
        listener,
        eventOptions,
      );
    } as typeof window.addEventListener;
  }

  unloadFilterDepth += 1;
}

function endEpubUnloadFilter(): void {
  unloadFilterDepth = Math.max(0, unloadFilterDepth - 1);

  if (unloadFilterDepth === 0 && originalWindowAddEventListener) {
    window.addEventListener = originalWindowAddEventListener;
    originalWindowAddEventListener = null;
  }
}

export function getEpubKeyboardDirection(
  event: Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">,
  readingMode: EpubReadingMode = "paginated",
): EpubNavigationDirection | null {
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return null;
  }

  if (
    (readingMode === "scroll" && event.key === "ArrowDown") ||
    event.key === "ArrowRight" ||
    event.key === "PageDown" ||
    (event.key === " " && !event.shiftKey)
  ) {
    return "next";
  }

  if (
    (readingMode === "scroll" && event.key === "ArrowUp") ||
    event.key === "ArrowLeft" ||
    event.key === "PageUp" ||
    (event.key === " " && event.shiftKey)
  ) {
    return "previous";
  }

  return null;
}

export function renderEpubWithoutUnload(
  book: Book,
  element: Element,
  options?: EpubRenderOptions,
): Rendition {
  // EPUB.js 0.3 registers an obsolete window unload listener on every
  // rendition. Chrome's Permissions Policy now rejects that listener.
  // EPUB.js creates and renders the manager asynchronously after renderTo
  // returns. Keep the filter active through startup and display calls.
  // Application cleanup remains on pagehide and component unmount.
  beginEpubUnloadFilter();

  try {
    const rendition = book.renderTo(element, options);
    rendition.started.then(endEpubUnloadFilter, endEpubUnloadFilter);
    const originalDisplay = rendition.display.bind(rendition) as (
      target?: string | number,
    ) => Promise<void>;
    rendition.display = async (target?: string | number) => {
      beginEpubUnloadFilter();

      try {
        await originalDisplay(target);
      } finally {
        endEpubUnloadFilter();
      }
    };
    return rendition;
  } catch (error) {
    endEpubUnloadFilter();
    throw error;
  }
}

export function toError(value: unknown, fallback: string): Error {
  if (value instanceof Error) {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    "message" in value &&
    typeof (value as { message?: unknown }).message === "string"
  ) {
    return new Error((value as { message: string }).message);
  }

  return new Error(typeof value === "string" && value ? value : fallback);
}

export function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

export function toEpubReadingLocation(
  location: EpubRelocatedLocation | null | undefined,
): Extract<ReadingLocation, { kind: "epub-cfi" }> | null {
  const start = location?.start;

  if (!start?.cfi) {
    return null;
  }

  return {
    kind: "epub-cfi",
    cfi: start.cfi,
    href: start.href || undefined,
  };
}

export async function getCurrentEpubLocation(
  rendition: Rendition,
): Promise<EpubRelocatedLocation | null> {
  try {
    const current = rendition.currentLocation() as unknown;
    const resolved = await Promise.resolve(current);

    if (
      resolved &&
      typeof resolved === "object" &&
      "start" in resolved
    ) {
      return resolved as EpubRelocatedLocation;
    }
  } catch {
    return null;
  }

  return null;
}

export function getEpubPercentage(
  book: Book,
  location: EpubRelocatedLocation,
): number {
  const cfi = location.start?.cfi;

  if (cfi) {
    try {
      if (book.locations.length() > 0) {
        const percentage = book.locations.percentageFromCfi(cfi);

        if (typeof percentage === "number" && Number.isFinite(percentage)) {
          return clampPercentage(percentage);
        }
      }
    } catch {
      // Fall through to the package-reported or spine-based estimate.
    }
  }

  if (typeof location.start?.percentage === "number") {
    return clampPercentage(location.start.percentage);
  }

  const spineLength = Number(
    (book.spine as unknown as { length?: number }).length ?? 0,
  );
  const index = Number(location.start?.index ?? 0);

  return spineLength > 0 ? clampPercentage(index / spineLength) : 0;
}

export async function readEpubApiError(
  response: Response,
  fallback: string,
): Promise<Error> {
  try {
    const data = (await response.json()) as {
      error?: { message?: unknown };
      message?: unknown;
    };
    const message =
      typeof data.error?.message === "string"
        ? data.error.message
        : typeof data.message === "string"
          ? data.message
          : "";

    return new Error(message || fallback);
  } catch {
    return new Error(fallback);
  }
}

export function destroyEpubBook(book: Book, rendition?: Rendition | null): void {
  const archiveObjectUrls = Object.values(
    (
      book as unknown as {
        archive?: { urlCache?: Record<string, string> };
      }
    ).archive?.urlCache ?? {},
  ).filter((url) => url.startsWith("blob:"));

  if (rendition) {
    try {
      rendition.destroy();
    } catch {
      // Continue with the Book cleanup even if a partial rendition exists.
    }
  }

  try {
    book.destroy();
  } catch {
    // EPUB.js may already have torn down its rendition during Strict Mode.
  }

  for (const url of new Set(archiveObjectUrls)) {
    URL.revokeObjectURL(url);
  }
}

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

export function renderEpubWithoutUnload(
  book: Book,
  element: Element,
  options?: EpubRenderOptions,
): Rendition {
  const originalAddEventListener = window.addEventListener;

  // EPUB.js 0.3 registers an obsolete window unload listener on every
  // rendition. Chrome's Permissions Policy now rejects that listener.
  // Rendition construction is synchronous, so suppress it only during this
  // call and keep application cleanup on pagehide/unmount instead.
  window.addEventListener = function filteredAddEventListener(
    this: Window,
    type: string,
    listener: EventListenerOrEventListenerObject,
    eventOptions?: boolean | AddEventListenerOptions,
  ) {
    if (type === "unload") {
      return;
    }

    return originalAddEventListener.call(
      this,
      type,
      listener,
      eventOptions,
    );
  } as typeof window.addEventListener;

  try {
    return book.renderTo(element, options);
  } finally {
    window.addEventListener = originalAddEventListener;
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

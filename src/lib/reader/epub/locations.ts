import type { Book } from "epubjs";

export const EPUB_LOCATIONS_CHARACTER_SIZE = 1600;

const MAX_LOCATIONS_BYTES = 20 * 1024 * 1024;
const locationCache = new Map<string, string>();

function parseLocationsPayload(text: string): string | null {
  if (!text || text.length > MAX_LOCATIONS_BYTES) {
    return null;
  }

  try {
    let payload: unknown = JSON.parse(text);

    if (typeof payload === "string") {
      payload = JSON.parse(payload);
    }

    if (
      payload &&
      typeof payload === "object" &&
      !Array.isArray(payload) &&
      "locations" in payload
    ) {
      payload = (payload as { locations?: unknown }).locations;
    }

    if (
      !Array.isArray(payload) ||
      payload.length === 0 ||
      !payload.every((item) => typeof item === "string" && item.length > 0)
    ) {
      return null;
    }

    return JSON.stringify(payload);
  } catch {
    return null;
  }
}

async function fetchStoredLocations(
  bookId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const response = await fetch(
    `/api/books/${encodeURIComponent(bookId)}/locations`,
    {
      cache: "no-store",
      signal,
    },
  );

  if (!response.ok) {
    return null;
  }

  return parseLocationsPayload(await response.text());
}

async function saveLocations(
  bookId: string,
  serialized: string,
): Promise<void> {
  const response = await fetch(
    `/api/books/${encodeURIComponent(bookId)}/locations`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: serialized,
    },
  );

  if (!response.ok) {
    throw new Error(`保存 EPUB locations 失败：HTTP ${response.status}`);
  }
}

export async function ensureEpubLocations(
  bookId: string,
  book: Book,
  signal?: AbortSignal,
): Promise<string> {
  const cached = locationCache.get(bookId);

  if (cached) {
    try {
      book.locations.load(cached);
      return cached;
    } catch {
      locationCache.delete(bookId);
    }
  }

  signal?.throwIfAborted();

  const stored = await fetchStoredLocations(bookId, signal).catch(() => null);
  signal?.throwIfAborted();

  if (stored) {
    locationCache.set(bookId, stored);
    book.locations.load(stored);
    return stored;
  }

  await book.locations.generate(EPUB_LOCATIONS_CHARACTER_SIZE);
  signal?.throwIfAborted();

  const generated = book.locations.save();
  locationCache.set(bookId, generated);

  void saveLocations(bookId, generated).catch(() => {
    // Saving is opportunistic; the in-memory cache still enables progress.
  });

  return generated;
}

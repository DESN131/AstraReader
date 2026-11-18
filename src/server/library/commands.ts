import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { getDb } from "@/server/db";
import { notFound } from "@/server/errors";
import { decodeCoverDataUrl, removeFile } from "@/server/files";
import {
  findBookRecord,
  mapBookRow,
  BOOK_SELECT,
  type BookRow,
  toPublicBook,
} from "@/server/library/records";
import {
  getBookDirectory,
  resolveDataPath,
  resolveStoredDataPath,
  toStoredDataPath,
} from "@/server/paths";
import type { UpdateBookInput } from "@/shared/schemas";
import type { Book } from "@/shared/types";

export async function updateBook(
  id: string,
  input: UpdateBookInput,
): Promise<Book> {
  const book = findBookRecord(id);
  if (!book) {
    throw notFound("BOOK_NOT_FOUND", "未找到这本书");
  }

  const updatedAt = new Date().toISOString();
  const metadata = input.metadata;
  let nextCoverPath = book.coverPath;
  let newCoverPath: string | null = null;
  let temporaryCoverPath: string | null = null;

  try {
    if (input.coverDataUrl) {
      const cover = decodeCoverDataUrl(input.coverDataUrl);
      const bookDirectory = getBookDirectory(book.id);
      await mkdir(bookDirectory, { recursive: true });

      const filename = `cover-${randomUUID()}.${cover.extension}`;
      newCoverPath = path.join(bookDirectory, filename);
      temporaryCoverPath = path.join(
        bookDirectory,
        `.${filename}.${randomUUID()}.tmp`,
      );
      await writeFile(temporaryCoverPath, cover.bytes, { flag: "wx" });
      await rename(temporaryCoverPath, newCoverPath);
      temporaryCoverPath = null;
      nextCoverPath = toStoredDataPath(newCoverPath);
    }

    const update = getDb()
      .prepare(
        `UPDATE books SET
           title = ?,
           author = ?,
           description = ?,
           language = ?,
           publisher = ?,
           published_at = ?,
           text_encoding = ?,
           cover_path = ?,
           updated_at = ?
         WHERE id = ?`,
      )
      .run(
        metadata.title,
        metadata.author,
        metadata.description,
        metadata.language,
        metadata.publisher,
        metadata.publishedAt,
        input.textEncoding ?? book.textEncoding,
        nextCoverPath,
        updatedAt,
        id,
      );
    if (update.changes === 0) {
      throw notFound("BOOK_NOT_FOUND", "未找到这本书");
    }
  } catch (error) {
    if (temporaryCoverPath) {
      await removeFile(temporaryCoverPath);
    }
    if (newCoverPath) {
      await removeFile(newCoverPath);
    }
    throw error;
  }

  if (book.coverPath && book.coverPath !== nextCoverPath) {
    try {
      await removeFile(resolveStoredDataPath(book.coverPath));
    } catch (error) {
      console.error("[AstraReader] Failed to remove replaced cover", error);
    }
  }

  const row = getDb()
    .prepare<[string], BookRow>(`${BOOK_SELECT} WHERE b.id = ?`)
    .get(id);
  if (!row) {
    throw notFound("BOOK_NOT_FOUND", "未找到这本书");
  }
  return toPublicBook(mapBookRow(row));
}

export async function deleteBook(id: string): Promise<void> {
  const book = findBookRecord(id);
  if (!book) {
    throw notFound("BOOK_NOT_FOUND", "未找到这本书");
  }

  const bookDirectory = path.dirname(resolveStoredDataPath(book.filePath));
  const trashDirectory = resolveDataPath(
    "imports",
    `delete-${book.id}-${randomUUID()}`,
  );
  let moved = false;

  try {
    await rename(bookDirectory, trashDirectory);
    moved = true;
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw error;
    }
  }

  try {
    getDb().prepare("DELETE FROM books WHERE id = ?").run(id);
  } catch (error) {
    if (moved) {
      try {
        await rename(trashDirectory, bookDirectory);
      } catch (restoreError) {
        console.error(
          "[AstraReader] Failed to restore book directory after DB error",
          restoreError,
        );
      }
    }
    throw error;
  }

  if (moved) {
    await rm(trashDirectory, { force: true, recursive: true }).catch((error) => {
      console.error("[AstraReader] Failed to remove deleted book files", error);
    });
  }
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

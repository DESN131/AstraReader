import "server-only";

import { randomUUID } from "node:crypto";

import { getDb } from "@/server/db";
import { notFound, unprocessable } from "@/server/errors";
import {
  type BookmarkRow,
  type ProgressRow,
  findBookRecord,
  parseStoredLocation,
} from "@/server/library/records";
import type {
  BookmarkInput,
  ProgressUpdateInput,
  ReadingTimeInput,
} from "@/shared/schemas";
import type {
  Bookmark,
  ReadingProgress,
} from "@/shared/types";

function requireBook(bookId: string): void {
  if (!findBookRecord(bookId)) {
    throw notFound("BOOK_NOT_FOUND", "未找到这本书");
  }
}

function mapProgress(row: ProgressRow): ReadingProgress {
  return {
    bookId: row.book_id,
    location: parseStoredLocation(row.location_json),
    percentage: row.percentage,
    chapterLabel: row.chapter_label,
    updatedAt: row.updated_at,
  };
}

function mapBookmark(row: BookmarkRow): Bookmark {
  return {
    id: row.id,
    bookId: row.book_id,
    location: parseStoredLocation(row.location_json),
    label: row.label,
    excerpt: row.excerpt,
    createdAt: row.created_at,
  };
}

export function getReadingProgress(bookId: string): ReadingProgress | null {
  const row = getDb()
    .prepare<[string], ProgressRow>(
      `SELECT book_id, location_json, percentage, chapter_label, updated_at
       FROM reading_progress
       WHERE book_id = ?`,
    )
    .get(bookId);

  return row ? mapProgress(row) : null;
}

export function saveReadingProgress(
  bookId: string,
  input: ProgressUpdateInput,
): ReadingProgress {
  requireBook(bookId);
  const updatedAt = new Date().toISOString();
  const locationJson = JSON.stringify(input.location);

  getDb()
    .prepare(
      `INSERT INTO reading_progress
         (book_id, location_json, percentage, chapter_label, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(book_id) DO UPDATE SET
         location_json = excluded.location_json,
         percentage = excluded.percentage,
         chapter_label = excluded.chapter_label,
         updated_at = excluded.updated_at`,
    )
    .run(
      bookId,
      locationJson,
      input.percentage,
      input.chapterLabel,
      updatedAt,
    );

  return {
    bookId,
    location: input.location,
    percentage: input.percentage,
    chapterLabel: input.chapterLabel,
    updatedAt,
  };
}

export function listBookmarks(bookId: string): Bookmark[] {
  requireBook(bookId);
  return getDb()
    .prepare<[string], BookmarkRow>(
      `SELECT id, book_id, location_json, label, excerpt, created_at
       FROM bookmarks
       WHERE book_id = ?
       ORDER BY created_at DESC, id ASC`,
    )
    .all(bookId)
    .map(mapBookmark);
}

export function createBookmark(
  bookId: string,
  input: BookmarkInput,
): Bookmark {
  requireBook(bookId);
  const bookmark: Bookmark = {
    id: randomUUID(),
    bookId,
    location: input.location,
    label: input.label,
    excerpt: input.excerpt,
    createdAt: new Date().toISOString(),
  };

  getDb()
    .prepare(
      `INSERT INTO bookmarks
         (id, book_id, location_json, label, excerpt, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      bookmark.id,
      bookmark.bookId,
      JSON.stringify(bookmark.location),
      bookmark.label,
      bookmark.excerpt,
      bookmark.createdAt,
    );

  return bookmark;
}

export function deleteBookmark(bookId: string, bookmarkId: string): void {
  requireBook(bookId);
  const result = getDb()
    .prepare("DELETE FROM bookmarks WHERE id = ? AND book_id = ?")
    .run(bookmarkId, bookId);

  if (result.changes === 0) {
    throw notFound("BOOKMARK_NOT_FOUND", "未找到这个书签");
  }
}

export function recordReadingTime(input: ReadingTimeInput): void {
  if (!findBookRecord(input.bookId)) {
    throw notFound("BOOK_NOT_FOUND", "未找到这本书");
  }

  if (!isCalendarDay(input.day)) {
    throw unprocessable("INVALID_READING_DAY", "阅读日期无效");
  }

  getDb()
    .prepare(
      `INSERT INTO reading_stats (book_id, day, seconds)
       VALUES (?, ?, ?)
       ON CONFLICT(book_id, day) DO UPDATE SET
         seconds = seconds + excluded.seconds`,
    )
    .run(input.bookId, input.day, input.seconds);
}

function isCalendarDay(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

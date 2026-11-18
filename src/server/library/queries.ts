import "server-only";

import { getDb } from "@/server/db";
import {
  BOOK_SELECT,
  type BookmarkRow,
  type BookRow,
  type ProgressRow,
  findBookRecord,
  mapBookRow,
  parseStoredLocation,
  toPublicBook,
} from "@/server/library/records";
import type {
  Book,
  BookDetails,
  BookFormat,
  Bookmark,
  ReadingProgress,
  ReadingStats,
} from "@/shared/types";

export type BookListQuery = {
  q?: string;
  format?: BookFormat;
  sort?: "recent" | "title" | "added";
};

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function mapProgressRow(row: ProgressRow): ReadingProgress {
  return {
    bookId: row.book_id,
    location: parseStoredLocation(row.location_json),
    percentage: row.percentage,
    chapterLabel: row.chapter_label,
    updatedAt: row.updated_at,
  };
}

function mapBookmarkRow(row: BookmarkRow): Bookmark {
  return {
    id: row.id,
    bookId: row.book_id,
    location: parseStoredLocation(row.location_json),
    label: row.label,
    excerpt: row.excerpt,
    createdAt: row.created_at,
  };
}

export function listBooks(query: BookListQuery = {}): Book[] {
  const clauses: string[] = [];
  const bindings: string[] = [];
  const search = query.q?.trim();

  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    clauses.push(`(
      b.title LIKE ? ESCAPE '\\'
      OR b.author LIKE ? ESCAPE '\\'
      OR b.original_filename LIKE ? ESCAPE '\\'
    )`);
    bindings.push(pattern, pattern, pattern);
  }

  if (query.format) {
    clauses.push("b.format = ?");
    bindings.push(query.format);
  }

  let orderBy: string;
  switch (query.sort ?? "recent") {
    case "title":
      orderBy = "b.title COLLATE NOCASE ASC, b.created_at DESC";
      break;
    case "added":
      orderBy = "b.created_at DESC";
      break;
    default:
      orderBy =
        "CASE WHEN b.last_opened_at IS NULL THEN 1 ELSE 0 END, " +
        "b.last_opened_at DESC, b.created_at DESC";
  }

  const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
  const statement = getDb().prepare<unknown[], BookRow>(
    `${BOOK_SELECT}${where} ORDER BY ${orderBy}`,
  );
  const rows =
    bindings.length > 0 ? statement.all(...bindings) : statement.all();

  return rows.map((row) => toPublicBook(mapBookRow(row)));
}

export function getBookDetails(id: string): BookDetails | null {
  const record = findBookRecord(id);
  if (!record) {
    return null;
  }

  const database = getDb();
  const progressRow = database
    .prepare<[string], ProgressRow>(
      `SELECT book_id, location_json, percentage, chapter_label, updated_at
       FROM reading_progress
       WHERE book_id = ?`,
    )
    .get(id);
  const bookmarkRows = database
    .prepare<[string], BookmarkRow>(
      `SELECT id, book_id, location_json, label, excerpt, created_at
       FROM bookmarks
       WHERE book_id = ?
       ORDER BY created_at DESC, id ASC`,
    )
    .all(id);

  return {
    ...toPublicBook(record),
    progress: progressRow ? mapProgressRow(progressRow) : null,
    bookmarks: bookmarkRows.map(mapBookmarkRow),
  };
}

export function getReadingStats(): ReadingStats {
  const database = getDb();
  const totals = database
    .prepare<
      [],
      { total_seconds: number | null; active_days: number }
    >(
      `SELECT
         COALESCE(SUM(seconds), 0) AS total_seconds,
         COUNT(DISTINCT day) AS active_days
       FROM reading_stats`,
    )
    .get();
  const topBooks = database
    .prepare<
      [],
      { book_id: string; title: string; seconds: number }
    >(
      `SELECT r.book_id, b.title, SUM(r.seconds) AS seconds
       FROM reading_stats r
       JOIN books b ON b.id = r.book_id
       GROUP BY r.book_id, b.title
       ORDER BY seconds DESC, b.title COLLATE NOCASE ASC
       LIMIT 5`,
    )
    .all();

  return {
    totalSeconds: totals?.total_seconds ?? 0,
    activeDays: totals?.active_days ?? 0,
    topBooks: topBooks.map((row) => ({
      bookId: row.book_id,
      title: row.title,
      seconds: row.seconds,
    })),
  };
}

export function markBookOpened(id: string): void {
  getDb()
    .prepare("UPDATE books SET last_opened_at = ? WHERE id = ?")
    .run(new Date().toISOString(), id);
}

import "server-only";

import { getDb } from "@/server/db";
import type {
  Book,
  BookFormat,
  ReadingLocation,
  TextEncoding,
} from "@/shared/types";

export interface BookRecord extends Book {
  filePath: string;
  coverPath: string | null;
}

export interface BookRow {
  id: string;
  format: BookFormat;
  title: string;
  author: string;
  description: string;
  language: string;
  publisher: string;
  published_at: string;
  original_filename: string;
  file_path: string;
  cover_path: string | null;
  file_size: number;
  sha256: string;
  text_encoding: TextEncoding;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
  progress_percentage: number | null;
}

export interface ProgressRow {
  book_id: string;
  location_json: string;
  percentage: number;
  chapter_label: string;
  updated_at: string;
}

export interface BookmarkRow {
  id: string;
  book_id: string;
  location_json: string;
  label: string;
  excerpt: string;
  created_at: string;
}

export const BOOK_SELECT = `
  SELECT
    b.id,
    b.format,
    b.title,
    b.author,
    b.description,
    b.language,
    b.publisher,
    b.published_at,
    b.original_filename,
    b.file_path,
    b.cover_path,
    b.file_size,
    b.sha256,
    b.text_encoding,
    b.created_at,
    b.updated_at,
    b.last_opened_at,
    p.percentage AS progress_percentage
  FROM books b
  LEFT JOIN reading_progress p ON p.book_id = b.id
`;

export function mapBookRow(row: BookRow): BookRecord {
  return {
    id: row.id,
    format: row.format,
    title: row.title,
    author: row.author,
    description: row.description,
    language: row.language,
    publisher: row.publisher,
    publishedAt: row.published_at,
    originalFilename: row.original_filename,
    fileSize: row.file_size,
    sha256: row.sha256,
    coverUrl: row.cover_path ? `/api/books/${row.id}/cover` : null,
    textEncoding: row.text_encoding,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at,
    progressPercentage: row.progress_percentage ?? 0,
    filePath: row.file_path,
    coverPath: row.cover_path,
  };
}

export function toPublicBook(record: BookRecord): Book {
  return {
    id: record.id,
    format: record.format,
    title: record.title,
    author: record.author,
    description: record.description,
    language: record.language,
    publisher: record.publisher,
    publishedAt: record.publishedAt,
    originalFilename: record.originalFilename,
    fileSize: record.fileSize,
    sha256: record.sha256,
    coverUrl: record.coverUrl,
    textEncoding: record.textEncoding,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastOpenedAt: record.lastOpenedAt,
    progressPercentage: record.progressPercentage,
  };
}

export function findBookRecord(id: string): BookRecord | null {
  const row = getDb()
    .prepare<[string], BookRow>(`${BOOK_SELECT} WHERE b.id = ?`)
    .get(id);

  return row ? mapBookRow(row) : null;
}

export function findBookRecordByHash(sha256: string): BookRecord | null {
  const row = getDb()
    .prepare<[string], BookRow>(`${BOOK_SELECT} WHERE b.sha256 = ?`)
    .get(sha256.toLowerCase());

  return row ? mapBookRow(row) : null;
}

export function parseStoredLocation(value: string): ReadingLocation {
  return JSON.parse(value) as ReadingLocation;
}

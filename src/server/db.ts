import "server-only";

import { rmSync } from "node:fs";

import Database from "better-sqlite3";

import {
  ensureDataDirectories,
  getDatabasePath,
  getImportDirectory,
  isUuid,
} from "@/server/paths";

interface Migration {
  version: number;
  name: string;
  statements: string[];
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial_schema",
    statements: [
      `CREATE TABLE books (
        id TEXT PRIMARY KEY NOT NULL,
        format TEXT NOT NULL CHECK (format IN ('txt', 'epub')),
        title TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        language TEXT NOT NULL DEFAULT '',
        publisher TEXT NOT NULL DEFAULT '',
        published_at TEXT NOT NULL DEFAULT '',
        original_filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        cover_path TEXT,
        file_size INTEGER NOT NULL CHECK (file_size >= 0),
        sha256 TEXT NOT NULL UNIQUE,
        text_encoding TEXT NOT NULL CHECK (
          text_encoding IN ('utf-8', 'utf-16le', 'utf-16be', 'gb18030', 'big5')
        ),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_opened_at TEXT
      )`,
      `CREATE INDEX books_created_at_idx ON books (created_at DESC)`,
      `CREATE INDEX books_last_opened_at_idx ON books (last_opened_at DESC)`,
      `CREATE TABLE reading_progress (
        book_id TEXT PRIMARY KEY NOT NULL,
        location_json TEXT NOT NULL,
        percentage REAL NOT NULL CHECK (percentage >= 0 AND percentage <= 1),
        chapter_label TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL,
        FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE
      )`,
      `CREATE TABLE bookmarks (
        id TEXT PRIMARY KEY NOT NULL,
        book_id TEXT NOT NULL,
        location_json TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        excerpt TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE
      )`,
      `CREATE INDEX bookmarks_book_created_idx
        ON bookmarks (book_id, created_at DESC)`,
      `CREATE TABLE reading_stats (
        book_id TEXT NOT NULL,
        day TEXT NOT NULL,
        seconds INTEGER NOT NULL CHECK (seconds > 0),
        PRIMARY KEY (book_id, day),
        FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE
      )`,
      `CREATE INDEX reading_stats_day_idx ON reading_stats (day)`,
      `CREATE TABLE upload_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        original_filename TEXT NOT NULL,
        temp_path TEXT NOT NULL,
        size INTEGER,
        sha256 TEXT,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )`,
      `CREATE INDEX upload_sessions_expires_at_idx
        ON upload_sessions (expires_at)`,
    ],
  },
];

type GlobalDatabase = typeof globalThis & {
  __astraReaderDatabase?: Database.Database;
};

function applyMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = new Set(
    database
      .prepare<[], { version: number }>("SELECT version FROM schema_migrations")
      .all()
      .map((row) => row.version),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) {
      continue;
    }

    database.transaction(() => {
      for (const statement of migration.statements) {
        database.exec(statement);
      }
      database
        .prepare(
          `INSERT INTO schema_migrations (version, name, applied_at)
           VALUES (?, ?, ?)`,
        )
        .run(migration.version, migration.name, new Date().toISOString());
    })();
  }
}

function removeStaleUploadDirectories(
  database: Database.Database,
  now: string,
): void {
  const stale = database
    .prepare<[string], { id: string }>(
      "SELECT id FROM upload_sessions WHERE expires_at <= ?",
    )
    .all(now);

  if (stale.length === 0) {
    return;
  }

  database
    .prepare<[string]>("DELETE FROM upload_sessions WHERE expires_at <= ?")
    .run(now);

  for (const row of stale) {
    if (!isUuid(row.id)) {
      continue;
    }

    try {
      rmSync(getImportDirectory(row.id), { force: true, recursive: true });
    } catch (error) {
      console.error("[AstraReader] Failed to clean stale upload", row.id, error);
    }
  }
}

function initializeDatabase(): Database.Database {
  ensureDataDirectories();

  const database = new Database(getDatabasePath(), { timeout: 5_000 });
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  applyMigrations(database);
  removeStaleUploadDirectories(database, new Date().toISOString());
  return database;
}

export function getDb(): Database.Database {
  const globalDatabase = globalThis as GlobalDatabase;
  if (!globalDatabase.__astraReaderDatabase) {
    globalDatabase.__astraReaderDatabase = initializeDatabase();
  }
  return globalDatabase.__astraReaderDatabase;
}

export function cleanStaleUploadSessions(): void {
  const database = getDb();
  removeStaleUploadDirectories(database, new Date().toISOString());
}

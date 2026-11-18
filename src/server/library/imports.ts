import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  MAX_COVER_DATA_URL_LENGTH,
  UPLOAD_TTL_MS,
  getMaxUploadBytes,
} from "@/server/config";
import { cleanStaleUploadSessions, getDb } from "@/server/db";
import {
  badRequest,
  conflict,
  notFound,
  payloadTooLarge,
  unprocessable,
} from "@/server/errors";
import { decodeCoverDataUrl, hashFile, hasZipMagic } from "@/server/files";
import {
  findBookRecord,
  toPublicBook,
} from "@/server/library/records";
import {
  getBookDirectory,
  getImportDirectory,
  getUploadTempFile,
  resolveStoredDataPath,
  toStoredDataPath,
} from "@/server/paths";
import type { FinalizeBookInput } from "@/shared/schemas";
import type { Book, UploadBookResponse } from "@/shared/types";

interface UploadSessionRow {
  id: string;
  original_filename: string;
  temp_path: string;
  size: number | null;
  sha256: string | null;
  created_at: string;
  expires_at: string;
}

export async function receiveBookUpload(
  request: Request,
): Promise<UploadBookResponse> {
  cleanStaleUploadSessions();

  const maxUploadBytes = getMaxUploadBytes();
  const declaredLength = parseContentLength(request);
  if (declaredLength !== null && declaredLength > maxUploadBytes) {
    throw payloadTooLarge(
      "UPLOAD_TOO_LARGE",
      `单本图书不能超过 ${Math.floor(maxUploadBytes / 1024 / 1024)} MiB`,
    );
  }

  if (!request.body) {
    throw badRequest("EMPTY_UPLOAD", "上传请求没有文件内容");
  }

  const uploadId = randomUUID();
  const importDirectory = getImportDirectory(uploadId);
  const temporaryFile = getUploadTempFile(uploadId);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + UPLOAD_TTL_MS);
  const originalFilename = readUploadFilename(request);

  await mkdir(importDirectory, { recursive: true });
  const database = getDb();
  let file: Awaited<ReturnType<typeof open>> | null = null;
  let size = 0;
  let filePosition = 0;
  let completed = false;
  const hash = createHash("sha256");
  const reader = request.body.getReader();

  try {
    database
      .prepare(
        `INSERT INTO upload_sessions
           (id, original_filename, temp_path, size, sha256, created_at, expires_at)
         VALUES (?, ?, ?, NULL, NULL, ?, ?)`,
      )
      .run(
        uploadId,
        originalFilename,
        toStoredDataPath(temporaryFile),
        createdAt.toISOString(),
        expiresAt.toISOString(),
      );
    file = await open(temporaryFile, "wx");

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value || value.byteLength === 0) {
        continue;
      }

      size += value.byteLength;
      if (size > maxUploadBytes) {
        throw payloadTooLarge(
          "UPLOAD_TOO_LARGE",
          `单本图书不能超过 ${Math.floor(maxUploadBytes / 1024 / 1024)} MiB`,
        );
      }

      const chunk = Buffer.from(value);
      hash.update(chunk);
      let offset = 0;
      while (offset < chunk.byteLength) {
        const { bytesWritten } = await file.write(
          chunk,
          offset,
          chunk.byteLength - offset,
          filePosition,
        );
        if (bytesWritten === 0) {
          throw new Error("Upload write made no progress");
        }
        offset += bytesWritten;
        filePosition += bytesWritten;
      }
    }

    if (size === 0) {
      throw badRequest("EMPTY_UPLOAD", "上传请求没有文件内容");
    }

    await file.sync();
    const sha256 = hash.digest("hex");
    database
      .prepare(
        `UPDATE upload_sessions
         SET size = ?, sha256 = ?
         WHERE id = ?`,
      )
      .run(size, sha256, uploadId);
    completed = true;
    return { uploadId, size, sha256 };
  } finally {
    if (file) {
      await file.close().catch(() => undefined);
    }

    if (!completed) {
      await reader.cancel().catch(() => undefined);
      database
        .prepare("DELETE FROM upload_sessions WHERE id = ?")
        .run(uploadId);
      await rm(importDirectory, { force: true, recursive: true }).catch(
        () => undefined,
      );
    }
  }
}

export async function finalizeBookImport(
  input: FinalizeBookInput,
): Promise<Book> {
  if (
    input.coverDataUrl &&
    input.coverDataUrl.length > MAX_COVER_DATA_URL_LENGTH
  ) {
    throw payloadTooLarge("COVER_TOO_LARGE", "封面数据超过大小限制");
  }

  const database = getDb();
  const session = database
    .prepare<[string], UploadSessionRow>(
      `SELECT id, original_filename, temp_path, size, sha256, created_at, expires_at
       FROM upload_sessions
       WHERE id = ?`,
    )
    .get(input.uploadId);

  if (!session) {
    throw notFound("UPLOAD_SESSION_NOT_FOUND", "未找到这个上传会话");
  }
  if (Date.parse(session.expires_at) <= Date.now()) {
    await discardUploadSession(session.id);
    throw conflict("UPLOAD_EXPIRED", "上传会话已过期，请重新上传");
  }
  if (session.size === null || session.sha256 === null) {
    throw conflict("UPLOAD_INCOMPLETE", "上传尚未完成");
  }

  const requestedHash = input.sha256.toLowerCase();
  if (session.sha256.toLowerCase() !== requestedHash) {
    throw unprocessable("UPLOAD_HASH_MISMATCH", "上传文件哈希不匹配");
  }

  const temporaryFile = resolveStoredDataPath(session.temp_path);
  const actual = await hashFile(temporaryFile);
  if (actual.size !== session.size || actual.sha256 !== requestedHash) {
    throw unprocessable("UPLOAD_INTEGRITY_ERROR", "上传文件大小或哈希不匹配");
  }

  if (input.format === "epub" && !(await hasZipMagic(temporaryFile))) {
    throw unprocessable("INVALID_EPUB", "EPUB 文件不是有效的 ZIP 容器");
  }

  if (findBookRecord(actual.sha256)) {
    throw conflict("DUPLICATE_BOOK", "这本书已经存在于书库中");
  }

  const bookId = randomUUID();
  const bookDirectory = getBookDirectory(bookId);
  const bookFile = path.join(bookDirectory, `book.${input.format}`);
  const cover = input.coverDataUrl
    ? decodeCoverDataUrl(input.coverDataUrl)
    : null;
  const coverFile = cover
    ? path.join(bookDirectory, `cover-${randomUUID()}.${cover.extension}`)
    : null;
  const now = new Date().toISOString();
  let sourceMoved = false;
  let committed = false;

  try {
    await mkdir(bookDirectory, { recursive: false });
    await rename(temporaryFile, bookFile);
    sourceMoved = true;

    if (cover && coverFile) {
      await writeFile(coverFile, cover.bytes, { flag: "wx" });
    }

    const metadata = input.metadata;
    database.transaction(() => {
      database
        .prepare(
          `INSERT INTO books (
             id, format, title, author, description, language, publisher,
             published_at, original_filename, file_path, cover_path, file_size,
             sha256, text_encoding, created_at, updated_at, last_opened_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        )
        .run(
          bookId,
          input.format,
          metadata.title,
          metadata.author,
          metadata.description,
          metadata.language,
          metadata.publisher,
          metadata.publishedAt,
          input.originalFilename,
          toStoredDataPath(bookFile),
          coverFile ? toStoredDataPath(coverFile) : null,
          actual.size,
          actual.sha256,
          input.textEncoding,
          now,
          now,
        );
      database
        .prepare("DELETE FROM upload_sessions WHERE id = ?")
        .run(session.id);
    })();
    committed = true;
  } catch (error) {
    if (sourceMoved) {
      try {
        await rename(bookFile, temporaryFile);
      } catch (restoreError) {
        console.error(
          "[AstraReader] Failed to restore upload after import error",
          restoreError,
        );
      }
    }
    await rm(bookDirectory, { force: true, recursive: true }).catch(
      () => undefined,
    );

    if (isUniqueConstraint(error)) {
      throw conflict("DUPLICATE_BOOK", "这本书已经存在于书库中");
    }
    throw error;
  }

  if (committed) {
    await rm(getImportDirectory(session.id), {
      force: true,
      recursive: true,
    }).catch((error) => {
      console.error("[AstraReader] Failed to remove completed upload", error);
    });
  }

  const book = findBookRecord(bookId);
  if (!book) {
    throw new Error("Imported book could not be read back from the database");
  }

  return toPublicBook(book);
}

async function discardUploadSession(uploadId: string): Promise<void> {
  getDb().prepare("DELETE FROM upload_sessions WHERE id = ?").run(uploadId);
  await rm(getImportDirectory(uploadId), {
    force: true,
    recursive: true,
  }).catch(() => undefined);
}

function parseContentLength(request: Request): number | null {
  const value = request.headers.get("content-length");
  if (!value) {
    return null;
  }
  const length = Number.parseInt(value, 10);
  return Number.isSafeInteger(length) && length >= 0 ? length : null;
}

function readUploadFilename(request: Request): string {
  const encoded = request.headers.get("x-astra-filename");
  if (!encoded) {
    return "untitled";
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(encoded);
  } catch {
    throw badRequest("INVALID_FILENAME", "X-Astra-Filename 不是有效的 URI 编码");
  }

  const normalized = decoded.replaceAll("\\", "/");
  const filename = path.posix.basename(normalized).trim();
  if (!filename || filename.length > 500) {
    throw badRequest("INVALID_FILENAME", "上传文件名无效");
  }
  return filename;
}

function isUniqueConstraint(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code?: unknown }).code).startsWith(
      "SQLITE_CONSTRAINT",
    )
  );
}

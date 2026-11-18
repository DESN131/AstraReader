import "server-only";

import { mkdirSync } from "node:fs";
import path from "node:path";

import { getDataRoot } from "@/server/config";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function ensureDataDirectories(): void {
  const root = getDataRoot();
  mkdirSync(root, { recursive: true });
  mkdirSync(path.join(root, "books"), { recursive: true });
  mkdirSync(path.join(root, "imports"), { recursive: true });
}

export function assertPathInsideDataRoot(candidate: string): void {
  const root = getDataRoot();
  const relative = path.relative(root, candidate);

  if (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  ) {
    return;
  }

  throw new Error(`Path escapes the AstraReader data root: ${candidate}`);
}

export function resolveDataPath(...segments: string[]): string {
  const candidate = path.resolve(getDataRoot(), ...segments);
  assertPathInsideDataRoot(candidate);
  return candidate;
}

export function resolveStoredDataPath(storedPath: string): string {
  if (!storedPath || path.isAbsolute(storedPath)) {
    throw new Error("Stored data path must be relative");
  }

  const candidate = resolveDataPath(...storedPath.split("/"));
  return candidate;
}

export function toStoredDataPath(absolutePath: string): string {
  assertPathInsideDataRoot(absolutePath);
  return path.relative(getDataRoot(), absolutePath).split(path.sep).join("/");
}

export function getDatabasePath(): string {
  return resolveDataPath("astra.db");
}

export function getBookDirectory(bookId: string): string {
  if (!isUuid(bookId)) {
    throw new Error("Book id must be a UUID");
  }
  return resolveDataPath("books", bookId);
}

export function getImportDirectory(uploadId: string): string {
  if (!isUuid(uploadId)) {
    throw new Error("Upload id must be a UUID");
  }
  return resolveDataPath("imports", uploadId);
}

export function getUploadTempFile(uploadId: string): string {
  return resolveDataPath("imports", uploadId, "source");
}

export function getLocationsPath(bookId: string): string {
  return resolveDataPath("books", bookId, "locations.json");
}

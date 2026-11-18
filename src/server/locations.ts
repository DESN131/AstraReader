import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { MAX_LOCATIONS_BYTES } from "@/server/config";
import { payloadTooLarge, unprocessable } from "@/server/errors";
import { getLocationsPath } from "@/server/paths";

export async function readLocations(bookId: string): Promise<Uint8Array | null> {
  try {
    return await readFile(getLocationsPath(bookId));
  } catch (error) {
    if (isMissingPathError(error)) {
      return null;
    }
    throw error;
  }
}

export async function saveLocations(
  bookId: string,
  body: Uint8Array,
): Promise<void> {
  if (body.byteLength > MAX_LOCATIONS_BYTES) {
    throw payloadTooLarge("LOCATIONS_TOO_LARGE", "阅读位置缓存超过 20 MiB");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body).toString("utf8")) as unknown;
  } catch {
    throw unprocessable("INVALID_LOCATIONS", "阅读位置缓存必须是有效 JSON");
  }

  if (parsed === undefined) {
    throw unprocessable("INVALID_LOCATIONS", "阅读位置缓存必须是有效 JSON");
  }

  const destination = getLocationsPath(bookId);
  const directory = path.dirname(destination);
  const temporary = path.join(
    directory,
    `.locations-${randomUUID()}.tmp`,
  );
  await mkdir(directory, { recursive: true });

  try {
    await writeFile(temporary, body, { flag: "wx" });
    try {
      await rename(temporary, destination);
    } catch (error) {
      if (!isReplaceError(error)) {
        throw error;
      }
      await rm(destination, { force: true });
      await rename(temporary, destination);
    }
  } finally {
    await rm(temporary, { force: true });
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

function isReplaceError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EEXIST" || code === "EPERM" || code === "EACCES";
}

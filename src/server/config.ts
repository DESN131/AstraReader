import "server-only";

import path from "node:path";

export const MAX_COVER_DATA_URL_LENGTH = 4_000_000;
export const MAX_LOCATIONS_BYTES = 20 * 1024 * 1024;
export const UPLOAD_TTL_MS = 24 * 60 * 60 * 1_000;

const DEFAULT_MAX_UPLOAD_MB = 500;
const MEBIBYTE = 1024 * 1024;

export function getDataRoot(): string {
  const configured = process.env.ASTRAREADER_DATA_DIR?.trim() || "./data";
  return path.resolve(
    /*turbopackIgnore: true*/ process.cwd(),
    configured,
  );
}

export function getMaxUploadBytes(): number {
  const configured = Number.parseInt(
    process.env.ASTRAREADER_MAX_UPLOAD_MB ?? "",
    10,
  );
  const megabytes =
    Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_MAX_UPLOAD_MB;

  return megabytes * MEBIBYTE;
}

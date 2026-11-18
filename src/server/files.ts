import "server-only";

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, rm } from "node:fs/promises";
import path from "node:path";

import { unprocessable } from "@/server/errors";

export interface CoverFile {
  bytes: Buffer;
  extension: "jpg" | "png" | "webp";
  mime: "image/jpeg" | "image/png" | "image/webp";
}

export async function hashFile(
  filePath: string,
): Promise<{ sha256: string; size: number }> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    let size = 0;
    const stream = createReadStream(filePath);

    stream.on("data", (chunk: string | Buffer) => {
      const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      hash.update(bytes);
      size += bytes.length;
    });
    stream.on("error", reject);
    stream.on("end", () => {
      resolve({ sha256: hash.digest("hex"), size });
    });
  });
}

export async function hasZipMagic(filePath: string): Promise<boolean> {
  const file = await open(filePath, "r");
  try {
    const bytes = Buffer.alloc(4);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    return (
      bytesRead === 4 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      bytes[2] === 0x03 &&
      bytes[3] === 0x04
    );
  } finally {
    await file.close();
  }
}

export function decodeCoverDataUrl(value: string): CoverFile {
  const match =
    /^data:image\/(webp|jpeg|png);base64,([a-z0-9+/]+={0,2})$/i.exec(value);
  if (!match) {
    throw unprocessable("INVALID_COVER", "封面必须是 PNG、JPEG 或 WebP Data URL");
  }

  const mediaType = match[1].toLowerCase();
  const base64 = match[2];
  const bytes = Buffer.from(base64, "base64");
  const canonical = bytes.toString("base64").replace(/=+$/, "");
  if (
    bytes.length === 0 ||
    canonical !== base64.replace(/=+$/, "") ||
    bytes.length > 3_000_000
  ) {
    throw unprocessable("INVALID_COVER", "封面数据无效或超过大小限制");
  }

  if (
    mediaType === "png" &&
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return { bytes, extension: "png", mime: "image/png" };
  }

  if (
    mediaType === "jpeg" &&
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { bytes, extension: "jpg", mime: "image/jpeg" };
  }

  if (
    mediaType === "webp" &&
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { bytes, extension: "webp", mime: "image/webp" };
  }

  throw unprocessable("INVALID_COVER", "封面内容与声明的图片格式不一致");
}

export function coverMimeType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return "image/jpeg";
  }
}

export async function removeFile(filePath: string): Promise<void> {
  await rm(filePath, { force: true });
}

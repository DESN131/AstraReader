import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { notFound } from "@/server/errors";
import { handleApiErrors, streamResponse } from "@/server/http";
import { findBookRecord } from "@/server/library/records";
import { resolveStoredDataPath } from "@/server/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface FileRouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: Request,
  context: FileRouteContext,
): Promise<Response> {
  return handleApiErrors(async () => {
    const { id } = await context.params;
    const book = findBookRecord(id);
    if (!book) {
      throw notFound("BOOK_NOT_FOUND", "未找到这本书");
    }

    const filePath = resolveStoredDataPath(book.filePath);
    let fileStat;
    try {
      fileStat = await stat(filePath);
    } catch (error) {
      if (isMissingPathError(error)) {
        throw notFound("BOOK_FILE_NOT_FOUND", "图书文件不存在");
      }
      throw error;
    }

    const nodeStream = createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;
    const fallbackFilename = `book.${book.format}`;
    const encodedFilename = encodeURIComponent(book.originalFilename);

    return streamResponse(webStream, 200, {
      "Content-Type":
        book.format === "epub" ? "application/epub+zip" : "text/plain",
      "Content-Length": String(fileStat.size),
      "Content-Disposition":
        `inline; filename="${fallbackFilename}"; ` +
        `filename*=UTF-8''${encodedFilename}`,
      "X-Content-Type-Options": "nosniff",
    });
  });
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

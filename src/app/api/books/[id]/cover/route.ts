import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { notFound } from "@/server/errors";
import { coverMimeType } from "@/server/files";
import { handleApiErrors, streamResponse } from "@/server/http";
import { findBookRecord } from "@/server/library/records";
import { resolveStoredDataPath } from "@/server/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CoverRouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: Request,
  context: CoverRouteContext,
): Promise<Response> {
  return handleApiErrors(async () => {
    const { id } = await context.params;
    const book = findBookRecord(id);
    if (!book) {
      throw notFound("BOOK_NOT_FOUND", "未找到这本书");
    }
    if (!book.coverPath) {
      throw notFound("COVER_NOT_FOUND", "这本书没有封面");
    }

    const coverPath = resolveStoredDataPath(book.coverPath);
    let coverStat;
    try {
      coverStat = await stat(coverPath);
    } catch (error) {
      if (isMissingPathError(error)) {
        throw notFound("COVER_NOT_FOUND", "这本书没有封面");
      }
      throw error;
    }

    const nodeStream = createReadStream(coverPath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;
    return streamResponse(webStream, 200, {
      "Content-Type": coverMimeType(coverPath),
      "Content-Length": String(coverStat.size),
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

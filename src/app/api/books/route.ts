import { assertSameOrigin, handleApiErrors, jsonResponse, readJsonBody } from "@/server/http";
import { finalizeBookImport } from "@/server/library/imports";
import {
  listBooks,
  type BookListQuery,
} from "@/server/library/queries";
import { unprocessable } from "@/server/errors";
import { finalizeBookSchema } from "@/shared/schemas";
import { BOOK_FORMATS, type BookFormat } from "@/shared/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SORT_VALUES = new Set<NonNullable<BookListQuery["sort"]>>([
  "recent",
  "title",
  "added",
]);

export async function GET(request: Request): Promise<Response> {
  return handleApiErrors(() => {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format");
    const sort = searchParams.get("sort");

    if (format && !BOOK_FORMATS.includes(format as BookFormat)) {
      throw unprocessable("INVALID_FORMAT", "format 必须是 txt 或 epub");
    }
    if (
      sort &&
      !SORT_VALUES.has(sort as NonNullable<BookListQuery["sort"]>)
    ) {
      throw unprocessable(
        "INVALID_SORT",
        "sort 必须是 recent、title 或 added",
      );
    }

    return jsonResponse(
      listBooks({
        q: searchParams.get("q") ?? undefined,
        format: (format as BookFormat | null) ?? undefined,
        sort: (sort as BookListQuery["sort"]) ?? undefined,
      }),
    );
  });
}

export async function POST(request: Request): Promise<Response> {
  return handleApiErrors(async () => {
    assertSameOrigin(request);
    const input = finalizeBookSchema.parse(await readJsonBody(request));
    const book = await finalizeBookImport(input);
    return jsonResponse(book, 201);
  });
}

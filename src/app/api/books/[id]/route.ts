import {
  assertSameOrigin,
  emptyResponse,
  handleApiErrors,
  jsonResponse,
  readJsonBody,
} from "@/server/http";
import {
  deleteBook,
  updateBook,
} from "@/server/library/commands";
import { getBookDetails } from "@/server/library/queries";
import { notFound } from "@/server/errors";
import { updateBookSchema } from "@/shared/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BookRouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: Request,
  context: BookRouteContext,
): Promise<Response> {
  return handleApiErrors(async () => {
    const { id } = await context.params;
    const book = getBookDetails(id);
    if (!book) {
      throw notFound("BOOK_NOT_FOUND", "未找到这本书");
    }
    return jsonResponse(book);
  });
}

export async function PATCH(
  request: Request,
  context: BookRouteContext,
): Promise<Response> {
  return handleApiErrors(async () => {
    assertSameOrigin(request);
    const { id } = await context.params;
    const input = updateBookSchema.parse(await readJsonBody(request));
    return jsonResponse(await updateBook(id, input));
  });
}

export async function DELETE(
  request: Request,
  context: BookRouteContext,
): Promise<Response> {
  return handleApiErrors(async () => {
    assertSameOrigin(request);
    const { id } = await context.params;
    await deleteBook(id);
    return emptyResponse();
  });
}

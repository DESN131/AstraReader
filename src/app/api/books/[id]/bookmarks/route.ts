import {
  assertSameOrigin,
  handleApiErrors,
  jsonResponse,
  readJsonBody,
} from "@/server/http";
import {
  createBookmark,
  listBookmarks,
} from "@/server/reading";
import { bookmarkInputSchema } from "@/shared/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BookmarksRouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: Request,
  context: BookmarksRouteContext,
): Promise<Response> {
  return handleApiErrors(async () => {
    const { id } = await context.params;
    return jsonResponse(listBookmarks(id));
  });
}

export async function POST(
  request: Request,
  context: BookmarksRouteContext,
): Promise<Response> {
  return handleApiErrors(async () => {
    assertSameOrigin(request);
    const { id } = await context.params;
    const input = bookmarkInputSchema.parse(await readJsonBody(request));
    return jsonResponse(createBookmark(id, input), 201);
  });
}

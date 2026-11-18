import {
  assertSameOrigin,
  emptyResponse,
  handleApiErrors,
} from "@/server/http";
import { deleteBookmark } from "@/server/reading";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BookmarkRouteContext {
  params: Promise<{ id: string; bookmarkId: string }>;
}

export async function DELETE(
  request: Request,
  context: BookmarkRouteContext,
): Promise<Response> {
  return handleApiErrors(async () => {
    assertSameOrigin(request);
    const { id, bookmarkId } = await context.params;
    deleteBookmark(id, bookmarkId);
    return emptyResponse();
  });
}

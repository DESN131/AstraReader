import {
  assertSameOrigin,
  handleApiErrors,
  jsonResponse,
  readJsonBody,
} from "@/server/http";
import { notFound } from "@/server/errors";
import { findBookRecord } from "@/server/library/records";
import {
  getReadingProgress,
  saveReadingProgress,
} from "@/server/reading";
import { progressUpdateSchema } from "@/shared/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ProgressRouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: Request,
  context: ProgressRouteContext,
): Promise<Response> {
  return handleApiErrors(async () => {
    const { id } = await context.params;
    if (!findBookRecord(id)) {
      throw notFound("BOOK_NOT_FOUND", "未找到这本书");
    }
    return jsonResponse(getReadingProgress(id));
  });
}

export async function PUT(
  request: Request,
  context: ProgressRouteContext,
): Promise<Response> {
  return handleApiErrors(async () => {
    assertSameOrigin(request);
    const { id } = await context.params;
    const input = progressUpdateSchema.parse(await readJsonBody(request));
    return jsonResponse(saveReadingProgress(id, input));
  });
}

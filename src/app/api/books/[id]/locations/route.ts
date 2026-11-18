import {
  assertSameOrigin,
  emptyResponse,
  handleApiErrors,
  jsonResponse,
  readBodyBytesLimited,
  streamResponse,
} from "@/server/http";
import { notFound, unprocessable } from "@/server/errors";
import { findBookRecord } from "@/server/library/records";
import { readLocations, saveLocations } from "@/server/locations";
import { MAX_LOCATIONS_BYTES } from "@/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LocationsRouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: Request,
  context: LocationsRouteContext,
): Promise<Response> {
  return handleApiErrors(async () => {
    const { id } = await context.params;
    if (!findBookRecord(id)) {
      throw notFound("BOOK_NOT_FOUND", "未找到这本书");
    }

    const body = await readLocations(id);
    if (!body) {
      return jsonResponse(null);
    }
    const data = body.buffer.slice(
      body.byteOffset,
      body.byteOffset + body.byteLength,
    ) as ArrayBuffer;
    return streamResponse(data, 200, {
      "Content-Type": "application/json; charset=utf-8",
    });
  });
}

export async function PUT(
  request: Request,
  context: LocationsRouteContext,
): Promise<Response> {
  return handleApiErrors(async () => {
    assertSameOrigin(request);
    const { id } = await context.params;
    if (!findBookRecord(id)) {
      throw notFound("BOOK_NOT_FOUND", "未找到这本书");
    }

    const contentType = request.headers.get("content-type")?.toLowerCase();
    if (!contentType?.split(";")[0]?.trim().startsWith("application/json")) {
      throw unprocessable(
        "INVALID_CONTENT_TYPE",
        "阅读位置缓存请求必须使用 application/json",
      );
    }

    const body = await readBodyBytesLimited(
      request,
      MAX_LOCATIONS_BYTES,
      "LOCATIONS_TOO_LARGE",
      "阅读位置缓存超过 20 MiB",
    );
    await saveLocations(id, body);
    return emptyResponse();
  });
}

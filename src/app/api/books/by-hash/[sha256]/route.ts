import { unprocessable } from "@/server/errors";
import { handleApiErrors, jsonResponse } from "@/server/http";
import {
  findBookRecordByHash,
  toPublicBook,
} from "@/server/library/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface HashRouteContext {
  params: Promise<{ sha256: string }>;
}

export async function GET(
  _request: Request,
  context: HashRouteContext,
): Promise<Response> {
  return handleApiErrors(async () => {
    const { sha256 } = await context.params;
    if (!/^[a-f0-9]{64}$/i.test(sha256)) {
      throw unprocessable("INVALID_HASH", "SHA-256 格式无效");
    }

    const record = findBookRecordByHash(sha256);
    return jsonResponse(record ? toPublicBook(record) : null);
  });
}

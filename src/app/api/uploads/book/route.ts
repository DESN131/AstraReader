import {
  assertSameOrigin,
  handleApiErrors,
  jsonResponse,
} from "@/server/http";
import { receiveBookUpload } from "@/server/library/imports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleApiErrors(async () => {
    assertSameOrigin(request);
    return jsonResponse(await receiveBookUpload(request), 201);
  });
}

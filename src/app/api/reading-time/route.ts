import {
  assertSameOrigin,
  emptyResponse,
  handleApiErrors,
  readJsonBody,
} from "@/server/http";
import { recordReadingTime } from "@/server/reading";
import { readingTimeSchema } from "@/shared/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleApiErrors(async () => {
    assertSameOrigin(request);
    const input = readingTimeSchema.parse(await readJsonBody(request));
    recordReadingTime(input);
    return emptyResponse();
  });
}

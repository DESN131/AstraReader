import { handleApiErrors, jsonResponse } from "@/server/http";
import { getReadingStats } from "@/server/library/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return handleApiErrors(() => jsonResponse(getReadingStats()));
}

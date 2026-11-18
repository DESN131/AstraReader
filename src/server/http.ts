import "server-only";

import { ZodError } from "zod";

import {
  ApiError,
  badRequest,
  forbidden,
  payloadTooLarge,
} from "@/server/errors";
import type { ApiErrorBody } from "@/shared/types";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;

export function withNoStore(headers?: HeadersInit): Headers {
  const result = new Headers(headers);
  for (const [key, value] of Object.entries(NO_STORE_HEADERS)) {
    result.set(key, value);
  }
  return result;
}

export function jsonResponse(
  body: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  const responseHeaders = withNoStore(headers);
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

export function emptyResponse(status = 204): Response {
  return new Response(null, {
    status,
    headers: withNoStore(),
  });
}

export function streamResponse(
  body: BodyInit,
  status: number,
  headers?: HeadersInit,
): Response {
  return new Response(body, {
    status,
    headers: withNoStore(headers),
  });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
): Response {
  const body: ApiErrorBody = { error: { code, message } };
  return jsonResponse(body, status);
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    return;
  }

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    throw forbidden("CROSS_ORIGIN_FORBIDDEN", "请求来源无效");
  }

  const host =
    request.headers.get("host") ?? new URL(request.url).host.toLowerCase();
  if (originUrl.host.toLowerCase() !== host.toLowerCase()) {
    throw forbidden("CROSS_ORIGIN_FORBIDDEN", "拒绝跨来源修改请求");
  }
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw badRequest("INVALID_JSON", "请求体必须是有效的 JSON");
  }
}

export async function handleApiErrors<T>(
  operation: () => Promise<T> | T,
): Promise<T | Response> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ApiError) {
      return errorResponse(error.status, error.code, error.message);
    }

    if (error instanceof ZodError) {
      const firstIssue = error.issues[0];
      const location = firstIssue?.path.join(".");
      const message = firstIssue
        ? `${location ? `${location}: ` : ""}${firstIssue.message}`
        : "请求数据无效";
      return errorResponse(422, "VALIDATION_ERROR", message);
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      String((error as { code?: unknown }).code).startsWith(
        "SQLITE_CONSTRAINT",
      )
    ) {
      return errorResponse(409, "CONFLICT", "数据与现有记录冲突");
    }

    console.error("[AstraReader API]", error);
    return errorResponse(500, "INTERNAL_ERROR", "服务器处理请求时发生错误");
  }
}

export function contentLength(request: Request): number | null {
  const raw = request.headers.get("content-length");
  if (!raw) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function readBodyBytesLimited(
  request: Request,
  maximumBytes: number,
  code: string,
  message: string,
): Promise<Uint8Array> {
  const declaredLength = contentLength(request);
  if (declaredLength !== null && declaredLength > maximumBytes) {
    throw payloadTooLarge(code, message);
  }
  if (!request.body) {
    return new Uint8Array();
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value || value.byteLength === 0) {
        continue;
      }
      total += value.byteLength;
      if (total > maximumBytes) {
        throw payloadTooLarge(code, message);
      }
      chunks.push(value);
    }
  } finally {
    if (total > maximumBytes) {
      await reader.cancel().catch(() => undefined);
    }
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

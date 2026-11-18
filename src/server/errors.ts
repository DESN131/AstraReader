import "server-only";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export function badRequest(code: string, message: string): ApiError {
  return new ApiError(code, message, 400);
}

export function forbidden(code: string, message: string): ApiError {
  return new ApiError(code, message, 403);
}

export function notFound(code: string, message: string): ApiError {
  return new ApiError(code, message, 404);
}

export function conflict(code: string, message: string): ApiError {
  return new ApiError(code, message, 409);
}

export function payloadTooLarge(code: string, message: string): ApiError {
  return new ApiError(code, message, 413);
}

export function unprocessable(code: string, message: string): ApiError {
  return new ApiError(code, message, 422);
}

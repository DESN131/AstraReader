import type {
  ApiErrorBody,
  Book,
  FinalizeBookRequest,
  UploadBookResponse,
} from "@/shared/types";
import { EbookImportError } from "@/lib/import/types";

async function responseError(
  response: Response,
  fallback: string,
): Promise<EbookImportError> {
  try {
    const body = (await response.json()) as Partial<ApiErrorBody>;
    if (body.error?.message) {
      return new EbookImportError(body.error.message);
    }
  } catch {
    // Fall through to the status-based message.
  }

  return new EbookImportError(`${fallback}（HTTP ${response.status}）`);
}

export async function findBookByHash(
  sha256: string,
  signal?: AbortSignal,
): Promise<Book | null> {
  const response = await fetch(`/api/books/by-hash/${sha256}`, {
    method: "GET",
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw await responseError(response, "无法检查重复图书");
  }

  return (await response.json()) as Book | null;
}

export function uploadBookFile(
  file: File,
  onProgress?: (percentage: number) => void,
  signal?: AbortSignal,
): Promise<UploadBookResponse> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();

    const abort = () => request.abort();
    signal?.addEventListener("abort", abort, { once: true });

    const cleanup = () => {
      signal?.removeEventListener("abort", abort);
    };

    request.open("POST", "/api/uploads/book");
    request.setRequestHeader("Content-Type", "application/octet-stream");
    request.setRequestHeader(
      "X-Astra-Filename",
      encodeURIComponent(file.name),
    );

    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };

    request.onload = () => {
      cleanup();
      let payload: UploadBookResponse | Partial<ApiErrorBody> | null = null;

      try {
        payload = JSON.parse(request.responseText) as
          | UploadBookResponse
          | Partial<ApiErrorBody>;
      } catch {
        reject(new EbookImportError("上传接口返回了无法识别的数据"));
        return;
      }

      if (request.status < 200 || request.status >= 300) {
        reject(
          new EbookImportError(
            payload &&
              "error" in payload &&
              payload.error?.message
              ? payload.error.message
              : `上传失败（HTTP ${request.status}）`,
          ),
        );
        return;
      }

      if (
        !payload ||
        !("uploadId" in payload) ||
        !payload.uploadId ||
        typeof payload.size !== "number" ||
        typeof payload.sha256 !== "string"
      ) {
        reject(new EbookImportError("上传接口缺少必要信息"));
        return;
      }

      onProgress?.(100);
      resolve(payload);
    };

    request.onerror = () => {
      cleanup();
      reject(new EbookImportError("上传失败，请检查本地服务是否正在运行"));
    };

    request.onabort = () => {
      cleanup();
      reject(new EbookImportError("上传已取消"));
    };

    request.send(file);
  });
}

export async function finalizeBook(
  input: FinalizeBookRequest,
): Promise<Book> {
  const response = await fetch("/api/books", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw await responseError(response, "无法完成图书导入");
  }

  return (await response.json()) as Book;
}

import { sha256File } from "@/lib/import/hash";
import { inspectBookFile } from "@/lib/import/inspect";
import {
  finalizeBook,
  findBookByHash,
  uploadBookFile,
} from "@/lib/import/upload";
import {
  DuplicateBookError,
  EbookImportError,
  type ImportBookOptions,
} from "@/lib/import/types";
import type { Book } from "@/shared/types";

export async function importBook(
  file: File,
  options: ImportBookOptions = {},
): Promise<Book> {
  options.onStage?.("hashing");
  const sha256 = await sha256File(file);

  options.onStage?.("inspecting");
  const inspected = await inspectBookFile(file);

  options.onStage?.("checking-duplicate");
  const duplicate = await findBookByHash(sha256);
  if (duplicate) {
    throw new DuplicateBookError(duplicate);
  }

  options.onStage?.("uploading");
  const upload = await uploadBookFile(file, options.onUploadProgress);
  if (upload.sha256.toLowerCase() !== sha256.toLowerCase()) {
    throw new EbookImportError("上传后的文件哈希与本地文件不一致");
  }

  options.onStage?.("finalizing");
  const book = await finalizeBook({
    uploadId: upload.uploadId,
    sha256,
    format: inspected.format,
    originalFilename: file.name,
    metadata: inspected.metadata,
    textEncoding: inspected.textEncoding,
    coverDataUrl: inspected.coverDataUrl,
  });

  options.onStage?.("done");
  return book;
}

export { inspectBookFile, getBookFormat } from "@/lib/import/inspect";
export { resizeCoverToWebp } from "@/lib/import/cover";
export {
  DuplicateBookError,
  EbookImportError,
  type ImportBookOptions,
  type ImportStage,
  type InspectedBook,
} from "@/lib/import/types";

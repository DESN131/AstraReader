import type {
  Book,
  BookFormat,
  BookMetadata,
  TextEncoding,
} from "@/shared/types";

export type ImportStage =
  | "queued"
  | "hashing"
  | "inspecting"
  | "checking-duplicate"
  | "uploading"
  | "finalizing"
  | "done"
  | "error";

export interface InspectedBook {
  format: BookFormat;
  metadata: BookMetadata;
  textEncoding: TextEncoding;
  coverDataUrl?: string;
}

export interface ImportBookOptions {
  onStage?: (stage: ImportStage) => void;
  onUploadProgress?: (percentage: number) => void;
}

export class DuplicateBookError extends Error {
  readonly book: Book;

  constructor(book: Book) {
    super(`《${book.title}》已经在书库中`);
    this.name = "DuplicateBookError";
    this.book = book;
  }
}

export class EbookImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EbookImportError";
  }
}

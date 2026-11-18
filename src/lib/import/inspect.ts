import { inspectTextFile } from "@/lib/import/encoding";
import { resizeCoverToWebp } from "@/lib/import/cover";
import type { InspectedBook } from "@/lib/import/types";
import { EbookImportError } from "@/lib/import/types";
import type { BookFormat, BookMetadata } from "@/shared/types";

function clean(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function titleFromFilename(filename: string): string {
  return filename
    .replace(/\.[^.]+$/u, "")
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 300);
}

export function getBookFormat(filename: string): BookFormat | null {
  const extension = filename.split(".").pop()?.toLowerCase();
  return extension === "txt" || extension === "epub" ? extension : null;
}

async function inspectTxt(file: File): Promise<InspectedBook> {
  const inspection = await inspectTextFile(file);

  return {
    format: "txt",
    textEncoding: inspection.textEncoding,
    metadata: {
      title: titleFromFilename(file.name) || "未命名图书",
      author: "",
      description: "",
      language: inspection.language,
      publisher: "",
      publishedAt: "",
    },
  };
}

async function inspectEpub(file: File): Promise<InspectedBook> {
  const { default: Epub } = await import("epubjs");
  const book = Epub(await file.arrayBuffer());

  try {
    await book.ready;
    const metadata = await book.loaded.metadata;
    let coverDataUrl: string | undefined;

    try {
      const coverUrl = await book.coverUrl();
      if (coverUrl) {
        const response = await fetch(coverUrl);
        if (response.ok) {
          coverDataUrl = await resizeCoverToWebp(await response.blob());
        }
        URL.revokeObjectURL(coverUrl);
      }
    } catch {
      // A broken cover should not prevent importing an otherwise valid EPUB.
    }

    const parsedMetadata: BookMetadata = {
      title:
        clean(metadata.title, 300) ||
        titleFromFilename(file.name) ||
        "未命名图书",
      author: clean(metadata.creator, 300),
      description: clean(metadata.description, 10_000),
      language: clean(metadata.language, 40) || "zh",
      publisher: clean(metadata.publisher, 300),
      publishedAt: clean(metadata.pubdate, 40),
    };

    return {
      format: "epub",
      textEncoding: "utf-8",
      metadata: parsedMetadata,
      coverDataUrl,
    };
  } catch (error) {
    if (error instanceof EbookImportError) {
      throw error;
    }
    throw new EbookImportError("EPUB 文件损坏或缺少必要的书籍信息");
  } finally {
    book.destroy();
  }
}

export async function inspectBookFile(file: File): Promise<InspectedBook> {
  const format = getBookFormat(file.name);

  if (!format) {
    throw new EbookImportError("仅支持 .txt 和 .epub 文件");
  }

  return format === "epub" ? inspectEpub(file) : inspectTxt(file);
}

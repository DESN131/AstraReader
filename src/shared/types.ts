export const BOOK_FORMATS = ["txt", "epub"] as const;

export type BookFormat = (typeof BOOK_FORMATS)[number];

export const TEXT_ENCODINGS = [
  "utf-8",
  "utf-16le",
  "utf-16be",
  "gb18030",
  "big5",
] as const;

export type TextEncoding = (typeof TEXT_ENCODINGS)[number];

export type ReadingLocation =
  | {
      kind: "epub-cfi";
      cfi: string;
      href?: string;
    }
  | {
      kind: "txt-offset";
      offset: number;
      chapterId?: string;
    };

export interface BookMetadata {
  title: string;
  author: string;
  description: string;
  language: string;
  publisher: string;
  publishedAt: string;
}

export interface ReadingProgress {
  bookId: string;
  location: ReadingLocation;
  percentage: number;
  chapterLabel: string;
  updatedAt: string;
}

export interface Book {
  id: string;
  format: BookFormat;
  title: string;
  author: string;
  description: string;
  language: string;
  publisher: string;
  publishedAt: string;
  originalFilename: string;
  fileSize: number;
  sha256: string;
  coverUrl: string | null;
  textEncoding: TextEncoding;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
  progressPercentage: number;
}

export interface BookDetails extends Book {
  progress: ReadingProgress | null;
  bookmarks: Bookmark[];
}

export interface Bookmark {
  id: string;
  bookId: string;
  location: ReadingLocation;
  label: string;
  excerpt: string;
  createdAt: string;
}

export interface TocItem {
  id: string;
  label: string;
  href?: string;
  location?: ReadingLocation;
  children: TocItem[];
}

export type ReaderFontFamily = "sans" | "serif" | "kai";
export type ReaderAnimation = "slide" | "fade" | "none";
export type ReaderTextAlign = "left" | "justify";
export type ReaderThemeId =
  | "paper"
  | "warm"
  | "green"
  | "night"
  | "black"
  | "custom";

export interface ReaderSettings {
  fontFamily: ReaderFontFamily;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  contentWidth: number;
  textAlign: ReaderTextAlign;
  themeId: ReaderThemeId;
  customBackground: string;
  customForeground: string;
  animation: ReaderAnimation;
}

export interface SearchResult {
  id: string;
  location: ReadingLocation;
  label: string;
  excerpt: string;
}

export interface ReadingStats {
  totalSeconds: number;
  activeDays: number;
  topBooks: Array<{
    bookId: string;
    title: string;
    seconds: number;
  }>;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export interface UploadBookResponse {
  uploadId: string;
  size: number;
  sha256: string;
}

export interface FinalizeBookRequest {
  uploadId: string;
  sha256: string;
  format: BookFormat;
  originalFilename: string;
  metadata: BookMetadata;
  textEncoding: TextEncoding;
  coverDataUrl?: string;
}

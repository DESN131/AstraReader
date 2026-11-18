import { z } from "zod";

import { BOOK_FORMATS, TEXT_ENCODINGS } from "@/shared/types";

export const bookMetadataSchema = z.object({
  title: z.string().trim().min(1).max(300),
  author: z.string().trim().max(300),
  description: z.string().trim().max(10_000),
  language: z.string().trim().max(40),
  publisher: z.string().trim().max(300),
  publishedAt: z.string().trim().max(40),
});

export const readingLocationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("epub-cfi"),
    cfi: z.string().min(1).max(2_000),
    href: z.string().max(2_000).optional(),
  }),
  z.object({
    kind: z.literal("txt-offset"),
    offset: z.number().int().nonnegative(),
    chapterId: z.string().max(240).optional(),
  }),
]);

const coverDataUrlSchema = z
  .string()
  .regex(/^data:image\/(?:webp|jpeg|png);base64,/i)
  .max(4_000_000);

export const finalizeBookSchema = z.object({
  uploadId: z.uuid(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  format: z.enum(BOOK_FORMATS),
  originalFilename: z.string().trim().min(1).max(500),
  metadata: bookMetadataSchema,
  textEncoding: z.enum(TEXT_ENCODINGS),
  coverDataUrl: coverDataUrlSchema.optional(),
});

export const updateBookSchema = z.object({
  metadata: bookMetadataSchema,
  textEncoding: z.enum(TEXT_ENCODINGS).optional(),
  coverDataUrl: coverDataUrlSchema.optional(),
});

export const progressUpdateSchema = z.object({
  location: readingLocationSchema,
  percentage: z.number().min(0).max(1),
  chapterLabel: z.string().max(300).default(""),
});

export const bookmarkInputSchema = z.object({
  location: readingLocationSchema,
  label: z.string().trim().max(300).default(""),
  excerpt: z.string().trim().max(1_000).default(""),
});

export const readingTimeSchema = z.object({
  bookId: z.uuid(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  seconds: z.number().int().min(1).max(3_600),
});

export type BookMetadataInput = z.infer<typeof bookMetadataSchema>;
export type FinalizeBookInput = z.infer<typeof finalizeBookSchema>;
export type UpdateBookInput = z.infer<typeof updateBookSchema>;
export type ProgressUpdateInput = z.infer<typeof progressUpdateSchema>;
export type BookmarkInput = z.infer<typeof bookmarkInputSchema>;
export type ReadingTimeInput = z.infer<typeof readingTimeSchema>;

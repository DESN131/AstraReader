"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";
import type { Book } from "@/shared/types";

type CoverBook = Pick<
  Book,
  "id" | "title" | "author" | "format" | "coverUrl"
>;

interface BookCoverProps {
  book: CoverBook;
  className?: string;
  overrideCoverUrl?: string | null;
  sizes?: string;
  priority?: boolean;
}

const COVER_PALETTES = [
  {
    background: "#173f3b",
    foreground: "#f5eddd",
    border: "#2c5d57",
    mark: "#d9b76f",
  },
  {
    background: "#4b2c2b",
    foreground: "#f3e6d4",
    border: "#6a403e",
    mark: "#d7a98f",
  },
  {
    background: "#25364a",
    foreground: "#eef0e9",
    border: "#3c526b",
    mark: "#93b9c8",
  },
  {
    background: "#524321",
    foreground: "#f6eed9",
    border: "#70603a",
    mark: "#e6c37a",
  },
  {
    background: "#3c3449",
    foreground: "#f0e9e3",
    border: "#584d65",
    mark: "#c7aaa1",
  },
  {
    background: "#2e4035",
    foreground: "#edf0e6",
    border: "#496052",
    mark: "#b8c99b",
  },
  {
    background: "#51372b",
    foreground: "#f4e9dc",
    border: "#715244",
    mark: "#dfb889",
  },
  {
    background: "#273f49",
    foreground: "#e9f0ed",
    border: "#405e69",
    mark: "#a6ceca",
  },
] as const;

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function BookCover({
  book,
  className,
  overrideCoverUrl,
  sizes = "(max-width: 640px) 44vw, (max-width: 1024px) 28vw, 200px",
  priority = false,
}: BookCoverProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const source =
    overrideCoverUrl === undefined ? book.coverUrl : overrideCoverUrl;
  const showImage = Boolean(source) && failedUrl !== source;
  const palette =
    COVER_PALETTES[
      stableHash(`${book.id}:${book.title}`) % COVER_PALETTES.length
    ];

  return (
    <div
      className={cn(
        "relative isolate aspect-[2/3] overflow-hidden rounded-[4px] border border-black/10 bg-[#e9e5dc]",
        className,
      )}
    >
      {showImage && source ? (
        <Image
          key={source}
          src={source}
          alt=""
          fill
          unoptimized
          priority={priority}
          sizes={sizes}
          className="object-cover"
          onError={() => setFailedUrl(source)}
        />
      ) : (
        <div
          role="img"
          aria-label={`《${book.title || "未命名图书"}》的占位封面`}
          className="flex h-full w-full flex-col p-[9%]"
          style={{
            backgroundColor: palette.background,
            borderColor: palette.border,
            color: palette.foreground,
          }}
        >
          <div className="flex items-center justify-between gap-2 text-[8px] font-semibold uppercase tracking-[0.16em] opacity-75 sm:text-[9px]">
            <span>AstraReader</span>
            <span>{book.format.toUpperCase()}</span>
          </div>
          <div
            className="my-[9%] h-px w-8 shrink-0 opacity-80"
            style={{ backgroundColor: palette.mark }}
          />
          <div className="flex min-h-0 flex-1 flex-col justify-center">
            <p className="line-clamp-5 break-words text-base font-semibold leading-[1.3] tracking-[0.01em] sm:text-lg">
              {book.title || "未命名图书"}
            </p>
            {book.author ? (
              <p className="mt-3 line-clamp-2 break-words text-[10px] leading-4 opacity-75 sm:text-xs">
                {book.author}
              </p>
            ) : null}
          </div>
          <div className="mt-auto flex items-center gap-2 text-[8px] uppercase tracking-[0.14em] opacity-65">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: palette.mark }}
            />
            <span>Personal library</span>
          </div>
        </div>
      )}
    </div>
  );
}

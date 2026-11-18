"use client";

import { ArrowRight, BookOpenText, Upload } from "lucide-react";
import Link from "next/link";

import { BookCover } from "@/components/book/BookCover";
import type { Book } from "@/shared/types";

interface ContinueReadingStripProps {
  books: Book[];
  title: string;
  description: string;
  onImport: () => void;
}

export function ContinueReadingStrip({
  books,
  title,
  description,
  onImport,
}: ContinueReadingStripProps) {
  return (
    <section
      aria-labelledby="recent-heading"
      className="border-b border-line bg-surface/55"
    >
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-8 lg:px-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2
              id="recent-heading"
              className="text-lg font-semibold tracking-tight text-foreground"
            >
              {title}
            </h2>
            <p className="mt-1 text-sm text-muted">{description}</p>
          </div>
          {books.length > 0 ? (
            <span className="text-xs text-muted">最近活动和新增图书</span>
          ) : null}
        </div>

        {books.length > 0 ? (
          <div className="-mx-4 mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 [&::-webkit-scrollbar]:hidden">
            {books.map((book) => {
              const progress = Math.max(
                0,
                Math.min(1, book.progressPercentage),
              );

              return (
                <Link
                  key={book.id}
                  href={`/read/${book.id}`}
                  className="group flex w-[268px] shrink-0 snap-start items-center gap-4 rounded-md px-1 py-2 outline-none transition-colors hover:bg-surface-raised/75 focus-visible:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-[300px]"
                >
                  <BookCover
                    book={book}
                    className="w-[72px] shrink-0 shadow-[0_8px_18px_-12px_rgba(22,32,28,0.75)] sm:w-20"
                    sizes="80px"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 break-words text-sm font-semibold leading-5 text-foreground">
                      {book.title}
                    </p>
                    <p className="mt-1 line-clamp-1 break-words text-xs text-muted">
                      {book.author || "未知作者"}
                    </p>
                    {progress > 0 ? (
                      <>
                        <div className="mt-3 h-1 overflow-hidden rounded-full bg-line">
                          <div
                            className="h-full rounded-full bg-accent"
                            style={{
                              width: `${Math.max(2, progress * 100)}%`,
                            }}
                          />
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted">
                          <span>{Math.round(progress * 100)}%</span>
                          <span className="flex items-center gap-1 text-accent-strong">
                            继续阅读
                            <ArrowRight
                              aria-hidden="true"
                              className="size-3.5 transition-transform group-hover:translate-x-0.5"
                            />
                          </span>
                        </div>
                      </>
                    ) : (
                      <p className="mt-3 flex items-center gap-1 text-[11px] text-accent-strong">
                        打开图书
                        <ArrowRight aria-hidden="true" className="size-3.5" />
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-4 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 text-sm text-muted">
              <BookOpenText aria-hidden="true" className="size-5 text-accent" />
              书架里还没有书。导入 TXT 或 EPUB 后，阅读进度会出现在这里。
            </div>
            <button
              type="button"
              onClick={onImport}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-foreground px-3.5 py-2 text-sm font-medium text-background transition-colors hover:bg-accent-strong"
            >
              <Upload aria-hidden="true" className="size-4" />
              导入第一本书
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

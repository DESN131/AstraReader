"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import { EllipsisVertical, PencilLine, Trash2 } from "lucide-react";
import Link from "next/link";

import { BookCover } from "@/components/book/BookCover";
import type { Book } from "@/shared/types";

interface BookCardProps {
  book: Book;
  onEdit: (book: Book) => void;
  onDelete: (book: Book) => void;
}

export function BookCard({ book, onEdit, onDelete }: BookCardProps) {
  const progress = Math.max(0, Math.min(1, book.progressPercentage));

  return (
    <article className="group min-w-0">
      <div className="relative">
        <Link
          href={`/read/${book.id}`}
          aria-label={`阅读《${book.title}》`}
          className="block rounded-[4px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <BookCover
            book={book}
            className="shadow-[0_12px_26px_-17px_rgba(22,32,28,0.72)] transition-transform duration-200 group-hover:-translate-y-1"
          />
        </Link>

        <div className="absolute right-2 top-2 z-10 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <DropdownMenu.Root>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    aria-label={`管理《${book.title}》`}
                    className="flex size-8 items-center justify-center rounded-md border border-white/20 bg-black/65 text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-black/80"
                  >
                    <EllipsisVertical aria-hidden="true" className="size-4" />
                  </button>
                </DropdownMenu.Trigger>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  sideOffset={6}
                  className="z-[80] rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-lg"
                >
                  图书操作
                  <Tooltip.Arrow className="fill-foreground" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                className="z-[80] min-w-40 rounded-md border border-line bg-surface-raised p-1 text-sm shadow-xl"
              >
                <DropdownMenu.Item
                  onSelect={() => onEdit(book)}
                  className="flex cursor-pointer items-center gap-2 rounded px-2.5 py-2 outline-none data-[highlighted]:bg-accent-soft data-[highlighted]:text-accent-strong"
                >
                  <PencilLine aria-hidden="true" className="size-4" />
                  编辑图书信息
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="my-1 h-px bg-line" />
                <DropdownMenu.Item
                  onSelect={() => onDelete(book)}
                  className="flex cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-danger outline-none data-[highlighted]:bg-red-50 data-[highlighted]:text-red-800"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                  从书库删除
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      <Link
        href={`/read/${book.id}`}
        className="block min-w-0 pt-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      >
        <h3 className="line-clamp-2 min-h-10 break-words text-sm font-semibold leading-5 text-foreground transition-colors group-hover:text-accent-strong">
          {book.title}
        </h3>
        <p className="mt-1 line-clamp-1 break-words text-xs leading-5 text-muted">
          {book.author || "未知作者"}
        </p>
        <div className="mt-1.5 flex min-h-4 items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-muted">
          <span>{book.format}</span>
          <span aria-hidden="true" className="h-2.5 w-px bg-line" />
          <span>
            {progress > 0
              ? `已读 ${Math.round(progress * 100)}%`
              : "尚未开始"}
          </span>
        </div>
        {progress > 0 ? (
          <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.max(2, progress * 100)}%` }}
            />
          </div>
        ) : null}
      </Link>
    </article>
  );
}

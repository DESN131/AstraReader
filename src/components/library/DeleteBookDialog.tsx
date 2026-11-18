"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { CircleAlert, LoaderCircle, Trash2, X } from "lucide-react";
import { useState } from "react";

import type { ApiErrorBody, Book } from "@/shared/types";

interface DeleteBookDialogProps {
  book: Book | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

async function getDeleteError(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as Partial<ApiErrorBody>;
    if (body.error?.message) {
      return new Error(body.error.message);
    }
  } catch {
    // Fall through to the HTTP status.
  }
  return new Error(`无法删除图书（HTTP ${response.status}）`);
}

export function DeleteBookDialog({
  book,
  onOpenChange,
  onDeleted,
}: DeleteBookDialogProps) {
  if (!book) {
    return null;
  }

  return (
    <DeleteBookDialogContent
      key={book.id}
      book={book}
      onOpenChange={onOpenChange}
      onDeleted={onDeleted}
    />
  );
}

function DeleteBookDialogContent({
  book,
  onOpenChange,
  onDeleted,
}: {
  book: Book;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const removeBook = async () => {
    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/books/${book.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw await getDeleteError(response);
      }
      onDeleted();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "删除图书时发生未知错误",
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(nextOpen) => {
        if (!deleting && !nextOpen) {
          onOpenChange(false);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-surface-raised p-5 shadow-2xl outline-none sm:p-6">
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="关闭删除确认"
              disabled={deleting}
              className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-background hover:text-foreground disabled:opacity-40"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </Dialog.Close>

          <span className="flex size-11 items-center justify-center rounded-md bg-red-50 text-danger">
            <CircleAlert aria-hidden="true" className="size-5" />
          </span>
          <Dialog.Title className="mt-4 text-xl font-semibold tracking-tight text-foreground">
            删除这本书？
          </Dialog.Title>
          <Dialog.Description className="mt-2 break-words text-sm leading-6 text-muted">
            《{book.title}》的原文件、封面、阅读进度和书签都会被永久删除，无法撤销。
          </Dialog.Description>

          {error ? (
            <p
              role="alert"
              className="mt-4 break-words rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={deleting}
                className="rounded-md border border-line px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background disabled:opacity-40"
              >
                保留图书
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={removeBook}
              disabled={deleting}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-danger px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {deleting ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 animate-spin"
                />
              ) : (
                <Trash2 aria-hidden="true" className="size-4" />
              )}
              {deleting ? "正在删除" : "永久删除"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ImagePlus, LoaderCircle, X } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useState,
} from "react";

import { BookCover } from "@/components/book/BookCover";
import { resizeCoverToWebp } from "@/lib/import";
import type { ApiErrorBody, Book, BookMetadata } from "@/shared/types";

interface MetadataDialogProps {
  book: Book | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function metadataFromBook(book: Book): BookMetadata {
  return {
    title: book.title,
    author: book.author,
    description: book.description,
    language: book.language,
    publisher: book.publisher,
    publishedAt: book.publishedAt,
  };
}

async function apiError(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as Partial<ApiErrorBody>;
    if (body.error?.message) {
      return new Error(body.error.message);
    }
  } catch {
    // Fall through to the HTTP status.
  }
  return new Error(`保存失败（HTTP ${response.status}）`);
}

const inputClass =
  "mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted/65 focus:border-accent focus:ring-2 focus:ring-accent/15";
const labelClass = "block text-xs font-medium text-foreground";

export function MetadataDialog({
  book,
  onOpenChange,
  onSaved,
}: MetadataDialogProps) {
  if (!book) {
    return null;
  }

  return (
    <MetadataDialogContent
      key={book.id}
      book={book}
      onOpenChange={onOpenChange}
      onSaved={onSaved}
    />
  );
}

function MetadataDialogContent({
  book,
  onOpenChange,
  onSaved,
}: {
  book: Book;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [metadata, setMetadata] = useState<BookMetadata>(() =>
    metadataFromBook(book),
  );
  const [coverDataUrl, setCoverDataUrl] = useState<string | undefined>(
    undefined,
  );
  const [saving, setSaving] = useState(false);
  const [coverLoading, setCoverLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateField = (field: keyof BookMetadata, value: string) => {
    setMetadata((current) => ({ ...current, [field]: value }));
  };

  const onCoverChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setError(null);
    setCoverLoading(true);
    try {
      setCoverDataUrl(await resizeCoverToWebp(file));
    } catch (coverError) {
      setError(
        coverError instanceof Error ? coverError.message : "无法处理封面图片",
      );
    } finally {
      setCoverLoading(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!metadata.title.trim()) {
      setError("书名不能为空");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: {
        metadata: BookMetadata;
        coverDataUrl?: string;
      } = { metadata };

      if (coverDataUrl) {
        payload.coverDataUrl = coverDataUrl;
      }

      const response = await fetch(`/api/books/${book.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw await apiError(response);
      }

      onSaved();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "无法保存图书信息",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(nextOpen) => {
        if (!saving && !nextOpen) {
          onOpenChange(false);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92svh] w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-line bg-surface-raised p-5 shadow-2xl outline-none sm:p-6">
          <div className="pr-10">
            <Dialog.Title className="text-xl font-semibold tracking-tight text-foreground">
              编辑图书信息
            </Dialog.Title>
            <Dialog.Description className="mt-1.5 text-sm leading-6 text-muted">
              修改会立即同步到书库和阅读页。
            </Dialog.Description>
          </div>

          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="关闭图书信息编辑"
              disabled={saving}
              className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-background hover:text-foreground disabled:opacity-40"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </Dialog.Close>

          <form onSubmit={submit} className="mt-5">
            <div className="grid gap-5 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-start">
              <div>
                <BookCover
                  book={book}
                  overrideCoverUrl={coverDataUrl}
                  className="w-[112px] shadow-[0_12px_24px_-18px_rgba(22,32,28,0.8)]"
                  sizes="112px"
                />
                <label className="mt-3 inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-accent-strong hover:text-accent disabled:cursor-wait">
                  {coverLoading ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-3.5 animate-spin"
                    />
                  ) : (
                    <ImagePlus aria-hidden="true" className="size-3.5" />
                  )}
                  {coverLoading ? "处理中" : "替换封面"}
                  <input
                    type="file"
                    accept="image/webp,image/jpeg,image/png"
                    className="sr-only"
                    disabled={coverLoading || saving}
                    onChange={onCoverChange}
                  />
                </label>
              </div>

              <div className="grid min-w-0 gap-4">
                <label className={labelClass}>
                  书名
                  <input
                    required
                    maxLength={300}
                    value={metadata.title}
                    onChange={(event) =>
                      updateField("title", event.target.value)
                    }
                    className={inputClass}
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className={labelClass}>
                    作者
                    <input
                      maxLength={300}
                      value={metadata.author}
                      onChange={(event) =>
                        updateField("author", event.target.value)
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className={labelClass}>
                    语言
                    <input
                      maxLength={40}
                      placeholder="例如 zh-CN"
                      value={metadata.language}
                      onChange={(event) =>
                        updateField("language", event.target.value)
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className={labelClass}>
                    出版社
                    <input
                      maxLength={300}
                      value={metadata.publisher}
                      onChange={(event) =>
                        updateField("publisher", event.target.value)
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className={labelClass}>
                    出版时间
                    <input
                      maxLength={40}
                      placeholder="例如 2026-11-18"
                      value={metadata.publishedAt}
                      onChange={(event) =>
                        updateField("publishedAt", event.target.value)
                      }
                      className={inputClass}
                    />
                  </label>
                </div>
                <label className={labelClass}>
                  简介
                  <textarea
                    rows={4}
                    maxLength={10_000}
                    value={metadata.description}
                    onChange={(event) =>
                      updateField("description", event.target.value)
                    }
                    className={`${inputClass} resize-y leading-6`}
                  />
                </label>
              </div>
            </div>

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
                  disabled={saving}
                  className="rounded-md border border-line px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background disabled:opacity-40"
                >
                  取消
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={saving || coverLoading || !metadata.title.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-accent-strong px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
              >
                {saving ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin"
                  />
                ) : null}
                {saving ? "正在保存" : "保存修改"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

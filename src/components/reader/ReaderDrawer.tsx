"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import {
  Bookmark,
  ChevronRight,
  ListTree,
  LoaderCircle,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import type {
  Bookmark as BookmarkRecord,
  ReadingLocation,
  SearchResult,
  TocItem,
} from "@/shared/types";

interface ReaderDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toc: TocItem[];
  bookmarks: BookmarkRecord[];
  onNavigate: (location: ReadingLocation) => void;
  onSearch: (query: string, signal: AbortSignal) => Promise<SearchResult[]>;
  onDeleteBookmark: (bookmark: BookmarkRecord) => Promise<void>;
}

function flattenToc(items: TocItem[], depth = 0): Array<TocItem & { depth: number }> {
  return items.flatMap((item) => [
    { ...item, depth },
    ...flattenToc(item.children, depth + 1),
  ]);
}

export function ReaderDrawer({
  open,
  onOpenChange,
  toc,
  bookmarks,
  onNavigate,
  onSearch,
  onDeleteBookmark,
}: ReaderDrawerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError("");
      try {
        setResults(await onSearch(trimmedQuery, controller.signal));
      } catch (error) {
        if (!controller.signal.aborted) {
          setSearchError(error instanceof Error ? error.message : "搜索失败");
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearching(false);
        }
      }
    }, 320);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [onSearch, query]);

  const visibleToc = flattenToc(toc);
  const visibleResults = query.trim() ? results : [];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[1px]" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[min(92vw,390px)] flex-col border-r border-line bg-surface shadow-2xl outline-none">
          <div className="flex h-16 items-center justify-between border-b border-line px-5">
            <Dialog.Title className="text-base font-semibold">阅读导航</Dialog.Title>
            <Dialog.Close
              className="grid size-9 place-items-center rounded-base hover:bg-black/5"
              aria-label="关闭"
            >
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            浏览目录、搜索正文或跳转到书签。
          </Dialog.Description>

          <Tabs.Root defaultValue="toc" className="flex min-h-0 flex-1 flex-col">
            <Tabs.List className="grid grid-cols-3 border-b border-line px-3">
              <Tabs.Trigger
                value="toc"
                className="flex h-12 items-center justify-center gap-1.5 border-b-2 border-transparent text-sm text-muted data-[state=active]:border-accent data-[state=active]:text-foreground"
              >
                <ListTree className="size-4" aria-hidden="true" />
                目录
              </Tabs.Trigger>
              <Tabs.Trigger
                value="search"
                className="flex h-12 items-center justify-center gap-1.5 border-b-2 border-transparent text-sm text-muted data-[state=active]:border-accent data-[state=active]:text-foreground"
              >
                <Search className="size-4" aria-hidden="true" />
                搜索
              </Tabs.Trigger>
              <Tabs.Trigger
                value="bookmarks"
                className="flex h-12 items-center justify-center gap-1.5 border-b-2 border-transparent text-sm text-muted data-[state=active]:border-accent data-[state=active]:text-foreground"
              >
                <Bookmark className="size-4" aria-hidden="true" />
                书签
              </Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content
              value="toc"
              className="min-h-0 flex-1 overflow-y-auto p-3 outline-none"
            >
              {visibleToc.length ? (
                <div className="space-y-0.5">
                  {visibleToc.map((item) => {
                    const location =
                      item.location ??
                      (item.href
                        ? ({ kind: "epub-cfi", cfi: item.href, href: item.href } as const)
                        : null);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={!location}
                        onClick={() => location && onNavigate(location)}
                        className="flex w-full items-start gap-2 rounded-base px-3 py-2.5 text-left text-sm leading-5 transition-colors hover:bg-accent-soft disabled:cursor-default disabled:opacity-55"
                        style={{ paddingLeft: `${12 + Math.min(item.depth, 4) * 16}px` }}
                      >
                        <ChevronRight
                          className="mt-0.5 size-4 shrink-0 text-muted"
                          aria-hidden="true"
                        />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <EmptyState text="这本书没有可用目录" />
              )}
            </Tabs.Content>

            <Tabs.Content
              value="search"
              className="flex min-h-0 flex-1 flex-col outline-none"
            >
              <div className="border-b border-line p-4">
                <label className="relative block">
                  <span className="sr-only">搜索正文</span>
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                    aria-hidden="true"
                  />
                  <input
                    value={query}
                    onChange={(event) => {
                      const nextQuery = event.target.value;
                      setQuery(nextQuery);
                      if (!nextQuery.trim()) {
                        setResults([]);
                        setSearchError("");
                        setSearching(false);
                      }
                    }}
                    placeholder="搜索正文"
                    className="h-10 w-full rounded-base border border-line bg-surface-raised pl-9 pr-3 text-sm outline-none focus:border-accent"
                    autoComplete="off"
                  />
                </label>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {searching ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    正在搜索
                  </div>
                ) : searchError ? (
                  <EmptyState text={searchError} />
                ) : visibleResults.length ? (
                  <div className="space-y-1">
                    {visibleResults.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        onClick={() => onNavigate(result.location)}
                        className="block w-full rounded-base px-3 py-3 text-left hover:bg-accent-soft"
                      >
                        <span className="mb-1 block text-xs font-medium text-accent">
                          {result.label}
                        </span>
                        <span className="line-clamp-3 text-sm leading-6 text-foreground/85">
                          {result.excerpt}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    text={query.trim() ? "没有找到匹配内容" : "输入关键词开始搜索"}
                  />
                )}
              </div>
            </Tabs.Content>

            <Tabs.Content
              value="bookmarks"
              className="min-h-0 flex-1 overflow-y-auto p-3 outline-none"
            >
              {bookmarks.length ? (
                <div className="space-y-1">
                  {bookmarks.map((bookmark) => (
                    <div
                      key={bookmark.id}
                      className="group flex items-start rounded-base hover:bg-accent-soft"
                    >
                      <button
                        type="button"
                        onClick={() => onNavigate(bookmark.location)}
                        className="min-w-0 flex-1 px-3 py-3 text-left"
                      >
                        <span className="mb-1 block text-xs font-medium text-accent">
                          {bookmark.label || "书签"}
                        </span>
                        <span className="line-clamp-2 text-sm leading-6 text-foreground/85">
                          {bookmark.excerpt || "没有摘要"}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDeleteBookmark(bookmark)}
                        className="mr-2 mt-2 grid size-8 shrink-0 place-items-center rounded-base text-muted hover:bg-danger/10 hover:text-danger"
                        aria-label="删除书签"
                        title="删除书签"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text="还没有书签" />
              )}
            </Tabs.Content>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p
      className={cn(
        "mx-auto max-w-[250px] py-12 text-center text-sm leading-6 text-muted",
      )}
    >
      {text}
    </p>
  );
}

"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tabs from "@radix-ui/react-tabs";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  BookOpenText,
  Check,
  ChevronDown,
  Clock3,
  LibraryBig,
  Search,
  SearchX,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useDeferredValue,
  useEffect,
  useState,
} from "react";

import { BookCard } from "@/components/library/BookCard";
import { ContinueReadingStrip } from "@/components/library/ContinueReadingStrip";
import { DeleteBookDialog } from "@/components/library/DeleteBookDialog";
import { ImportDialog } from "@/components/library/ImportDialog";
import { MetadataDialog } from "@/components/library/MetadataDialog";
import { useReaderSettings } from "@/lib/reader/settings";
import { applyAppTheme } from "@/lib/reader/theme";
import { formatReadingTime } from "@/lib/utils";
import type { Book, BookFormat, ReadingStats } from "@/shared/types";

interface LibraryPageProps {
  initialBooks: Book[];
  stats: ReadingStats;
}

type FormatFilter = "all" | BookFormat;
type SortOption = "recent" | "title" | "added";

const SORT_LABELS: Record<SortOption, string> = {
  recent: "最近阅读",
  title: "书名排序",
  added: "最近加入",
};

function timeValue(value: string | null): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function compareTitle(left: Book, right: Book): number {
  return left.title.localeCompare(right.title, "zh-CN", {
    numeric: true,
    sensitivity: "base",
  });
}

export function LibraryPage({ initialBooks, stats }: LibraryPageProps) {
  const router = useRouter();
  const { settings } = useReaderSettings();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(
    query.trim().toLocaleLowerCase("zh-CN"),
  );
  const [formatFilter, setFormatFilter] = useState<FormatFilter>("all");
  const [sort, setSort] = useState<SortOption>("recent");
  const [importOpen, setImportOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [deletingBook, setDeletingBook] = useState<Book | null>(null);

  useEffect(() => {
    applyAppTheme(settings);
  }, [settings]);

  const trackedBooks = initialBooks.filter(
    (book) => book.lastOpenedAt || book.progressPercentage > 0,
  );
  const recentBooks =
    trackedBooks.length > 0
      ? [...trackedBooks]
          .sort(
            (left, right) =>
              timeValue(right.lastOpenedAt) - timeValue(left.lastOpenedAt) ||
              timeValue(right.updatedAt) - timeValue(left.updatedAt),
          )
          .slice(0, 5)
      : [...initialBooks]
          .sort(
            (left, right) =>
              timeValue(right.createdAt) - timeValue(left.createdAt),
          )
          .slice(0, 5);

  const visibleBooks = initialBooks
    .filter((book) => {
      if (formatFilter !== "all" && book.format !== formatFilter) {
        return false;
      }
      if (!deferredQuery) {
        return true;
      }

      return [
        book.title,
        book.author,
        book.publisher,
        book.description,
        book.originalFilename,
      ]
        .join("\n")
        .toLocaleLowerCase("zh-CN")
        .includes(deferredQuery);
    })
    .sort((left, right) => {
      if (sort === "title") {
        return compareTitle(left, right);
      }
      if (sort === "added") {
        return (
          timeValue(right.createdAt) - timeValue(left.createdAt) ||
          compareTitle(left, right)
        );
      }
      return (
        timeValue(right.lastOpenedAt) - timeValue(left.lastOpenedAt) ||
        timeValue(right.updatedAt) - timeValue(left.updatedAt) ||
        compareTitle(left, right)
      );
    });

  const hasTrackedBooks = initialBooks.some(
    (book) => book.lastOpenedAt || book.progressPercentage > 0,
  );
  const hasActiveFilters = Boolean(query.trim()) || formatFilter !== "all";

  const clearFilters = () => {
    setQuery("");
    setFormatFilter("all");
  };

  return (
    <Tooltip.Provider delayDuration={350}>
      <div className="min-h-svh bg-background text-foreground">
        <header className="sticky top-0 z-30 border-b border-line bg-background/92 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-strong text-white shadow-sm">
                <BookOpenText aria-hidden="true" className="size-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h1 className="text-xl font-semibold tracking-tight">
                    AstraReader
                  </h1>
                  <span className="text-xs font-medium text-muted">
                    个人书库
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  TXT / EPUB · 本地存储
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
              <div
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted"
                aria-label="阅读统计"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 aria-hidden="true" className="size-3.5" />
                  {stats.totalSeconds > 0
                    ? `累计阅读 ${formatReadingTime(stats.totalSeconds)}`
                    : "尚未记录阅读时间"}
                </span>
                {stats.activeDays > 0 ? (
                  <>
                    <span aria-hidden="true" className="h-3 w-px bg-line" />
                    <span>{stats.activeDays} 个阅读日</span>
                  </>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-accent-strong px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent"
              >
                <Upload aria-hidden="true" className="size-4" />
                导入图书
              </button>
            </div>
          </div>
        </header>

        <main>
          <ContinueReadingStrip
            books={recentBooks}
            title={hasTrackedBooks ? "继续阅读" : "最近加入"}
            description={
              hasTrackedBooks
                ? "从上次停下的位置接着读。"
                : "刚进入书架的书会出现在这里。"
            }
            onImport={() => setImportOpen(true)}
          />

          <section
            aria-labelledby="library-heading"
            className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8"
          >
            <div className="flex flex-col gap-5 border-b border-line pb-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2
                    id="library-heading"
                    className="text-lg font-semibold tracking-tight"
                  >
                    全部图书
                  </h2>
                  <p className="mt-1 text-sm text-muted" aria-live="polite">
                    {visibleBooks.length === initialBooks.length
                      ? `书架中共有 ${initialBooks.length} 本`
                      : `找到 ${visibleBooks.length} 本，共 ${initialBooks.length} 本`}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Tabs.Root
                    value={formatFilter}
                    onValueChange={(value) =>
                      setFormatFilter(value as FormatFilter)
                    }
                  >
                    <Tabs.List
                      aria-label="按格式筛选"
                      className="flex rounded-md border border-line bg-surface p-1"
                    >
                      {[
                        ["all", "全部"],
                        ["txt", "TXT"],
                        ["epub", "EPUB"],
                      ].map(([value, label]) => (
                        <Tabs.Trigger
                          key={value}
                          value={value}
                          className="rounded px-2.5 py-1.5 text-xs font-medium text-muted outline-none transition-colors hover:text-foreground data-[state=active]:bg-foreground data-[state=active]:text-background"
                        >
                          {label}
                        </Tabs.Trigger>
                      ))}
                    </Tabs.List>
                  </Tabs.Root>

                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-accent hover:text-accent-strong"
                      >
                        <span className="hidden sm:inline">排序：</span>
                        {SORT_LABELS[sort]}
                        <ChevronDown aria-hidden="true" className="size-3.5" />
                      </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        align="end"
                        sideOffset={6}
                        className="z-50 min-w-36 rounded-md border border-line bg-surface-raised p-1 text-sm shadow-xl"
                      >
                        <DropdownMenu.RadioGroup
                          value={sort}
                          onValueChange={(value) =>
                            setSort(value as SortOption)
                          }
                        >
                          {(Object.keys(SORT_LABELS) as SortOption[]).map(
                            (option) => (
                              <DropdownMenu.RadioItem
                                key={option}
                                value={option}
                                className="flex cursor-pointer items-center justify-between gap-4 rounded px-2.5 py-2 outline-none data-[highlighted]:bg-accent-soft data-[highlighted]:text-accent-strong"
                              >
                                {SORT_LABELS[option]}
                                <DropdownMenu.ItemIndicator>
                                  <Check
                                    aria-hidden="true"
                                    className="size-4"
                                  />
                                </DropdownMenu.ItemIndicator>
                              </DropdownMenu.RadioItem>
                            ),
                          )}
                        </DropdownMenu.RadioGroup>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </div>
              </div>

              <div className="relative max-w-xl">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                />
                <label htmlFor="library-search" className="sr-only">
                  搜索书名、作者或简介
                </label>
                <input
                  id="library-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索书名、作者或简介"
                  className="w-full rounded-md border border-line bg-surface py-2.5 pl-9 pr-10 text-sm text-foreground outline-none transition-colors placeholder:text-muted/75 focus:border-accent focus:ring-2 focus:ring-accent/15"
                />
                {query ? (
                  <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        aria-label="清除搜索"
                        className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted transition-colors hover:bg-background hover:text-foreground"
                      >
                        <X aria-hidden="true" className="size-4" />
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content
                        sideOffset={6}
                        className="z-50 rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-lg"
                      >
                        清除搜索
                        <Tooltip.Arrow className="fill-foreground" />
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                ) : null}
              </div>
            </div>

            {initialBooks.length === 0 ? (
              <div className="flex min-h-[42vh] flex-col items-center justify-center py-12 text-center">
                <span className="flex size-14 items-center justify-center rounded-md border border-line bg-surface text-accent-strong">
                  <LibraryBig aria-hidden="true" className="size-6" />
                </span>
                <h3 className="mt-4 text-lg font-semibold">书架还是空的</h3>
                <p className="mt-1 max-w-sm text-sm leading-6 text-muted">
                  导入第一本 TXT 或 EPUB，开始建立自己的阅读空间。
                </p>
                <button
                  type="button"
                  onClick={() => setImportOpen(true)}
                  className="mt-5 inline-flex items-center gap-2 rounded-md bg-accent-strong px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent"
                >
                  <Upload aria-hidden="true" className="size-4" />
                  导入图书
                </button>
              </div>
            ) : visibleBooks.length === 0 ? (
              <div className="flex min-h-[36vh] flex-col items-center justify-center py-12 text-center">
                <span className="flex size-12 items-center justify-center rounded-md bg-surface text-muted">
                  <SearchX aria-hidden="true" className="size-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold">没有匹配的图书</h3>
                <p className="mt-1 text-sm text-muted">
                  换一个关键词或格式再试试。
                </p>
                {hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-4 rounded-md border border-line bg-surface px-3.5 py-2 text-sm font-medium transition-colors hover:border-accent hover:text-accent-strong"
                  >
                    清除筛选
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="mt-7 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {visibleBooks.map((book) => (
                  <BookCard
                    key={book.id}
                    book={book}
                    onEdit={setEditingBook}
                    onDelete={setDeletingBook}
                  />
                ))}
              </div>
            )}
          </section>
        </main>

        <footer className="border-t border-line px-4 py-5 text-center text-[11px] text-muted sm:px-6 lg:px-8">
          AstraReader · 个人本地书库
        </footer>

        <ImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          onImported={() => router.refresh()}
        />
        <MetadataDialog
          book={editingBook}
          onOpenChange={(open) => {
            if (!open) {
              setEditingBook(null);
            }
          }}
          onSaved={() => {
            setEditingBook(null);
            router.refresh();
          }}
        />
        <DeleteBookDialog
          book={deletingBook}
          onOpenChange={(open) => {
            if (!open) {
              setDeletingBook(null);
            }
          }}
          onDeleted={() => {
            setDeletingBook(null);
            router.refresh();
          }}
        />
      </div>
    </Tooltip.Provider>
  );
}

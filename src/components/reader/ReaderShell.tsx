"use client";

import { ArrowLeft, LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ReaderDrawer } from "@/components/reader/ReaderDrawer";
import { ReaderSettingsPanel } from "@/components/reader/ReaderSettingsPanel";
import { ReaderToolbar } from "@/components/reader/ReaderToolbar";
import { EpubReader } from "@/components/reader/epub/FoliateEpubReader";
import { TxtReader } from "@/components/reader/txt/TxtReader";
import { apiFetch } from "@/lib/api-client";
import { resolveReaderTheme } from "@/lib/reader/defaults";
import { useReaderSettings } from "@/lib/reader/settings";
import { applyAppTheme } from "@/lib/reader/theme";
import type { ReaderHandle, ReaderViewProps } from "@/lib/reader/types";
import { cn, toLocalDay } from "@/lib/utils";
import type {
  BookDetails,
  Bookmark,
  ReadingLocation,
  TocItem,
} from "@/shared/types";

interface ReaderShellProps {
  book: BookDetails;
}

interface CurrentProgress {
  location: ReadingLocation | null;
  percentage: number;
  chapterLabel: string;
}

export function ReaderShell({ book }: ReaderShellProps) {
  const readerRef = useRef<ReaderHandle>(null);
  const { settings, setSettings } = useReaderSettings();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(book.bookmarks);
  const [current, setCurrent] = useState<CurrentProgress>({
    location: book.progress?.location ?? null,
    percentage: book.progress?.percentage ?? 0,
    chapterLabel: book.progress?.chapterLabel ?? "",
  });
  const [toast, setToast] = useState<{ message: string; tone: "info" | "error" } | null>(
    null,
  );
  const pageStartRef = useRef<{ x: number; y: number } | null>(null);
  const currentRef = useRef(current);

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  useEffect(() => {
    applyAppTheme(settings);
  }, [settings]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 2_800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function handleFullscreenChange() {
      setFullscreen(Boolean(document.fullscreenElement));
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const saveProgress = useCallback(
    async (progress: CurrentProgress, keepalive = false) => {
      if (!progress.location) {
        return;
      }

      await apiFetch(`/api/books/${book.id}/progress`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: progress.location,
          percentage: progress.percentage,
          chapterLabel: progress.chapterLabel,
        }),
        keepalive,
      });
    },
    [book.id],
  );

  useEffect(() => {
    if (!current.location) {
      return;
    }

    const snapshot = current;
    const timer = window.setTimeout(() => {
      void saveProgress(snapshot).catch(() => {
        setToast({ message: "阅读进度暂时未能保存", tone: "error" });
      });
    }, 800);

    return () => window.clearTimeout(timer);
  }, [current, saveProgress]);

  useEffect(() => {
    function flushProgress() {
      const snapshot = currentRef.current;
      if (snapshot.location) {
        void saveProgress(snapshot, true).catch(() => undefined);
      }
    }

    window.addEventListener("pagehide", flushProgress);
    return () => {
      window.removeEventListener("pagehide", flushProgress);
      flushProgress();
    };
  }, [saveProgress]);

  useEffect(() => {
    let accumulated = 0;

    function flushReadingTime(keepalive = false) {
      if (accumulated <= 0) {
        return;
      }

      const seconds = Math.min(accumulated, 3_600);
      accumulated = 0;
      void fetch("/api/reading-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId: book.id,
          day: toLocalDay(),
          seconds,
        }),
        keepalive,
      }).catch(() => undefined);
    }

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        accumulated += 30;
      }
      if (accumulated >= 30) {
        flushReadingTime();
      }
    }, 30_000);

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        flushReadingTime(true);
      }
    }

    function handlePageHide() {
      flushReadingTime(true);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      flushReadingTime(true);
    };
  }, [book.id]);

  const handleRelocated = useCallback(
    (location: ReadingLocation, percentage: number, chapterLabel: string) => {
      setCurrent({ location, percentage, chapterLabel });
    },
    [],
  );

  const handleReady = useCallback((nextToc: TocItem[]) => {
    setToc(nextToc);
  }, []);

  const handleReaderError = useCallback((error: Error) => {
    setToast({ message: error.message || "阅读器加载失败", tone: "error" });
  }, []);

  const goTo = useCallback(async (location: ReadingLocation) => {
    try {
      await readerRef.current?.goTo(location);
      setDrawerOpen(false);
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : "无法跳转到该位置",
        tone: "error",
      });
    }
  }, []);

  const goPrevious = useCallback(() => {
    void readerRef.current?.previous().catch((error: unknown) => {
      setToast({
        message: error instanceof Error ? error.message : "上一页加载失败",
        tone: "error",
      });
    });
  }, []);

  const goNext = useCallback(() => {
    void readerRef.current?.next().catch((error: unknown) => {
      setToast({
        message: error instanceof Error ? error.message : "下一页加载失败",
        tone: "error",
      });
    });
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.matches(
          "input, textarea, select, button, a, [contenteditable='true']",
        )
      ) {
        return;
      }

      const scrollMode = settings.animation === "scroll";

      if (
        event.key === "ArrowLeft" ||
        event.key === "PageUp" ||
        (scrollMode && event.key === "ArrowUp") ||
        (event.key === " " && event.shiftKey)
      ) {
        event.preventDefault();
        goPrevious();
      } else if (
        event.key === "ArrowRight" ||
        event.key === "PageDown" ||
        (scrollMode && event.key === "ArrowDown") ||
        (event.key === " " && !event.shiftKey)
      ) {
        event.preventDefault();
        goNext();
      } else if (event.key === "Escape") {
        setDrawerOpen(false);
        setSettingsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrevious, settings.animation]);

  const handleSearch = useCallback(
    async (query: string, signal: AbortSignal) => {
      if (!readerRef.current) {
        return [];
      }
      return readerRef.current.search(query, signal);
    },
    [],
  );

  async function addBookmark() {
    const location = current.location ?? readerRef.current?.getLocation();
    if (!location) {
      setToast({ message: "当前位置暂时不可用", tone: "error" });
      return;
    }

    try {
      const bookmark = await apiFetch<Bookmark>(`/api/books/${book.id}/bookmarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location,
          label: current.chapterLabel || `阅读到 ${Math.round(current.percentage * 100)}%`,
          excerpt: `${current.chapterLabel || "当前位置"} · ${Math.round(current.percentage * 100)}%`,
        }),
      });
      setBookmarks((existing) => [bookmark, ...existing]);
      setToast({ message: "书签已添加", tone: "info" });
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : "添加书签失败",
        tone: "error",
      });
    }
  }

  async function deleteBookmark(bookmark: Bookmark) {
    try {
      await apiFetch(`/api/books/${book.id}/bookmarks/${bookmark.id}`, {
        method: "DELETE",
      });
      setBookmarks((existing) => existing.filter((item) => item.id !== bookmark.id));
      setToast({ message: "书签已删除", tone: "info" });
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : "删除书签失败",
        tone: "error",
      });
    }
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      setToast({ message: "当前浏览器不支持全屏阅读", tone: "error" });
    }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLElement>) {
    if (event.pointerType !== "touch" || !event.isPrimary) {
      return;
    }
    pageStartRef.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event: React.PointerEvent<HTMLElement>) {
    if (event.pointerType !== "touch" || !event.isPrimary || !pageStartRef.current) {
      return;
    }

    const deltaX = event.clientX - pageStartRef.current.x;
    const deltaY = event.clientY - pageStartRef.current.y;
    pageStartRef.current = null;

    if (Math.abs(deltaX) < 52 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) {
      return;
    }

    if (deltaX > 0) {
      goPrevious();
    } else {
      goNext();
    }
  }

  const theme = useMemo(() => resolveReaderTheme(settings), [settings]);
  const readerProps: Omit<ReaderViewProps, "book"> = {
    initialLocation: book.progress?.location ?? null,
    settings,
    onRelocated: handleRelocated,
    onReady: handleReady,
    onError: handleReaderError,
  };

  return (
    <div
      className="flex min-h-dvh flex-col"
      style={
        {
          "--reader-bg": theme.background,
          "--reader-panel": `${theme.background}f2`,
          "--reader-text": theme.foreground,
          "--reader-muted": theme.muted,
          "--reader-border": theme.border,
          backgroundColor: theme.background,
          color: theme.foreground,
        } as React.CSSProperties
      }
    >
      <ReaderToolbar
        title={book.title || book.originalFilename}
        chapterLabel={current.chapterLabel}
        percentage={current.percentage}
        drawerOpen={drawerOpen}
        settingsOpen={settingsOpen}
        fullscreen={fullscreen}
        onToggleDrawer={() => setDrawerOpen((open) => !open)}
        onToggleSettings={() => setSettingsOpen((open) => !open)}
        onToggleFullscreen={() => void toggleFullscreen()}
        onPrevious={goPrevious}
        onNext={goNext}
        onAddBookmark={() => void addBookmark()}
      />

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <Link
          href="/"
          className="absolute left-3 top-3 z-20 grid size-9 place-items-center rounded-full bg-black/5 text-[var(--reader-muted)] opacity-0 transition-opacity hover:bg-black/10 hover:text-[var(--reader-text)] focus:opacity-100 focus-visible:opacity-100 lg:grid lg:opacity-100"
          aria-label="返回书库"
          title="返回书库"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>

        <main
          className={cn(
            "absolute inset-0 touch-pan-y overflow-hidden",
            settings.animation !== "none" && "transition-colors duration-200",
          )}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
        >
          {book.format === "epub" ? (
            <EpubReader ref={readerRef} book={book} {...readerProps} />
          ) : (
            <TxtReader ref={readerRef} book={book} {...readerProps} />
          )}
        </main>
      </div>

      <div
        className="h-1 shrink-0"
        style={{ backgroundColor: theme.border }}
        role="progressbar"
        aria-label="阅读进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(current.percentage * 100)}
      >
        <div
          className="h-full bg-accent transition-[width] duration-300"
          style={{ width: `${Math.max(0, Math.min(100, current.percentage * 100))}%` }}
        />
      </div>

      <ReaderDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        toc={toc}
        bookmarks={bookmarks}
        onNavigate={(location) => void goTo(location)}
        onSearch={handleSearch}
        onDeleteBookmark={deleteBookmark}
      />
      <ReaderSettingsPanel
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onChange={setSettings}
      />

      {toast ? (
        <div
          className={cn(
            "fixed bottom-5 left-1/2 z-[70] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2 rounded-base border px-4 py-3 text-sm shadow-xl",
            toast.tone === "error"
              ? "border-danger/30 bg-[#fff7f5] text-danger"
              : "border-line bg-surface text-foreground",
          )}
          role="status"
          aria-live="polite"
        >
          {toast.tone === "error" ? (
            <X className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <LoaderCircle className="size-4 shrink-0" aria-hidden="true" />
          )}
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}

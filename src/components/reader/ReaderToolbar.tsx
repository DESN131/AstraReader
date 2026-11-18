"use client";

import {
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  PanelLeftOpen,
  Settings2,
} from "lucide-react";

interface ReaderToolbarProps {
  title: string;
  chapterLabel: string;
  percentage: number;
  drawerOpen: boolean;
  settingsOpen: boolean;
  fullscreen: boolean;
  onToggleDrawer: () => void;
  onToggleSettings: () => void;
  onToggleFullscreen: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onAddBookmark: () => void;
}

export function ReaderToolbar({
  title,
  chapterLabel,
  percentage,
  drawerOpen,
  settingsOpen,
  fullscreen,
  onToggleDrawer,
  onToggleSettings,
  onToggleFullscreen,
  onPrevious,
  onNext,
  onAddBookmark,
}: ReaderToolbarProps) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-[var(--reader-border)] bg-[var(--reader-panel)] px-3 text-[var(--reader-text)] backdrop-blur md:px-5">
      <button
        type="button"
        className="grid size-10 place-items-center rounded-base transition-colors hover:bg-black/5 focus-visible:bg-black/5"
        onClick={onToggleDrawer}
        aria-label={drawerOpen ? "关闭目录抽屉" : "打开目录抽屉"}
        aria-expanded={drawerOpen}
        title={drawerOpen ? "关闭目录" : "目录、搜索与书签"}
      >
        <PanelLeftOpen className="size-5" aria-hidden="true" />
      </button>

      <div className="min-w-0 flex-1 px-1">
        <p className="truncate text-sm font-semibold md:text-base">{title}</p>
        <div className="flex items-center gap-1.5 text-xs text-[var(--reader-muted)]">
          <span className="truncate">
            {chapterLabel || "尚未进入章节"}
          </span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{Math.round(percentage * 100)}%</span>
        </div>
      </div>

      <div className="hidden items-center gap-1 sm:flex">
        <button
          type="button"
          className="grid size-10 place-items-center rounded-base transition-colors hover:bg-black/5"
          onClick={onPrevious}
          aria-label="上一页"
          title="上一页"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="grid size-10 place-items-center rounded-base transition-colors hover:bg-black/5"
          onClick={onNext}
          aria-label="下一页"
          title="下一页"
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
      </div>

      <button
        type="button"
        className="grid size-10 place-items-center rounded-base transition-colors hover:bg-black/5"
        onClick={onAddBookmark}
        aria-label="添加书签"
        title="添加书签"
      >
        <BookmarkPlus className="size-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="grid size-10 place-items-center rounded-base transition-colors hover:bg-black/5"
        onClick={onToggleFullscreen}
        aria-label={fullscreen ? "退出全屏" : "进入全屏"}
        title={fullscreen ? "退出全屏" : "全屏阅读"}
      >
        {fullscreen ? (
          <Minimize2 className="size-5" aria-hidden="true" />
        ) : (
          <Maximize2 className="size-5" aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        className="grid size-10 place-items-center rounded-base transition-colors hover:bg-black/5"
        onClick={onToggleSettings}
        aria-label="打开阅读设置"
        aria-expanded={settingsOpen}
        title="阅读设置"
      >
        <Settings2 className="size-5" aria-hidden="true" />
      </button>
    </header>
  );
}

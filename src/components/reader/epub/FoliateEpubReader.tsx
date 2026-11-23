"use client";

import { AlertTriangle, LoaderCircle, RefreshCw } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import {
  hardenEpubDocument,
  hardenEpubMarkup,
  stripRemoteCss,
} from "@/lib/reader/epub/content-security";
import {
  createFoliateEpubStyles,
  createEpubSurfaceStyle,
  getEpubContentWidth,
} from "@/lib/reader/epub/theme";
import {
  formatFoliateSearchExcerpt,
  getFoliateKeyboardDirection,
  getFoliateTotalProgress,
  mapFoliateToc,
  normalizeFoliateTocLabel,
  type FoliateNavigationDirection,
} from "@/lib/reader/epub/foliate";
import type { ReaderHandle, ReaderViewProps } from "@/lib/reader/types";
import type {
  ReadingLocation,
  SearchResult,
  TocItem,
} from "@/shared/types";

import "./epub-reader.css";

type ReaderStatus = "loading" | "ready" | "error";
const EPUB_GAP = "7%";
const MAX_SEARCH_RESULTS = 200;
const MAX_SEARCH_QUERY_LENGTH = 160;

interface ReaderCallbacks {
  onRelocated: ReaderViewProps["onRelocated"];
  onReady: ReaderViewProps["onReady"];
  onError: ReaderViewProps["onError"];
}

interface FoliateSession {
  disposed: boolean;
  view: FoliateViewElement | null;
  book: FoliateBook | null;
  currentLocation: ReadingLocation | null;
  currentPercentage: number;
  currentChapterLabel: string;
  sectionFraction: number;
  toc: TocItem[];
  ready: Promise<void>;
  navigationQueue: Promise<void>;
  cleanup: (() => void) | null;
}

function createSession(): FoliateSession {
  return {
    disposed: false,
    view: null,
    book: null,
    currentLocation: null,
    currentPercentage: 0,
    currentChapterLabel: "",
    sectionFraction: 0,
    toc: [],
    ready: Promise.resolve(),
    navigationQueue: Promise.resolve(),
    cleanup: null,
  };
}

function toError(value: unknown, fallback: string): Error {
  if (value instanceof Error) {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    "message" in value &&
    typeof (value as { message?: unknown }).message === "string"
  ) {
    return new Error((value as { message: string }).message);
  }

  return new Error(fallback);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createLocation(
  detail: FoliateRelocateDetail,
  book: FoliateBook,
): ReadingLocation | null {
  const cfi = detail.cfi?.trim();
  const sectionIndex = detail.section?.current;

  if (!cfi || typeof sectionIndex !== "number") {
    return null;
  }

  return {
    kind: "epub-cfi",
    cfi,
    href: book.sections[sectionIndex]?.id,
  };
}

function applyViewSettings(
  session: FoliateSession,
  settings: ReaderViewProps["settings"],
): void {
  const view = session.view;
  if (!view || session.disposed) {
    return;
  }

  const renderer = view.renderer;
  if (!renderer) {
    return;
  }

  const readingMode = settings.animation === "scroll" ? "scrolled" : "paginated";
  const contentWidth = getEpubContentWidth(settings);

  renderer.setAttribute("flow", readingMode);
  renderer.setAttribute("gap", EPUB_GAP);
  renderer.setAttribute("margin", "0px");
  renderer.setAttribute("max-inline-size", `${contentWidth}px`);
  renderer.setAttribute("max-column-count", "1");

  renderer.setStyles(createFoliateEpubStyles(settings));
  requestAnimationFrame(() => {
    if (!session.disposed) {
      renderer.render();
    }
  });
}

function installMarkupHardening(book: FoliateBook): () => void {
  const target = book.transformTarget;
  if (!target) {
    return () => undefined;
  }

  const listener = (event: Event) => {
    const detail = (
      event as CustomEvent<{
        data?: unknown;
        type?: string;
      }>
    ).detail;
    const type = detail?.type?.toLowerCase() ?? "";

    if (
      type !== "application/xhtml+xml" &&
      type !== "text/html" &&
      type !== "application/x-dtbook+xml"
    ) {
      if (type === "text/css") {
        detail.data = Promise.resolve(detail.data).then((value) =>
          typeof value === "string" ? stripRemoteCss(value) : value,
        );
      }
      return;
    }

    detail.data = Promise.resolve(detail.data).then((value) => {
      if (typeof value !== "string") {
        return value;
      }

      try {
        return hardenEpubMarkup(value);
      } catch {
        return value;
      }
    });
  };

  target.addEventListener("data", listener);
  return () => target.removeEventListener("data", listener);
}

function animateSurface(
  paper: HTMLDivElement | null,
  settings: ReaderViewProps["settings"],
  direction: FoliateNavigationDirection | "fade",
): void {
  if (
    !paper ||
    settings.animation === "none" ||
    settings.animation === "scroll" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return;
  }

  paper.classList.remove(
    "astra-epub-slide-forward",
    "astra-epub-slide-backward",
    "astra-epub-fade",
  );
  void paper.offsetWidth;

  if (settings.animation === "fade" || direction === "fade") {
    paper.classList.add("astra-epub-fade");
  } else if (direction === "previous") {
    paper.classList.add("astra-epub-slide-backward");
  } else {
    paper.classList.add("astra-epub-slide-forward");
  }
}

async function waitForSession(
  session: FoliateSession | null,
): Promise<FoliateSession | null> {
  if (!session) {
    return null;
  }

  try {
    await session.ready;
  } catch {
    return null;
  }

  return session.disposed ? null : session;
}

function enqueueNavigation<T>(
  session: FoliateSession,
  task: () => Promise<T>,
): Promise<T> {
  const result = session.navigationQueue.then(task, task);
  session.navigationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function moveSession(
  session: FoliateSession,
  direction: FoliateNavigationDirection,
): Promise<boolean> {
  const view = session.view;
  if (!view) {
    return false;
  }

  const before =
    session.currentLocation?.kind === "epub-cfi"
      ? session.currentLocation.cfi
      : "";

  if (direction === "next") {
    await view.next();
  } else {
    await view.prev();
  }

  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  const after =
    session.currentLocation?.kind === "epub-cfi"
      ? session.currentLocation.cfi
      : "";
  return Boolean(after) && after !== before;
}

export const EpubReader = forwardRef<ReaderHandle, ReaderViewProps>(
  function EpubReader(
    {
      book,
      initialLocation,
      settings,
      onRelocated,
      onReady,
      onError,
    }: ReaderViewProps,
    ref,
  ) {
    const bookId = book.id;
    const initialProgressPercentage = book.progress?.percentage ?? 0;
    const hostRef = useRef<HTMLDivElement>(null);
    const paperRef = useRef<HTMLDivElement>(null);
    const scrollbarRef = useRef<HTMLDivElement>(null);
    const scrollbarThumbRef = useRef<HTMLDivElement>(null);
    const sessionRef = useRef<FoliateSession | null>(null);
    const settingsRef = useRef(settings);
    const initialLocationRef = useRef(initialLocation);
    const callbacksRef = useRef<ReaderCallbacks>({
      onRelocated,
      onReady,
      onError,
    });
    const dragRef = useRef<{
      pointerId: number;
      rail: HTMLDivElement;
    } | null>(null);
    const [status, setStatus] = useState<ReaderStatus>("loading");
    const [errorMessage, setErrorMessage] = useState("");
    const [retryKey, setRetryKey] = useState(0);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
      settingsRef.current = settings;
    }, [settings]);

    useEffect(() => {
      initialLocationRef.current = initialLocation;
    }, [initialLocation]);

    useEffect(() => {
      callbacksRef.current = { onRelocated, onReady, onError };
    }, [onError, onReady, onRelocated]);

    useEffect(() => {
      const host = hostRef.current;
      if (!host) {
        return;
      }

      const session = createSession();
      sessionRef.current = session;
      setStatus("loading");
      setErrorMessage("");
      let readyNotified = false;

      const initialize = async () => {
        const viewModule = await import("foliate-js/view.js");
        if (session.disposed) {
          return;
        }

        const loadedBook = await viewModule.makeBook(
          `/api/books/${encodeURIComponent(bookId)}/file`,
        );
        if (session.disposed) {
          return;
        }

        session.book = loadedBook;
        const stopHardening = installMarkupHardening(loadedBook);
        const view = document.createElement("foliate-view") as FoliateViewElement;
        view.className = "astra-foliate-view";
        view.tabIndex = 0;
        host.replaceChildren(view);
        session.view = view;
        session.cleanup = stopHardening;

        const handleLoad = (event: Event) => {
          const detail = (event as CustomEvent<FoliateLoadDetail>).detail;
          if (!detail?.doc || session.disposed) {
            return;
          }

          hardenEpubDocument(detail.doc);
          detail.doc.addEventListener(
            "keydown",
            async (keyboardEvent) => {
              const direction = getFoliateKeyboardDirection(
                keyboardEvent,
                settingsRef.current.animation === "scroll"
                  ? "scroll"
                  : "paginated",
              );
              if (!direction) {
                return;
              }

              keyboardEvent.preventDefault();
              keyboardEvent.stopPropagation();

              const moved = await enqueueNavigation(session, () =>
                moveSession(session, direction),
              );
              if (moved) {
                animateSurface(
                  paperRef.current,
                  settingsRef.current,
                  direction,
                );
              }
            },
            { passive: false },
          );
        };

        const handleRelocate = (event: Event) => {
          const detail = (
            event as CustomEvent<FoliateRelocateDetail>
          ).detail;
          const location = createLocation(detail, loadedBook);
          if (!location) {
            return;
          }

          const sectionIndex = detail.section?.current ?? 0;
          const percentage = getFoliateTotalProgress(
            loadedBook,
            sectionIndex,
            session.sectionFraction,
          );
          const chapterLabel = normalizeFoliateTocLabel(
            detail.tocItem?.label,
          );

          session.currentLocation = location;
          session.currentPercentage = percentage;
          session.currentChapterLabel =
            detail.tocItem?.label ? chapterLabel : "";

          callbacksRef.current.onRelocated(
            location,
            percentage,
            session.currentChapterLabel,
          );
          setProgress(percentage);
        };

        const handleRendererRelocate = (event: Event) => {
          const detail = (
            event as CustomEvent<FoliateRelocateDetail>
          ).detail;
          const sectionIndex =
            detail.index ?? view.lastLocation?.section?.current ?? 0;
          const renderer = view.renderer;
          let sectionFraction = clamp(
            Number.isFinite(detail.fraction) ? Number(detail.fraction) : 0,
            0,
            1,
          );

          if (renderer.scrolled) {
            if (
              renderer.viewSize > 0 &&
              renderer.viewSize - renderer.end <= 2
            ) {
              sectionFraction = 1;
            }
          } else if (
            renderer.pages > 2 &&
            renderer.page >= renderer.pages - 2
          ) {
            sectionFraction = 1;
          }

          session.sectionFraction = sectionFraction;
          session.currentPercentage = getFoliateTotalProgress(
            loadedBook,
            sectionIndex,
            sectionFraction,
          );
        };

        view.addEventListener("load", handleLoad);
        view.addEventListener("relocate", handleRelocate);
        const detachViewListeners = () => {
          view.removeEventListener("load", handleLoad);
          view.removeEventListener("relocate", handleRelocate);
        };
        const previousCleanup = session.cleanup;
        session.cleanup = () => {
          detachViewListeners();
          view.renderer?.removeEventListener(
            "relocate",
            handleRendererRelocate,
            true,
          );
          previousCleanup?.();
        };

        await view.open(loadedBook);
        if (session.disposed) {
          return;
        }

        session.toc = mapFoliateToc(loadedBook.toc);
        applyViewSettings(session, settingsRef.current);
        view.renderer.addEventListener(
          "relocate",
          handleRendererRelocate,
          true,
        );

        const saved = initialLocationRef.current;
        let displayed = false;

        if (initialProgressPercentage >= 0.999) {
          await view.goTo({ fraction: 1 });
          displayed = true;
        } else if (saved?.kind === "epub-cfi") {
          for (const target of [saved.cfi, saved.href]) {
            if (!target) {
              continue;
            }

            await view.goTo(target);
            if (session.currentLocation) {
              displayed = true;
              break;
            }
          }
        }

        if (!displayed) {
          await view.goTo(0);
        }

        if (session.disposed) {
          return;
        }

        setStatus("ready");
        if (!readyNotified) {
          readyNotified = true;
          callbacksRef.current.onReady(session.toc);
        }
      };

      session.ready = initialize().catch((error: unknown) => {
        if (session.disposed) {
          return;
        }

        const normalized = toError(error, "打开 EPUB 失败");
        setErrorMessage(normalized.message);
        setStatus("error");
        callbacksRef.current.onError(normalized);
      });

      return () => {
        session.disposed = true;
        session.cleanup?.();
        session.view?.close();
        host.replaceChildren();

        if (sessionRef.current === session) {
          sessionRef.current = null;
        }
      };
    }, [bookId, initialProgressPercentage, retryKey]);

    useEffect(() => {
      const session = sessionRef.current;
      if (session?.view) {
        applyViewSettings(session, settings);
      }
    }, [settings]);

    useEffect(() => {
      if (settings.animation !== "scroll" || status !== "ready") {
        return;
      }

      const rail = scrollbarRef.current;
      const thumb = scrollbarThumbRef.current;
      if (!rail || !thumb) {
        return;
      }

      const renderThumb = () => {
        const trackHeight = rail.clientHeight;
        const thumbHeight = Math.min(
          trackHeight,
          Math.max(32, trackHeight * 0.12),
        );
        const thumbTop = (trackHeight - thumbHeight) * progress;

        thumb.style.height = `${thumbHeight}px`;
        thumb.style.transform = `translateY(${thumbTop}px)`;
        rail.dataset.visible = "true";
      };

      renderThumb();
      const observer = new ResizeObserver(renderThumb);
      observer.observe(rail);

      return () => observer.disconnect();
    }, [progress, settings.animation, status]);

    const moveToRailPosition = (clientY: number) => {
      const rail = dragRef.current?.rail;
      const session = sessionRef.current;
      const view = session?.view;
      if (!rail || !view) {
        return;
      }

      const rect = rail.getBoundingClientRect();
      const fraction = clamp((clientY - rect.top) / rect.height, 0, 1);
      void enqueueNavigation(session, async () => {
        await view.goToFraction(fraction);
      });
    };

    const handleScrollbarPointerDown = (
      event: React.PointerEvent<HTMLDivElement>,
    ) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        rail: event.currentTarget,
      };
      moveToRailPosition(event.clientY);
    };

    const handleScrollbarPointerMove = (
      event: React.PointerEvent<HTMLDivElement>,
    ) => {
      if (dragRef.current?.pointerId !== event.pointerId) {
        return;
      }

      moveToRailPosition(event.clientY);
    };

    const handleScrollbarPointerEnd = (
      event: React.PointerEvent<HTMLDivElement>,
    ) => {
      if (dragRef.current?.pointerId === event.pointerId) {
        dragRef.current = null;
      }
    };

    const handleKeyboardNavigation = async (
      event: React.KeyboardEvent<HTMLDivElement>,
    ) => {
      const direction = getFoliateKeyboardDirection(
        event.nativeEvent,
        readingMode,
      );
      if (!direction) {
        return;
      }

      event.preventDefault();
      const session = await waitForSession(sessionRef.current);
      if (!session) {
        return;
      }

      try {
        const moved = await enqueueNavigation(session, () =>
          moveSession(session, direction),
        );
        if (moved) {
          animateSurface(paperRef.current, settingsRef.current, direction);
        }
      } catch (error) {
        callbacksRef.current.onError(
          toError(
            error,
            direction === "next"
              ? "EPUB 翻到下一页失败"
              : "EPUB 翻到上一页失败",
          ),
        );
      }
    };

    useImperativeHandle(
      ref,
      () => ({
        async next() {
          const session = await waitForSession(sessionRef.current);
          if (!session) {
            return false;
          }

          try {
            return await enqueueNavigation(session, async () => {
              const moved = await moveSession(session, "next");
              if (moved) {
                animateSurface(
                  paperRef.current,
                  settingsRef.current,
                  "next",
                );
              }
              return moved;
            });
          } catch (error) {
            callbacksRef.current.onError(
              toError(error, "EPUB 翻到下一页失败"),
            );
            return false;
          }
        },

        async previous() {
          const session = await waitForSession(sessionRef.current);
          if (!session) {
            return false;
          }

          try {
            return await enqueueNavigation(session, async () => {
              const moved = await moveSession(session, "previous");
              if (moved) {
                animateSurface(
                  paperRef.current,
                  settingsRef.current,
                  "previous",
                );
              }
              return moved;
            });
          } catch (error) {
            callbacksRef.current.onError(
              toError(error, "EPUB 翻到上一页失败"),
            );
            return false;
          }
        },

        async goTo(location: ReadingLocation) {
          if (location.kind !== "epub-cfi") {
            return;
          }

          const session = await waitForSession(sessionRef.current);
          if (!session?.view) {
            return;
          }

          await enqueueNavigation(session, async () => {
            const view = session.view;
            if (!view) {
              return;
            }

            const beforeCfi = view.lastLocation?.cfi ?? "";
            const isCfiTarget = location.cfi.startsWith("epubcfi(");
            await view.goTo(location.cfi);
            const afterCfi = view.lastLocation?.cfi ?? "";
            if (
              isCfiTarget &&
              location.href &&
              location.href !== location.cfi &&
              afterCfi === beforeCfi
            ) {
              await view.goTo(location.href);
            }
            animateSurface(
              paperRef.current,
              settingsRef.current,
              "fade",
            );
          });
        },

        getLocation() {
          return sessionRef.current?.currentLocation ?? null;
        },

        async search(
          query: string,
          signal?: AbortSignal,
        ): Promise<SearchResult[]> {
          const session = await waitForSession(sessionRef.current);
          const view = session?.view;
          if (!session || !view) {
            return [];
          }

          const normalizedQuery = query
            .trim()
            .slice(0, MAX_SEARCH_QUERY_LENGTH);
          if (!normalizedQuery) {
            return [];
          }

          const results: SearchResult[] = [];
          const iterator = view.search({ query: normalizedQuery });

          try {
            for await (const item of iterator) {
              if (signal?.aborted) {
                throw new DOMException("搜索已取消", "AbortError");
              }

              if (item === "done") {
                break;
              }

              if (item.subitems?.length) {
                for (const subitem of item.subitems) {
                  if (!subitem.cfi?.trim()) {
                    continue;
                  }

                  results.push({
                    id: `epub-search-${results.length}-${subitem.cfi}`,
                    location: {
                      kind: "epub-cfi",
                      cfi: subitem.cfi,
                    },
                    label: item.label || "EPUB 搜索结果",
                    excerpt: formatFoliateSearchExcerpt(subitem.excerpt),
                  });

                  if (results.length >= MAX_SEARCH_RESULTS) {
                    return results;
                  }
                }
              }
            }
          } catch (error) {
            view.clearSearch();
            throw error;
          }

          return results;
        },
      }),
      [],
    );

    const surfaceStyle = createEpubSurfaceStyle(settings);
    const readingMode = settings.animation === "scroll" ? "scroll" : "paginated";
    const thumbHeight =
      scrollbarRef.current?.clientHeight && status === "ready"
        ? Math.min(
            scrollbarRef.current.clientHeight,
            Math.max(32, scrollbarRef.current.clientHeight * 0.12),
          )
        : 32;
    const thumbTop = scrollbarRef.current?.clientHeight
      ? (scrollbarRef.current.clientHeight - thumbHeight) * progress
      : 0;

    return (
      <div
        className="astra-epub-root"
        data-reading-mode={readingMode}
        style={surfaceStyle}
        aria-label="EPUB 阅读区"
        aria-busy={status === "loading"}
        onKeyDown={(event) => void handleKeyboardNavigation(event)}
        tabIndex={0}
      >
        <div className="astra-epub-stage">
          <div ref={paperRef} className="astra-epub-paper">
            <div
              ref={hostRef}
              id={`epub-content-${bookId}`}
              className="astra-epub-viewport"
            />
            {readingMode === "scroll" ? (
              <div
                ref={scrollbarRef}
                className="astra-epub-scrollbar"
                data-visible="false"
                role="scrollbar"
                aria-label="阅读位置"
                aria-controls={`epub-content-${bookId}`}
                aria-orientation="vertical"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}
                onPointerDown={handleScrollbarPointerDown}
                onPointerMove={handleScrollbarPointerMove}
                onPointerUp={handleScrollbarPointerEnd}
                onPointerCancel={handleScrollbarPointerEnd}
              >
                <div
                  ref={scrollbarThumbRef}
                  className="astra-epub-scrollbar-thumb"
                  style={{
                    height: `${thumbHeight}px`,
                    transform: `translateY(${thumbTop}px)`,
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>

        {status === "loading" ? (
          <div
            className="astra-epub-status-layer"
            role="status"
            aria-live="polite"
          >
            <div className="astra-epub-status-panel">
              <LoaderCircle
                className="astra-epub-status-icon astra-epub-spinner"
                aria-hidden="true"
              />
              <p className="astra-epub-status-title">正在打开 EPUB</p>
              <p className="astra-epub-status-message">
                正在解析目录并准备分页排版
              </p>
            </div>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="astra-epub-status-layer" role="alert">
            <div className="astra-epub-status-panel">
              <AlertTriangle
                className="astra-epub-status-icon"
                aria-hidden="true"
              />
              <p className="astra-epub-status-title">无法打开这本书</p>
              <p className="astra-epub-status-message">
                {errorMessage || "EPUB 文件可能已损坏或暂时不可用"}
              </p>
              <button
                type="button"
                className="astra-epub-retry-button"
                onClick={() => setRetryKey((current) => current + 1)}
              >
                <RefreshCw size={16} aria-hidden="true" />
                重新加载
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  },
);

EpubReader.displayName = "EpubReader";

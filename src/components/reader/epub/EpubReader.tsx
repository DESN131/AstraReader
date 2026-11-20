"use client";

import ePub, { type Book, type Contents, type Rendition } from "epubjs";
import { AlertTriangle, LoaderCircle, RefreshCw } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import type { ReaderHandle, ReaderViewProps } from "@/lib/reader/types";
import type {
  ReadingLocation,
  SearchResult,
  TocItem,
} from "@/shared/types";

import {
  hardenEpubContents,
  hardenEpubDocument,
} from "@/lib/reader/epub/content-security";
import { ensureEpubLocations } from "@/lib/reader/epub/locations";
import {
  createEpubChapterLabelLookup,
  findEpubChapterLabel,
  getEpubInitialDisplayTargets,
  mapEpubNavigationToToc,
} from "@/lib/reader/epub/navigation";
import {
  destroyEpubBook,
  getCurrentEpubLocation,
  getEpubPercentage,
  getEpubKeyboardDirection,
  readEpubApiError,
  renderEpubWithoutUnload,
  toEpubReadingLocation,
  toError,
  type EpubRelocatedLocation,
  type EpubReadingMode,
} from "@/lib/reader/epub/runtime";
import { searchEpubBook } from "@/lib/reader/epub/search";
import {
  createEpubSurfaceStyle,
  createEpubThemeRules,
} from "@/lib/reader/epub/theme";
import type { ReaderSettings } from "@/shared/types";

import "./epub-reader.css";

type ReaderStatus = "loading" | "ready" | "error";
type NavigationDirection = "next" | "previous";

interface ReaderCallbacks {
  onRelocated: ReaderViewProps["onRelocated"];
  onReady: ReaderViewProps["onReady"];
  onError: ReaderViewProps["onError"];
}

interface EpubReaderSession {
  disposed: boolean;
  readingMode: EpubReadingMode;
  host: HTMLElement;
  book: Book | null;
  rendition: Rendition | null;
  toc: TocItem[];
  chapterLabels: Map<string, string>;
  currentLocation: EpubRelocatedLocation | null;
  lastEmissionKey: string;
  ready: Promise<void>;
  navigationQueue: Promise<void>;
  resizeObserver: ResizeObserver | null;
  resizeFrame: number | null;
  reflowTimer: number | null;
  reflowing: boolean;
  reflowPending: boolean;
  detachListeners: (() => void) | null;
  displayed: boolean;
}

function createSession(
  readingMode: EpubReadingMode,
  host: HTMLElement,
): EpubReaderSession {
  return {
    disposed: false,
    readingMode,
    host,
    book: null,
    rendition: null,
    toc: [],
    chapterLabels: new Map(),
    currentLocation: null,
    lastEmissionKey: "",
    ready: Promise.resolve(),
    navigationQueue: Promise.resolve(),
    resizeObserver: null,
    resizeFrame: null,
    reflowTimer: null,
    reflowing: false,
    reflowPending: false,
    detachListeners: null,
    displayed: false,
  };
}

function measureViewport(element: HTMLElement): {
  width: number;
  height: number;
} {
  const rect = element.getBoundingClientRect();
  const viewportHeight =
    typeof window === "undefined"
      ? 720
      : Math.max(320, window.innerHeight - 72);

  return {
    width: Math.max(
      320,
      Math.floor(
        rect.width >= 32
          ? rect.width
          : element.clientWidth >= 32
            ? element.clientWidth
            : 640,
      ),
    ),
    height: Math.max(
      320,
      Math.floor(
        rect.height >= 32
          ? rect.height
          : element.clientHeight >= 32
            ? element.clientHeight
            : viewportHeight,
      ),
    ),
  };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function getEpubScroller(session: EpubReaderSession): HTMLElement | null {
  return session.host.querySelector<HTMLElement>(".epub-container");
}

async function ensureCurrentPaginationLayout(
  session: EpubReaderSession,
): Promise<void> {
  if (session.readingMode !== "paginated") {
    return;
  }

  const scroller = getEpubScroller(session);
  const iframe = scroller?.querySelector<HTMLIFrameElement>("iframe");
  const body = iframe?.contentDocument?.body;

  if (
    !session.rendition ||
    !scroller ||
    !body ||
    Math.abs(body.clientWidth - scroller.clientWidth) <= 1
  ) {
    return;
  }

  const rendition = session.rendition;
  const location =
    session.currentLocation ??
    (await getCurrentEpubLocation(rendition));
  const { width, height } = measureViewport(session.host);
  const resize = rendition.resize as (
    width: number,
    height: number,
    cfi?: string,
  ) => void;

  resize.call(rendition, width, height, location?.start?.cfi);
  await nextFrame();

  if (Math.abs(body.clientWidth - scroller.clientWidth) <= 1) {
    await rendition.reportLocation();
    return;
  }

  rendition.clear();

  try {
    await rendition.display(location?.start?.cfi ?? "");
  } catch {
    if (!location?.start?.href || location.start.href === location.start.cfi) {
      throw new Error("EPUB 分页布局同步失败");
    }
    await rendition.display(location.start.href);
  }

  await rendition.reportLocation();
  const current = await getCurrentEpubLocation(rendition);
  if (current) {
    session.currentLocation = current;
  }
}

function applyTheme(rendition: Rendition, settings: ReaderSettings) {
  rendition.themes.registerRules(
    "astra-reader",
    createEpubThemeRules(settings),
  );
  rendition.themes.select("astra-reader");
}

function scheduleResize(
  session: EpubReaderSession,
  element: HTMLElement,
) {
  if (
    session.disposed ||
    !session.rendition ||
    !session.displayed
  ) {
    return;
  }

  if (session.reflowing) {
    session.reflowPending = true;
    return;
  }

  if (
    session.readingMode === "scroll" &&
    !session.currentLocation?.start?.cfi
  ) {
    return;
  }

  if (session.resizeFrame !== null) {
    cancelAnimationFrame(session.resizeFrame);
  }

  session.resizeFrame = requestAnimationFrame(() => {
    session.resizeFrame = null;

    if (session.disposed || !session.rendition || !session.displayed) {
      return;
    }

    const { width, height } = measureViewport(element);
    try {
      const resize = session.rendition.resize as (
        width: number,
        height: number,
        cfi?: string,
      ) => void;
      resize.call(
        session.rendition,
        width,
        height,
        session.currentLocation?.start?.cfi,
      );
    } catch (error) {
      console.warn("[AstraReader] EPUB resize deferred", error);
    }
  });
}

function scheduleThemeReflow(
  session: EpubReaderSession,
  element: HTMLElement,
  callbacks: ReaderCallbacks,
) {
  if (session.disposed || !session.rendition || !session.displayed) {
    return;
  }

  if (session.reflowTimer !== null) {
    window.clearTimeout(session.reflowTimer);
  }

  session.reflowTimer = window.setTimeout(() => {
    session.reflowTimer = null;
    void reflowAtCurrentLocation(session, element, callbacks).catch(
      (error: unknown) => {
        if (!session.disposed) {
          callbacks.onError(
            toError(error, "EPUB 重新排版失败"),
          );
        }
      },
    );
  }, 40);
}

async function reflowAtCurrentLocation(
  session: EpubReaderSession,
  element: HTMLElement,
  callbacks: ReaderCallbacks,
) {
  if (
    session.disposed ||
    !session.rendition ||
    !session.displayed ||
    session.reflowing
  ) {
    return;
  }

  if (
    session.readingMode === "scroll" &&
    !session.currentLocation?.start?.cfi
  ) {
    return;
  }

  const location =
    session.currentLocation ??
    (await getCurrentEpubLocation(session.rendition));

  if (!location?.start?.cfi) {
    return;
  }

  const { width, height } = measureViewport(element);
  const rendition = session.rendition;
  session.reflowing = true;

  try {
    await enqueueNavigation(session, async () => {
      const resize = rendition.resize as (
        width: number,
        height: number,
        cfi?: string,
      ) => void;

      resize.call(rendition, width, height, location.start?.cfi);
      await nextFrame();
      rendition.clear();

      try {
        await rendition.display(location.start?.cfi ?? "");
      } catch {
        if (
          !location.start?.href ||
          location.start.href === location.start.cfi
        ) {
          throw new Error("EPUB 重新排版失败");
        }
        await rendition.display(location.start.href);
      }

      await rendition.reportLocation();
      const current = await getCurrentEpubLocation(rendition);
      emitLocation(session, callbacks, current);
    });
  } finally {
    session.reflowing = false;

    if (session.reflowPending) {
      session.reflowPending = false;
      scheduleThemeReflow(session, element, callbacks);
    }
  }
}

function animateSurface(
  paper: HTMLDivElement | null,
  settings: ReaderSettings,
  direction: NavigationDirection | "fade",
) {
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

function emitLocation(
  session: EpubReaderSession,
  callbacks: ReaderCallbacks,
  location: EpubRelocatedLocation | null,
) {
  if (session.disposed || !session.book || !location?.start?.cfi) {
    return;
  }

  session.currentLocation = location;

  const readingLocation = toEpubReadingLocation(location);

  if (!readingLocation) {
    return;
  }

  const percentage = getEpubPercentage(session.book, location);
  const chapterLabel = findEpubChapterLabel(
    session.chapterLabels,
    location.start.href,
  );
  const emissionKey = `${readingLocation.cfi}|${percentage}|${chapterLabel}`;

  if (emissionKey === session.lastEmissionKey) {
    return;
  }

  session.lastEmissionKey = emissionKey;
  callbacks.onRelocated(readingLocation, percentage, chapterLabel);
}

function enqueueNavigation<T>(
  session: EpubReaderSession,
  task: () => Promise<T>,
): Promise<T> {
  const result = session.navigationQueue.then(task, task);
  session.navigationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function waitForSession(
  session: EpubReaderSession | null,
): Promise<EpubReaderSession | null> {
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

async function moveSession(
  session: EpubReaderSession,
  direction: NavigationDirection,
): Promise<boolean> {
  if (!session.rendition) {
    return false;
  }

  await ensureCurrentPaginationLayout(session);

  const before = await getCurrentEpubLocation(session.rendition);

  if (session.readingMode === "scroll") {
    const scroller = getEpubScroller(session);

    if (scroller) {
      const maxScrollTop = Math.max(
        0,
        scroller.scrollHeight - scroller.clientHeight,
      );
      const step = Math.max(160, Math.round(scroller.clientHeight * 0.88));

      if (
        direction === "next" &&
        scroller.scrollTop < maxScrollTop - 1
      ) {
        scroller.scrollTop = Math.min(
          maxScrollTop,
          scroller.scrollTop + step,
        );
        await nextFrame();
        await session.rendition.reportLocation();
        const current = await getCurrentEpubLocation(session.rendition);
        if (current) {
          session.currentLocation = current;
        }
        return true;
      }

      if (direction === "previous" && scroller.scrollTop > 1) {
        scroller.scrollTop = Math.max(0, scroller.scrollTop - step);
        await nextFrame();
        await session.rendition.reportLocation();
        const current = await getCurrentEpubLocation(session.rendition);
        if (current) {
          session.currentLocation = current;
        }
        return true;
      }
    }
  }

  if (direction === "next") {
    await session.rendition.next();
  } else {
    await session.rendition.prev();
  }

  if (session.readingMode === "scroll") {
    await nextFrame();
    await session.rendition.reportLocation();
  }

  const after = await getCurrentEpubLocation(session.rendition);
  const beforeKey = before?.start?.cfi ?? "";
  const afterKey = after?.start?.cfi ?? "";

  if (after) {
    session.currentLocation = after;
  }

  return !afterKey || afterKey !== beforeKey;
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
    },
    ref,
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const paperRef = useRef<HTMLDivElement>(null);
    const sessionRef = useRef<EpubReaderSession | null>(null);
    const callbacksRef = useRef<ReaderCallbacks>({
      onRelocated,
      onReady,
      onError,
    });
    const settingsRef = useRef(settings);
    const initialLocationRef = useRef(initialLocation);
    const readyBookRef = useRef<string | null>(null);
    const [status, setStatus] = useState<ReaderStatus>("loading");
    const [errorMessage, setErrorMessage] = useState("");
    const [retryKey, setRetryKey] = useState(0);

    const bookId = book.id;
    const readingMode: EpubReadingMode =
      settings.animation === "scroll" ? "scroll" : "paginated";

    useEffect(() => {
      callbacksRef.current = { onRelocated, onReady, onError };
    }, [onError, onReady, onRelocated]);

    useEffect(() => {
      initialLocationRef.current = initialLocation;
    }, [initialLocation]);

    useEffect(() => {
      settingsRef.current = settings;
      const session = sessionRef.current;
      const host = hostRef.current;

      if (!session?.rendition || session.disposed || !session.displayed || !host) {
        return;
      }

      applyTheme(session.rendition, settings);
      scheduleThemeReflow(session, host, callbacksRef.current);
    }, [settings]);

    useEffect(() => {
      const host = hostRef.current;

      if (!host) {
        return;
      }

      const controller = new AbortController();
      const session = createSession(readingMode, host);
      sessionRef.current = session;
      setStatus("loading");
      setErrorMessage("");

      const initialize = async () => {
        try {
          const response = await fetch(
            `/api/books/${encodeURIComponent(bookId)}/file`,
            {
              cache: "no-store",
              signal: controller.signal,
            },
          );

          if (!response.ok) {
            throw await readEpubApiError(
              response,
              `无法加载 EPUB 文件（HTTP ${response.status}）`,
            );
          }

          const bytes = await response.arrayBuffer();

          if (bytes.byteLength === 0) {
            throw new Error("EPUB 文件为空");
          }

          if (session.disposed) {
            return;
          }

          const loadedBook = ePub(bytes, { replacements: "blobUrl" });
          session.book = loadedBook;

          if (session.disposed) {
            destroyEpubBook(loadedBook);
            return;
          }

          loadedBook.spine.hooks.content.register(hardenEpubDocument);
          await Promise.all([loadedBook.opened, loadedBook.ready]);

          if (session.disposed) {
            return;
          }

          const navigation = await loadedBook.loaded.navigation;
          session.toc = mapEpubNavigationToToc(navigation.toc);
          session.chapterLabels = createEpubChapterLabelLookup(session.toc);

          const initialSize = measureViewport(host);
          const rendition = renderEpubWithoutUnload(loadedBook, host, {
            width: initialSize.width,
            height: initialSize.height,
            manager: "default",
            view: "iframe",
            flow: readingMode === "scroll" ? "scrolled" : "paginated",
            spread: "none",
            gap: 0,
            allowScriptedContent: false,
            allowPopups: false,
            resizeOnOrientationChange: true,
          } as Parameters<Book["renderTo"]>[1] & {
            allowPopups: boolean;
            gap: number;
          });

          session.rendition = rendition;

          if (session.disposed) {
            return;
          }

          applyTheme(rendition, settingsRef.current);
          rendition.hooks.content.register(hardenEpubContents);

          const handleRelocated = (location: EpubRelocatedLocation) => {
            emitLocation(session, callbacksRef.current, location);
          };
          const handleDisplayError = (value: unknown) => {
            callbacksRef.current.onError(
              toError(value, "EPUB 页面渲染失败"),
            );
          };
          const handleKeyDown = (event: KeyboardEvent) => {
            const direction = getEpubKeyboardDirection(
              event,
              session.readingMode,
            );
            if (!direction) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();

            void enqueueNavigation(session, async () => {
              const moved = await moveSession(session, direction);

              if (moved) {
                emitLocation(
                  session,
                  callbacksRef.current,
                  session.currentLocation,
                );
                animateSurface(
                  paperRef.current,
                  settingsRef.current,
                  direction,
                );
              }
            }).catch((error: unknown) => {
              callbacksRef.current.onError(
                toError(
                  error,
                  direction === "next"
                    ? "EPUB 翻到下一页失败"
                    : "EPUB 翻到上一页失败",
                ),
              );
            });
          };
          const attachKeyboardHandler = (contents: Contents) => {
            contents.document.addEventListener(
              "keydown",
              handleKeyDown,
              { passive: false },
            );
          };

          rendition.on("relocated", handleRelocated);
          rendition.on("displayError", handleDisplayError);
          rendition.hooks.content.register(attachKeyboardHandler);

          session.detachListeners = () => {
            rendition.off("relocated", handleRelocated);
            rendition.off("displayError", handleDisplayError);
            rendition.hooks.content.deregister(attachKeyboardHandler);
            rendition.hooks.content.deregister(hardenEpubContents);
          };

          session.resizeObserver = new ResizeObserver(() => {
            scheduleResize(session, host);
          });
          session.resizeObserver.observe(host);

          const initialTargets = getEpubInitialDisplayTargets(
            initialLocationRef.current,
          );
          let displayed = false;

          for (const target of initialTargets) {
            try {
              await rendition.display(target);
              displayed = true;
              break;
            } catch {
              // Try the next valid target from the same saved location.
            }
          }

          if (!displayed) {
            await rendition.display();
          }

          if (session.disposed) {
            return;
          }

          session.displayed = true;
          await rendition.reportLocation();
          await nextFrame();

          const current =
            (await getCurrentEpubLocation(rendition)) ??
            session.currentLocation;
          emitLocation(session, callbacksRef.current, current);
          scheduleResize(session, host);
          setStatus("ready");

          if (readyBookRef.current !== bookId) {
            readyBookRef.current = bookId;
            callbacksRef.current.onReady(session.toc);
          }

          void ensureEpubLocations(
            bookId,
            loadedBook,
            controller.signal,
          )
            .then(async () => {
              if (session.disposed || !session.rendition) {
                return;
              }

              const located =
                (await getCurrentEpubLocation(session.rendition)) ??
                session.currentLocation;
              emitLocation(session, callbacksRef.current, located);
            })
            .catch((error: unknown) => {
              if (!controller.signal.aborted && !session.disposed) {
                console.warn(
                  "[AstraReader] EPUB locations unavailable",
                  error,
                );
              }
            });
        } catch (error) {
          if (session.disposed || controller.signal.aborted) {
            return;
          }

          const normalized = toError(error, "打开 EPUB 失败");
          setErrorMessage(normalized.message);
          setStatus("error");
          callbacksRef.current.onError(normalized);
        }
      };

      session.ready = initialize();

      return () => {
        const preservedLocation = toEpubReadingLocation(
          session.currentLocation,
        );

        if (preservedLocation) {
          initialLocationRef.current = preservedLocation;
        }

        session.disposed = true;
        controller.abort();

        if (session.resizeFrame !== null) {
          cancelAnimationFrame(session.resizeFrame);
        }

        if (session.reflowTimer !== null) {
          window.clearTimeout(session.reflowTimer);
        }

        session.resizeObserver?.disconnect();
        session.detachListeners?.();

        if (session.book) {
          destroyEpubBook(session.book, session.rendition);
        }

        host.replaceChildren();

        if (sessionRef.current === session) {
          sessionRef.current = null;
        }
      };
    }, [bookId, readingMode, retryKey]);

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
                emitLocation(
                  session,
                  callbacksRef.current,
                  session.currentLocation,
                );
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
                emitLocation(
                  session,
                  callbacksRef.current,
                  session.currentLocation,
                );
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

          if (!session?.rendition) {
            return;
          }

          try {
            await enqueueNavigation(session, async () => {
              const rendition = session.rendition;

              if (!rendition) {
                return;
              }

              try {
                await rendition.display(location.cfi);
              } catch (error) {
                if (!location.href || location.href === location.cfi) {
                  throw error;
                }

                await rendition.display(location.href);
              }

              const current = await getCurrentEpubLocation(rendition);
              emitLocation(session, callbacksRef.current, current);
              animateSurface(paperRef.current, settingsRef.current, "fade");
            });
          } catch (error) {
            callbacksRef.current.onError(
              toError(error, "EPUB 章节跳转失败"),
            );
            throw error;
          }
        },

        getLocation() {
          const session = sessionRef.current;

          if (!session || session.disposed) {
            return null;
          }

          return toEpubReadingLocation(session.currentLocation);
        },

        async search(
          query: string,
          signal?: AbortSignal,
        ): Promise<SearchResult[]> {
          const session = await waitForSession(sessionRef.current);

          if (!session?.book) {
            return [];
          }

          return searchEpubBook({
            book: session.book,
            toc: session.toc,
            query,
            signal,
          });
        },
      }),
      [],
    );

    const surfaceStyle = createEpubSurfaceStyle(settings);

    return (
      <div
        className="astra-epub-root"
        data-reading-mode={readingMode}
        style={surfaceStyle}
        aria-label="EPUB 阅读区"
        aria-busy={status === "loading"}
      >
        <div className="astra-epub-stage">
          <div ref={paperRef} className="astra-epub-paper">
            <div ref={hostRef} className="astra-epub-viewport" />
          </div>
        </div>

        {status === "loading" ? (
          <div className="astra-epub-status-layer" role="status" aria-live="polite">
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

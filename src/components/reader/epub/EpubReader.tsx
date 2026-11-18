"use client";

import ePub, { type Book, type Rendition } from "epubjs";
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
  findFirstEpubReadingTarget,
  isEpubFrontMatterTarget,
  mapEpubNavigationToToc,
} from "@/lib/reader/epub/navigation";
import {
  destroyEpubBook,
  getCurrentEpubLocation,
  getEpubPercentage,
  readEpubApiError,
  toEpubReadingLocation,
  toError,
  type EpubRelocatedLocation,
} from "@/lib/reader/epub/runtime";
import { searchEpubBook } from "@/lib/reader/epub/search";
import {
  createEpubSurfaceStyle,
  createEpubThemeRules,
} from "@/lib/reader/epub/theme";
import type { ReaderSettings } from "@/shared/types";

import styles from "./EpubReader.module.css";

type ReaderStatus = "loading" | "ready" | "error";
type NavigationDirection = "next" | "previous";

interface ReaderCallbacks {
  onRelocated: ReaderViewProps["onRelocated"];
  onReady: ReaderViewProps["onReady"];
  onError: ReaderViewProps["onError"];
}

interface EpubReaderSession {
  disposed: boolean;
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
  detachListeners: (() => void) | null;
  displayed: boolean;
}

function createSession(): EpubReaderSession {
  return {
    disposed: false,
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
    detachListeners: null,
    displayed: false,
  };
}

function measureViewport(element: HTMLElement): {
  width: number;
  height: number;
} {
  const rect = element.getBoundingClientRect();

  return {
    width: Math.max(1, Math.floor(rect.width || element.clientWidth || 640)),
    height: Math.max(1, Math.floor(rect.height || element.clientHeight || 720)),
  };
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
  if (session.disposed || !session.rendition || !session.displayed) {
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
      session.rendition.resize(width, height);
    } catch (error) {
      console.warn("[AstraReader] EPUB resize deferred", error);
    }
  });
}

function scheduleThemeReflow(
  session: EpubReaderSession,
  element: HTMLElement,
) {
  if (session.disposed || !session.rendition || !session.displayed) {
    return;
  }

  if (session.reflowTimer !== null) {
    window.clearTimeout(session.reflowTimer);
  }

  session.reflowTimer = window.setTimeout(() => {
    session.reflowTimer = null;
    void reflowAtCurrentLocation(session, element);
  }, 40);
}

async function reflowAtCurrentLocation(
  session: EpubReaderSession,
  element: HTMLElement,
) {
  if (session.disposed || !session.rendition || !session.displayed) {
    return;
  }

  const { width, height } = measureViewport(element);
  const location =
    session.currentLocation ??
    (await getCurrentEpubLocation(session.rendition));
  const resize = session.rendition.resize as (
    width: number,
    height: number,
    cfi?: string,
  ) => void;

  resize.call(session.rendition, width, height, location?.start?.cfi);
}

function animateSurface(
  paper: HTMLDivElement | null,
  settings: ReaderSettings,
  direction: NavigationDirection | "fade",
) {
  if (
    !paper ||
    settings.animation === "none" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return;
  }

  paper.classList.remove(
    styles.slideForward,
    styles.slideBackward,
    styles.fade,
  );
  void paper.offsetWidth;

  if (settings.animation === "fade" || direction === "fade") {
    paper.classList.add(styles.fade);
  } else if (direction === "previous") {
    paper.classList.add(styles.slideBackward);
  } else {
    paper.classList.add(styles.slideForward);
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

  const before = await getCurrentEpubLocation(session.rendition);

  if (direction === "next") {
    await session.rendition.next();
  } else {
    await session.rendition.prev();
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
      scheduleThemeReflow(session, host);
    }, [settings]);

    useEffect(() => {
      const host = hostRef.current;

      if (!host) {
        return;
      }

      const controller = new AbortController();
      const session = createSession();
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
          const rendition = loadedBook.renderTo(host, {
            width: initialSize.width,
            height: initialSize.height,
            manager: "default",
            view: "iframe",
            flow: "paginated",
            spread: "none",
            allowScriptedContent: false,
            allowPopups: false,
            resizeOnOrientationChange: true,
          } as Parameters<Book["renderTo"]>[1] & {
            allowPopups: boolean;
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

          rendition.on("relocated", handleRelocated);
          rendition.on("displayError", handleDisplayError);

          session.detachListeners = () => {
            rendition.off("relocated", handleRelocated);
            rendition.off("displayError", handleDisplayError);
            rendition.hooks.content.deregister(hardenEpubContents);
          };

          session.resizeObserver = new ResizeObserver(() => {
            scheduleResize(session, host);
          });
          session.resizeObserver.observe(host);

          const requestedTarget =
            initialLocationRef.current?.kind === "epub-cfi"
              ? initialLocationRef.current.cfi
              : "";
          const requestedHref =
            initialLocationRef.current?.kind === "epub-cfi"
              ? initialLocationRef.current.href
              : "";
          const requestedIsFrontMatter = isEpubFrontMatterTarget(
            requestedHref || requestedTarget,
          );
          const firstReadingTarget = findFirstEpubReadingTarget(navigation.toc);
          const preferredTarget =
            (!requestedIsFrontMatter && requestedTarget) ||
            firstReadingTarget ||
            requestedTarget;
          const fallbackTarget =
            requestedIsFrontMatter || !requestedHref ? "" : requestedHref;
          let displayed = false;

          if (preferredTarget) {
            try {
              await rendition.display(preferredTarget);
              displayed = true;
            } catch {
              // Try the href from the same reading location next.
            }
          }

          if (
            !displayed &&
            fallbackTarget &&
            fallbackTarget !== preferredTarget
          ) {
            try {
              await rendition.display(fallbackTarget);
              displayed = true;
            } catch {
              // Fall back to the beginning of the publication.
            }
          }

          if (!displayed) {
            await rendition.display();
          }

          if (session.disposed) {
            return;
          }

          session.displayed = true;
          scheduleResize(session, host);

          const current =
            (await getCurrentEpubLocation(rendition)) ??
            session.currentLocation;
          emitLocation(session, callbacksRef.current, current);
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
    }, [bookId, retryKey]);

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
        className={styles.root}
        style={surfaceStyle}
        aria-label="EPUB 阅读区"
        aria-busy={status === "loading"}
      >
        <div className={styles.stage}>
          <div ref={paperRef} className={styles.paper}>
            <div ref={hostRef} className={styles.viewport} />
          </div>
        </div>

        {status === "loading" ? (
          <div className={styles.statusLayer} role="status" aria-live="polite">
            <div className={styles.statusPanel}>
              <LoaderCircle
                className={`${styles.statusIcon} ${styles.spinner}`}
                aria-hidden="true"
              />
              <p className={styles.statusTitle}>正在打开 EPUB</p>
              <p className={styles.statusMessage}>
                正在解析目录并准备分页排版
              </p>
            </div>
          </div>
        ) : null}

        {status === "error" ? (
          <div className={styles.statusLayer} role="alert">
            <div className={styles.statusPanel}>
              <AlertTriangle
                className={styles.statusIcon}
                aria-hidden="true"
              />
              <p className={styles.statusTitle}>无法打开这本书</p>
              <p className={styles.statusMessage}>
                {errorMessage || "EPUB 文件可能已损坏或暂时不可用"}
              </p>
              <button
                type="button"
                className={styles.retryButton}
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

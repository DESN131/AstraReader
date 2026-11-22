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
  getEpubScrollbarThumbGeometry,
  isEpubLayoutRectWithinColumn,
  readEpubApiError,
  refineEpubEndPercentage,
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

const EPUB_PAGE_GAP = 32;

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
  layoutValidationTimer: number | null;
  layoutRepairKey: string;
  layoutRepairAttempts: number;
  pendingViewportFraction: number | null;
  lastViewportFraction: number;
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
    layoutValidationTimer: null,
    layoutRepairKey: "",
    layoutRepairAttempts: 0,
    pendingViewportFraction: null,
    lastViewportFraction: 0,
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

function getEpubViewportFraction(
  session: EpubReaderSession,
): number | null {
  const scroller = getEpubScroller(session);
  if (!scroller) {
    return null;
  }

  const maxOffset =
    session.readingMode === "scroll"
      ? Math.max(0, scroller.scrollHeight - scroller.clientHeight)
      : Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  const offset =
    session.readingMode === "scroll"
      ? scroller.scrollTop
      : scroller.scrollLeft;

  if (maxOffset <= 1) {
    return 0;
  }

  return Math.min(1, Math.max(0, offset / maxOffset));
}

function restoreEpubViewportFraction(
  session: EpubReaderSession,
  fraction: number,
): boolean {
  const scroller = getEpubScroller(session);
  if (!scroller) {
    return false;
  }

  const clamped = Math.min(1, Math.max(0, fraction));

  if (session.readingMode === "scroll") {
    const maxOffset = Math.max(
      0,
      scroller.scrollHeight - scroller.clientHeight,
    );
    scroller.scrollTop = maxOffset * clamped;
  } else {
    const maxOffset = Math.max(
      0,
      scroller.scrollWidth - scroller.clientWidth,
    );
    scroller.scrollLeft = maxOffset * clamped;
  }

  session.lastViewportFraction = clamped;
  return true;
}

function alignEpubPaginationStep(rendition: Rendition): void {
  type EpubLayoutInternals = {
    __astraPageGutter?: boolean;
    name?: string;
    divisor?: number;
    width?: number;
    height?: number;
    gap?: number;
    columnWidth?: number;
    delta?: number;
    pageWidth?: number;
    spreadWidth?: number;
    calculate: (
      width: number,
      height: number,
      gap?: number,
    ) => void;
    update: (properties: Record<string, number>) => void;
  };
  const manager = (
    rendition as unknown as {
      manager?: {
        layout?: EpubLayoutInternals;
        updateLayout?: () => void;
      };
    }
  ).manager;
  const layout = manager?.layout;

  if (
    !layout ||
    layout.__astraPageGutter ||
    typeof layout.calculate !== "function"
  ) {
    return;
  }

  const originalCalculate = layout.calculate.bind(layout);

  layout.calculate = function calculateWithPageGutter(
    width: number,
    height: number,
    gap?: number,
  ) {
    originalCalculate(width, height, gap);

    if (
      this.name !== "reflowable" ||
      this.divisor !== 1 ||
      typeof this.width !== "number" ||
      typeof this.gap !== "number" ||
      this.gap <= 0
    ) {
      return;
    }

    const columnWidth = Math.max(1, this.width - this.gap);
    this.columnWidth = columnWidth;
    this.delta = this.width;
    this.pageWidth = this.width;
    this.spreadWidth = this.width;
    this.update({
      columnWidth,
      delta: this.delta,
      pageWidth: this.pageWidth,
      spreadWidth: this.spreadWidth,
    });
  };
  layout.__astraPageGutter = true;
  manager?.updateLayout?.();
}

function hasValidEpubPaginationLayout(
  session: EpubReaderSession,
): boolean {
  if (session.readingMode !== "paginated") {
    return true;
  }

  const scroller = getEpubScroller(session);
  const iframe =
    scroller?.querySelector<HTMLIFrameElement>("iframe");
  const doc = iframe?.contentDocument;
  const body = doc?.body;

  if (!scroller || !iframe || !doc || !body) {
    return false;
  }

  const style = iframe.contentWindow?.getComputedStyle(body);
  if (!style) {
    return false;
  }

  const pageWidth = scroller.clientWidth;
  const pageHeight = body.clientHeight;
  const columnWidth = Number.parseFloat(style.columnWidth);
  const columnGap = Number.parseFloat(style.columnGap);
  const paddingLeft = Number.parseFloat(style.paddingLeft);
  const paddingTop = Number.parseFloat(style.paddingTop);
  const paddingBottom = Number.parseFloat(style.paddingBottom);

  if (
    pageWidth <= 0 ||
    pageHeight <= 0 ||
    Math.abs(body.clientWidth - pageWidth) > 1 ||
    Math.abs(columnWidth - (pageWidth - EPUB_PAGE_GAP)) > 1 ||
    Math.abs(columnGap - EPUB_PAGE_GAP) > 1 ||
    Math.abs(
      scroller.scrollWidth / pageWidth -
        Math.round(scroller.scrollWidth / pageWidth),
    ) > 0.01
  ) {
    return false;
  }

  const layout = {
    columnWidth,
    columnGap,
    paddingLeft,
    paddingTop,
    paddingBottom,
    pageWidth,
    pageHeight,
  };
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  let textNode: Node | null;

  while ((textNode = walker.nextNode())) {
    if (!(textNode.textContent || "").trim()) {
      continue;
    }

    const range = doc.createRange();
    range.selectNodeContents(textNode);
    const rects = Array.from(range.getClientRects()).filter(
      (rect) => rect.width > 0 && rect.height > 0,
    );

    for (const rect of rects) {
      if (!isEpubLayoutRectWithinColumn(rect, layout)) {
        return false;
      }
    }
  }

  for (const image of body.querySelectorAll(
    "img, svg image, image, video, canvas",
  )) {
    const rect = image.getBoundingClientRect();
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      !isEpubLayoutRectWithinColumn(rect, layout)
    ) {
      return false;
    }
  }

  return true;
}

function scheduleLayoutValidation(
  session: EpubReaderSession,
  element: HTMLElement,
  callbacks: ReaderCallbacks,
): void {
  if (session.disposed || session.readingMode !== "paginated") {
    return;
  }

  if (session.layoutValidationTimer !== null) {
    window.clearTimeout(session.layoutValidationTimer);
  }

  session.layoutValidationTimer = window.setTimeout(() => {
    session.layoutValidationTimer = null;

    if (
      session.disposed ||
      session.readingMode !== "paginated"
    ) {
      return;
    }

    if (
      !session.displayed ||
      !session.rendition ||
      !session.currentLocation?.start?.cfi
    ) {
      scheduleLayoutValidation(session, element, callbacks);
      return;
    }

    if (hasValidEpubPaginationLayout(session)) {
      session.layoutRepairKey = "";
      session.layoutRepairAttempts = 0;
      return;
    }

    const scroller = getEpubScroller(session);
    const body =
      scroller?.querySelector<HTMLIFrameElement>("iframe")
        ?.contentDocument?.body;
    const bodyStyle = body
      ? body.ownerDocument.defaultView?.getComputedStyle(body)
      : null;
    const repairKey = [
      session.currentLocation.start.cfi,
      scroller?.clientWidth ?? 0,
      scroller?.clientHeight ?? 0,
      bodyStyle?.columnWidth ?? "",
      bodyStyle?.lineHeight ?? "",
    ].join("|");

    if (repairKey !== session.layoutRepairKey) {
      session.layoutRepairKey = repairKey;
      session.layoutRepairAttempts = 0;
    }

    if (session.layoutRepairAttempts >= 2) {
      callbacks.onError(
        new Error(
          "EPUB 分栏完整性校验失败，请调整字号或重新打开图书",
        ),
      );
      return;
    }

    session.layoutRepairAttempts += 1;
    console.warn("[AstraReader] EPUB layout guard rebuilding columns");
    scheduleThemeReflow(session, element, callbacks);
  }, 80);
}

function attachLayoutResourceGuard(
  session: EpubReaderSession,
  element: HTMLElement,
  contents: Contents,
  callbacks: ReaderCallbacks,
): void {
  if (session.readingMode !== "paginated") {
    return;
  }

  const doc = contents.document;
  const waits: Array<Promise<unknown>> = [];
  const fonts = (
    doc as Document & { fonts?: { ready?: Promise<unknown> } }
  ).fonts;

  if (fonts?.ready) {
    waits.push(fonts.ready.catch(() => undefined));
  }

  for (const image of doc.querySelectorAll(
    "img, svg image, image, video, canvas",
  )) {
    if (!("complete" in image) || image.complete !== false) {
      continue;
    }

    waits.push(
      new Promise<void>((resolve) => {
        const finish = () => resolve();
        image.addEventListener("load", finish, { once: true });
        image.addEventListener("error", finish, { once: true });
      }),
    );
  }

  if (waits.length === 0) {
    scheduleLayoutValidation(session, element, callbacks);
    return;
  }

  void Promise.race([
    Promise.allSettled(waits),
    new Promise((resolve) => {
      window.setTimeout(resolve, 4_000);
    }),
  ]).then(() => {
    if (!session.disposed) {
      scheduleLayoutValidation(session, element, callbacks);
    }
  });
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
  const viewportFraction =
    session.pendingViewportFraction ??
    session.lastViewportFraction;
  session.pendingViewportFraction = null;
  const { width, height } = measureViewport(session.host);
  const resize = rendition.resize as (
    width: number,
    height: number,
    cfi?: string,
  ) => void;

  resize.call(rendition, width, height, location?.start?.cfi);
  alignEpubPaginationStep(rendition);
  await nextFrame();

  if (Math.abs(body.clientWidth - scroller.clientWidth) <= 1) {
    await rendition.reportLocation();
    if (viewportFraction !== null) {
      restoreEpubViewportFraction(session, viewportFraction);
      await nextFrame();
    }
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

  alignEpubPaginationStep(rendition);
  await rendition.reportLocation();
  if (viewportFraction !== null) {
    restoreEpubViewportFraction(session, viewportFraction);
    await nextFrame();
  }
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
  callbacks: ReaderCallbacks,
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
    const viewportFraction =
      session.pendingViewportFraction ??
      session.lastViewportFraction;
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
      alignEpubPaginationStep(session.rendition);
      window.requestAnimationFrame(() => {
        if (session.disposed || !session.rendition) {
          return;
        }
        void session.rendition
          .reportLocation()
          .then(async () => {
            if (viewportFraction !== null) {
              restoreEpubViewportFraction(session, viewportFraction);
              await nextFrame();
            }
          })
          .then(() => {
            scheduleLayoutValidation(
              session,
              element,
              callbacks,
            );
          })
          .catch(() => undefined);
      });
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

  const viewportFraction =
    session.pendingViewportFraction ??
    session.lastViewportFraction;
  session.pendingViewportFraction = null;
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
      alignEpubPaginationStep(rendition);
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

      alignEpubPaginationStep(rendition);
      await rendition.reportLocation();
      const current = await getCurrentEpubLocation(rendition);
      if (viewportFraction !== null) {
        restoreEpubViewportFraction(session, viewportFraction);
        await nextFrame();
      }
      emitLocation(session, callbacks, current);
    });
  } finally {
    session.reflowing = false;
    scheduleLayoutValidation(session, element, callbacks);

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

  const scroller = getEpubScroller(session);
  const spineLength = Number(
    (session.book.spine as unknown as { length?: number }).length ?? 0,
  );
  const spineIndex = Number(location.start.index ?? -1);
  const maxOffset = scroller
    ? session.readingMode === "scroll"
      ? Math.max(
          0,
          scroller.scrollHeight - scroller.clientHeight,
        )
      : Math.max(
          0,
          scroller.scrollWidth - scroller.clientWidth,
        )
    : 0;
  const offset = scroller
    ? session.readingMode === "scroll"
      ? scroller.scrollTop
      : scroller.scrollLeft
    : 0;
  const percentage = refineEpubEndPercentage({
    basePercentage: getEpubPercentage(session.book, location),
    spineIndex,
    spineLength,
    offset,
    maxOffset,
  });
  session.lastViewportFraction =
    maxOffset > 1
      ? Math.min(1, Math.max(0, offset / maxOffset))
      : 0;
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

  alignEpubPaginationStep(session.rendition);

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
    const scrollbarRef = useRef<HTMLDivElement>(null);
    const scrollbarThumbRef = useRef<HTMLDivElement>(null);
    const preservedViewportFractionRef = useRef<number | null>(null);
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
    const initialProgressPercentage = book.progress?.percentage ?? 0;
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

      session.pendingViewportFraction ??=
        getEpubViewportFraction(session);
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
          if (readyBookRef.current !== bookId) {
            preservedViewportFractionRef.current = null;
          }
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
            gap: readingMode === "paginated" ? EPUB_PAGE_GAP : 0,
            allowScriptedContent: false,
            allowPopups: false,
            resizeOnOrientationChange: true,
          } as Parameters<Book["renderTo"]>[1] & {
            allowPopups: boolean;
            gap: number;
          });

          session.rendition = rendition;
          await rendition.started;
          alignEpubPaginationStep(rendition);

          if (session.disposed) {
            return;
          }

          applyTheme(rendition, settingsRef.current);
          rendition.hooks.content.register(hardenEpubContents);
          const attachLayoutGuard = (contents: Contents) => {
            attachLayoutResourceGuard(
              session,
              host,
              contents,
              callbacksRef.current,
            );
          };
          rendition.hooks.content.register(attachLayoutGuard);

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
            rendition.hooks.content.deregister(attachLayoutGuard);
          };

          session.resizeObserver = new ResizeObserver(() => {
            scheduleResize(
              session,
              host,
              callbacksRef.current,
            );
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
          alignEpubPaginationStep(rendition);
          await rendition.reportLocation();
          await nextFrame();

          let current =
            (await getCurrentEpubLocation(rendition)) ??
            session.currentLocation;
          const scroller = getEpubScroller(session);

          if (
            current &&
            scroller &&
            readyBookRef.current !== bookId &&
            initialProgressPercentage >= 0.999
          ) {
            if (readingMode === "scroll") {
              scroller.scrollTop = Math.max(
                0,
                scroller.scrollHeight - scroller.clientHeight,
              );
            } else {
              scroller.scrollLeft = Math.max(
                0,
                scroller.scrollWidth - scroller.clientWidth,
              );
            }

            await nextFrame();
            await rendition.reportLocation();
            current =
              (await getCurrentEpubLocation(rendition)) ??
              current;
            preservedViewportFractionRef.current = null;
            session.lastViewportFraction = 1;
          } else if (
            current &&
            scroller &&
            preservedViewportFractionRef.current !== null
          ) {
            restoreEpubViewportFraction(
              session,
              preservedViewportFractionRef.current,
            );
            preservedViewportFractionRef.current = null;
            await nextFrame();
            await rendition.reportLocation();
            current =
              (await getCurrentEpubLocation(rendition)) ??
              current;
          }

          const viewportScroller = getEpubScroller(session);
          const handleViewportScroll = () => {
            const fraction = getEpubViewportFraction(session);
            if (fraction !== null) {
              session.lastViewportFraction = fraction;
            }
          };
          viewportScroller?.addEventListener(
            "scroll",
            handleViewportScroll,
            { passive: true },
          );
          const detachBeforeViewportTracking =
            session.detachListeners;
          session.detachListeners = () => {
            detachBeforeViewportTracking?.();
            viewportScroller?.removeEventListener(
              "scroll",
              handleViewportScroll,
            );
          };

          emitLocation(session, callbacksRef.current, current);
          scheduleResize(
            session,
            host,
            callbacksRef.current,
          );
          scheduleLayoutValidation(
            session,
            host,
            callbacksRef.current,
          );
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
        const preservedFraction = session.lastViewportFraction;

        if (preservedLocation) {
          initialLocationRef.current = preservedLocation;
        }
        preservedViewportFractionRef.current = preservedFraction;

        session.disposed = true;
        controller.abort();

        if (session.resizeFrame !== null) {
          cancelAnimationFrame(session.resizeFrame);
        }

        if (session.reflowTimer !== null) {
          window.clearTimeout(session.reflowTimer);
        }

        if (session.layoutValidationTimer !== null) {
          window.clearTimeout(session.layoutValidationTimer);
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
    }, [
      bookId,
      initialProgressPercentage,
      readingMode,
      retryKey,
    ]);

    useEffect(() => {
      if (readingMode !== "scroll" || status !== "ready") {
        return;
      }

      const host = hostRef.current;
      const rail = scrollbarRef.current;
      const thumb = scrollbarThumbRef.current;

      if (!host || !rail || !thumb) {
        return;
      }

      const hostElement = host;
      const railElement = rail;
      const thumbElement = thumb;
      let scroller: HTMLElement | null = null;
      let animationFrame = 0;
      let drag:
        | {
            pointerId: number;
            startY: number;
            startScrollTop: number;
          }
        | null = null;

      function getScroller(): HTMLElement | null {
        return hostElement.querySelector<HTMLElement>(".epub-container");
      }

      function updateScrollbar(): void {
        animationFrame = 0;
        const current = getScroller();

        if (current !== scroller) {
          scroller?.removeEventListener("scroll", scheduleScrollbarUpdate);
          scroller = current;
          scroller?.addEventListener("scroll", scheduleScrollbarUpdate, {
            passive: true,
          });
        }

        if (!scroller) {
          railElement.dataset.visible = "false";
          return;
        }

        const geometry = getEpubScrollbarThumbGeometry({
          scrollTop: scroller.scrollTop,
          scrollHeight: scroller.scrollHeight,
          clientHeight: scroller.clientHeight,
          trackHeight: railElement.clientHeight,
        });

        railElement.dataset.visible = String(geometry.visible);
        thumbElement.style.height = `${geometry.thumbHeight}px`;
        thumbElement.style.transform = `translateY(${geometry.thumbTop}px)`;
      }

      function scheduleScrollbarUpdate(): void {
        if (!animationFrame) {
          animationFrame = window.requestAnimationFrame(updateScrollbar);
        }
      }

      function setScrollFromPointer(clientY: number): void {
        if (!scroller) {
          return;
        }

        const maxScrollTop = Math.max(
          0,
          scroller.scrollHeight - scroller.clientHeight,
        );
        const railRect = railElement.getBoundingClientRect();
        const travel = railRect.height - thumbElement.offsetHeight;

        if (maxScrollTop <= 0 || travel <= 0) {
          return;
        }

        const targetTop = Math.min(
          travel,
          Math.max(
            0,
            clientY - railRect.top - thumbElement.offsetHeight / 2,
          ),
        );
        scroller.scrollTop = (targetTop / travel) * maxScrollTop;
      }

      function handlePointerDown(event: PointerEvent): void {
        if (event.button !== 0 || !scroller) {
          return;
        }

        const maxScrollTop = Math.max(
          0,
          scroller.scrollHeight - scroller.clientHeight,
        );
        if (maxScrollTop <= 0) {
          return;
        }

        if (event.target === thumbElement) {
          drag = {
            pointerId: event.pointerId,
            startY: event.clientY,
            startScrollTop: scroller.scrollTop,
          };
        } else {
          setScrollFromPointer(event.clientY);
        }

        railElement.setPointerCapture(event.pointerId);
        event.preventDefault();
      }

      function handlePointerMove(event: PointerEvent): void {
        if (
          !drag ||
          !scroller ||
          drag.pointerId !== event.pointerId
        ) {
          return;
        }

        const maxScrollTop = Math.max(
          0,
          scroller.scrollHeight - scroller.clientHeight,
        );
        const travel =
          railElement.clientHeight - thumbElement.offsetHeight;

        if (maxScrollTop <= 0 || travel <= 0) {
          return;
        }

        const delta = event.clientY - drag.startY;
        scroller.scrollTop =
          drag.startScrollTop + (delta / travel) * maxScrollTop;
      }

      function handlePointerEnd(event: PointerEvent): void {
        if (drag?.pointerId === event.pointerId) {
          drag = null;
        }

        if (railElement.hasPointerCapture(event.pointerId)) {
          railElement.releasePointerCapture(event.pointerId);
        }
      }

      function handleWheel(event: WheelEvent): void {
        if (!scroller) {
          return;
        }

        scroller.scrollTop += event.deltaY;
        event.preventDefault();
      }

      const contentObserver =
        typeof ResizeObserver === "function"
          ? new ResizeObserver(scheduleScrollbarUpdate)
          : null;
      const hostObserver =
        typeof ResizeObserver === "function"
          ? new ResizeObserver(() => {
              const view =
                hostElement.querySelector<HTMLElement>(".epub-view");
              if (view) {
                contentObserver?.disconnect();
                contentObserver?.observe(view);
              }
              scheduleScrollbarUpdate();
            })
          : null;
      const mutationObserver =
        typeof MutationObserver === "function"
          ? new MutationObserver(() => {
              const view =
                hostElement.querySelector<HTMLElement>(".epub-view");
              if (view) {
                contentObserver?.disconnect();
                contentObserver?.observe(view);
              }
              scheduleScrollbarUpdate();
            })
          : null;

      railElement.addEventListener("pointerdown", handlePointerDown);
      railElement.addEventListener("pointermove", handlePointerMove);
      railElement.addEventListener("pointerup", handlePointerEnd);
      railElement.addEventListener("pointercancel", handlePointerEnd);
      railElement.addEventListener("wheel", handleWheel, {
        passive: false,
      });
      hostObserver?.observe(hostElement);
      mutationObserver?.observe(hostElement, {
        childList: true,
        subtree: true,
      });
      const initialView =
        hostElement.querySelector<HTMLElement>(".epub-view");
      if (initialView) {
        contentObserver?.observe(initialView);
      }
      updateScrollbar();

      return () => {
        if (animationFrame) {
          window.cancelAnimationFrame(animationFrame);
        }

        scroller?.removeEventListener(
          "scroll",
          scheduleScrollbarUpdate,
        );
        contentObserver?.disconnect();
        hostObserver?.disconnect();
        mutationObserver?.disconnect();
        railElement.removeEventListener("pointerdown", handlePointerDown);
        railElement.removeEventListener("pointermove", handlePointerMove);
        railElement.removeEventListener("pointerup", handlePointerEnd);
        railElement.removeEventListener("pointercancel", handlePointerEnd);
        railElement.removeEventListener("wheel", handleWheel);
      };
    }, [readingMode, status]);

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

              alignEpubPaginationStep(rendition);
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
            {readingMode === "scroll" ? (
              <div
                ref={scrollbarRef}
                className="astra-epub-scrollbar"
                data-visible="false"
                aria-hidden="true"
              >
                <div
                  ref={scrollbarThumbRef}
                  className="astra-epub-scrollbar-thumb"
                />
              </div>
            ) : null}
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

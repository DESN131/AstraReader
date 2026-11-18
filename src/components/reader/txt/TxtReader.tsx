"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ForwardRefExoticComponent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefAttributes,
} from "react";
import { RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  FONT_STACKS,
  resolveReaderTheme,
} from "@/lib/reader/defaults";
import type {
  ReaderHandle,
  ReaderViewProps,
} from "@/lib/reader/types";
import type {
  ReadingLocation,
  SearchResult,
} from "@/shared/types";
import {
  createTxtDocument,
  createTxtLocation,
  findChunkIndex,
  getChapterAtOffset,
  getChapterLabel,
  type TxtChunk,
  type TxtDocumentModel,
} from "@/lib/reader/txt/document";
import { decodeTxtBuffer } from "@/lib/reader/txt/encoding";
import {
  buildRenderBlocks,
  type TxtRenderBlock,
} from "@/lib/reader/txt/render";
import {
  buildNormalizedSearchIndex,
  searchTxtText,
  type NormalizedSearchIndex,
} from "@/lib/reader/txt/search";

import styles from "./TxtReader.module.css";

type ReaderStatus = "loading" | "ready" | "error";

type PendingPage = "last" | number | null;

interface PageMetrics {
  width: number;
  gap: number;
  step: number;
  pageCount: number;
}

interface PointerStart {
  pointerId: number;
  x: number;
  y: number;
  time: number;
}

type CaretRangeDocument = Document & {
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

const DEFAULT_GAP = 48;
const EMPTY_CHUNK: TxtChunk = { index: 0, start: 0, end: 0 };
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function waitForReaderLayout(): Promise<void> {
  await nextFrame();
  await nextFrame();
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function asError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

function readPageMetrics(content: HTMLElement): PageMetrics {
  const width = Math.max(1, content.clientWidth);
  const computedGap = Number.parseFloat(
    getComputedStyle(content).columnGap,
  );
  const gap = Number.isFinite(computedGap) ? computedGap : DEFAULT_GAP;
  const step = Math.max(1, width + gap);
  const pageCount = Math.max(
    1,
    Math.round((content.scrollWidth + gap) / step),
  );

  return { width, gap, step, pageCount };
}

function scrollToPage(
  content: HTMLElement,
  page: number,
  metrics: PageMetrics,
): number {
  const clampedPage = Math.max(
    0,
    Math.min(metrics.pageCount - 1, Math.trunc(page)),
  );
  content.scrollLeft = clampedPage * metrics.step;
  return clampedPage;
}

function sourceAtomFromNode(
  node: Node,
  content: HTMLElement,
): HTMLElement | null {
  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  const atom = element?.closest<HTMLElement>("[data-source-atom]") ?? null;
  return atom && content.contains(atom) ? atom : null;
}

function makeRangeForOffset(
  atom: HTMLElement,
  sourceOffset: number,
): Range | null {
  const textNode = atom.firstChild;
  if (!(textNode instanceof Text)) {
    return null;
  }

  const start = Number(atom.dataset.sourceStart);
  const end = Number(atom.dataset.sourceEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }

  const local = Math.max(
    0,
    Math.min(textNode.length - 1, sourceOffset - start),
  );
  if (textNode.length === 0) {
    return null;
  }

  const range = document.createRange();
  range.setStart(textNode, local);
  range.setEnd(textNode, Math.min(textNode.length, local + 1));
  return range;
}

function pageForSourceOffset(
  content: HTMLElement,
  sourceOffset: number,
  metrics: PageMetrics,
): number {
  const atoms = Array.from(
    content.querySelectorAll<HTMLElement>("[data-source-atom]"),
  );
  if (atoms.length === 0) {
    return 0;
  }

  let matchingAtom = atoms[atoms.length - 1];
  let low = 0;
  let high = atoms.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const atom = atoms[middle];
    const start = Number(atom.dataset.sourceStart);
    const end = Number(atom.dataset.sourceEnd);

    if (sourceOffset < start) {
      high = middle - 1;
    } else if (sourceOffset >= end) {
      low = middle + 1;
    } else {
      matchingAtom = atom;
      break;
    }

    if (low > high) {
      matchingAtom = atoms[Math.min(atoms.length - 1, low)];
    }
  }

  const range = makeRangeForOffset(matchingAtom, sourceOffset);
  if (!range) {
    return 0;
  }

  if (typeof range.getBoundingClientRect !== "function") {
    return 0;
  }

  const atomRect = range.getBoundingClientRect();
  if (atomRect.width === 0 && atomRect.height === 0) {
    return 0;
  }

  const contentRect = content.getBoundingClientRect();
  const x =
    atomRect.left - contentRect.left + content.scrollLeft;
  return Math.max(
    0,
    Math.min(
      metrics.pageCount - 1,
      Math.round(x / metrics.step),
    ),
  );
}

function offsetFromRange(
  range: Range,
  content: HTMLElement,
): number | null {
  const atom = sourceAtomFromNode(range.startContainer, content);
  if (!atom) {
    return null;
  }

  const atomStart = Number(atom.dataset.sourceStart);
  if (!Number.isFinite(atomStart)) {
    return null;
  }

  if (range.startContainer instanceof Text) {
    return atomStart + range.startOffset;
  }

  return atomStart;
}

function firstVisibleAtomOffset(
  content: HTMLElement,
): number | null {
  const contentRect = content.getBoundingClientRect();
  const atoms = content.querySelectorAll<HTMLElement>(
    "[data-source-atom]",
  );
  let best: { top: number; left: number; offset: number } | null = null;

  for (const atom of atoms) {
    const start = Number(atom.dataset.sourceStart);
    const textNode = atom.firstChild;
    if (!Number.isFinite(start) || !(textNode instanceof Text)) {
      continue;
    }
    if (textNode.length === 0) {
      continue;
    }

    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 1);
    if (typeof range.getBoundingClientRect !== "function") {
      continue;
    }
    const rect = range.getBoundingClientRect();

    if (
      rect.bottom <= contentRect.top ||
      rect.top >= contentRect.bottom ||
      rect.right <= contentRect.left ||
      rect.left >= contentRect.right
    ) {
      continue;
    }

    if (
      !best ||
      rect.top < best.top - 1 ||
      (Math.abs(rect.top - best.top) <= 1 && rect.left < best.left)
    ) {
      best = { top: rect.top, left: rect.left, offset: start };
    }
  }

  return best?.offset ?? null;
}

function sourceOffsetAtPage(content: HTMLElement): number | null {
  const contentRect = content.getBoundingClientRect();
  const caretDocument = document as CaretRangeDocument;
  const xPositions = [
    contentRect.left + 8,
    contentRect.left + Math.min(40, contentRect.width * 0.15),
    contentRect.left + contentRect.width * 0.3,
  ];
  const yPositions = [
    contentRect.top + 8,
    contentRect.top + 28,
    contentRect.top + contentRect.height * 0.16,
    contentRect.top + contentRect.height * 0.3,
  ];

  for (const y of yPositions) {
    for (const x of xPositions) {
      const range = caretDocument.caretRangeFromPoint?.(x, y);
      if (range) {
        const offset = offsetFromRange(range, content);
        if (offset !== null) {
          return offset;
        }
      }

      const position = caretDocument.caretPositionFromPoint?.(x, y);
      if (position) {
        const pointRange = document.createRange();
        pointRange.setStart(position.offsetNode, position.offset);
        pointRange.collapse(true);
        const offset = offsetFromRange(pointRange, content);
        if (offset !== null) {
          return offset;
        }
      }
    }
  }

  return firstVisibleAtomOffset(content);
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(
      "input, textarea, select, button, a, [contenteditable='true'], [role='textbox']",
    ),
  );
}

function RenderBlock({
  block,
}: {
  block: TxtRenderBlock;
}) {
  const hasSourceIndent =
    block.kind === "paragraph" &&
    /^[\t \u3000]/u.test(block.atoms[0]?.text ?? "");

  return (
    <div
      className={
        block.kind === "heading"
          ? styles.heading
          : cn(
              styles.paragraph,
              hasSourceIndent && styles.sourceIndented,
            )
      }
    >
      {block.atoms.map((atom, index) => (
        <span key={`${atom.start}-${atom.end}`}>
          {index > 0 ? " " : null}
          <span
            data-source-atom
            data-source-start={atom.start}
            data-source-end={atom.end}
          >
            {atom.text}
          </span>
        </span>
      ))}
    </div>
  );
}

const TxtReaderImplementation = forwardRef<
  ReaderHandle,
  ReaderViewProps
>(function TxtReader(props, ref) {
  const {
    book,
    initialLocation,
    settings,
    onRelocated,
    onReady,
    onError,
  } = props;
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<TxtDocumentModel | null>(null);
  const activeChunkIndexRef = useRef(0);
  const pageRef = useRef(0);
  const pageCountRef = useRef(1);
  const currentOffsetRef = useRef(0);
  const pendingPageRef = useRef<PendingPage>(null);
  const lastLocationRef = useRef<ReadingLocation | null>(null);
  const lastRelocationKeyRef = useRef("");
  const searchIndexRef = useRef<{
    source: string;
    index: NormalizedSearchIndex;
  } | null>(null);
  const operationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const reflowFrameRef = useRef<number | null>(null);
  const pageAnimationRef = useRef<Animation | null>(null);
  const pointerStartRef = useRef<PointerStart | null>(null);
  const loadVersionRef = useRef(0);
  const latestPropsRef = useRef({
    initialLocation,
    settings,
  });

  const [status, setStatus] = useState<ReaderStatus>("loading");
  const [model, setModel] = useState<TxtDocumentModel | null>(null);
  const [activeChunkIndex, setActiveChunkIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  const callbacksRef = useRef({ onRelocated, onReady, onError });

  useEffect(() => {
    latestPropsRef.current = { initialLocation, settings };
    callbacksRef.current = { onRelocated, onReady, onError };
    activeChunkIndexRef.current = activeChunkIndex;
  }, [
    activeChunkIndex,
    initialLocation,
    onError,
    onReady,
    onRelocated,
    settings,
  ]);

  const reportError = useCallback((error: unknown) => {
    callbacksRef.current.onError(asError(error));
  }, []);

  const enqueueOperation = useCallback(
    <T,>(operation: () => Promise<T>): Promise<T> => {
      const result = operationQueueRef.current.then(operation, operation);
      operationQueueRef.current = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    [],
  );

  const notifyLocation = useCallback((force = false) => {
    const activeModel = modelRef.current;
    const content = contentRef.current;
    if (!activeModel || !content) {
      return;
    }

    const mappedOffset = sourceOffsetAtPage(content);
    const offset = Math.max(
      0,
      Math.min(
        Math.max(0, activeModel.text.length - 1),
        mappedOffset ?? currentOffsetRef.current,
      ),
    );
    const chapterLabel = getChapterLabel(activeModel.chapters, offset);
    const chapterId = getChapterAtOffset(
      activeModel.chapters,
      offset,
    )?.id;
    const atDocumentEnd =
      activeChunkIndexRef.current === activeModel.chunks.length - 1 &&
      pageRef.current === pageCountRef.current - 1;
    const percentage =
      activeModel.text.length === 0 || atDocumentEnd
        ? 1
        : Math.min(1, offset / activeModel.text.length);
    const location = createTxtLocation(offset, chapterId);
    const key = `${activeChunkIndexRef.current}:${pageRef.current}:${percentage.toFixed(3)}:${chapterLabel}`;

    currentOffsetRef.current = offset;
    lastLocationRef.current = location;

    if (!force && key === lastRelocationKeyRef.current) {
      return;
    }

    lastRelocationKeyRef.current = key;
    callbacksRef.current.onRelocated(location, percentage, chapterLabel);
  }, []);

  const restoreOffset = useCallback(
    (offset: number, forceNotify = false) => {
      const content = contentRef.current;
      if (!content) {
        return;
      }

      const metrics = readPageMetrics(content);
      const page = pageForSourceOffset(content, offset, metrics);
      pageCountRef.current = metrics.pageCount;
      pageRef.current = scrollToPage(content, page, metrics);
      currentOffsetRef.current = offset;
      notifyLocation(forceNotify);
    },
    [notifyLocation],
  );

  const restorePendingPage = useCallback(
    (pendingPage: PendingPage) => {
      const content = contentRef.current;
      if (!content) {
        return;
      }

      const metrics = readPageMetrics(content);
      const page =
        pendingPage === "last"
          ? metrics.pageCount - 1
          : pendingPage ?? 0;
      pageCountRef.current = metrics.pageCount;
      pageRef.current = scrollToPage(content, page, metrics);
      notifyLocation();
    },
    [notifyLocation],
  );

  const restoreCurrentPosition = useCallback(() => {
    restoreOffset(currentOffsetRef.current);
  }, [restoreOffset]);

  const scheduleReflow = useCallback(() => {
    if (reflowFrameRef.current !== null) {
      cancelAnimationFrame(reflowFrameRef.current);
    }

    reflowFrameRef.current = requestAnimationFrame(() => {
      reflowFrameRef.current = null;
      restoreCurrentPosition();
    });
  }, [restoreCurrentPosition]);

  const triggerTurnAnimation = useCallback((direction: 1 | -1) => {
    const viewport = viewportRef.current;
    const animation = latestPropsRef.current.settings.animation;
    if (
      !viewport ||
      animation === "none" ||
      typeof viewport.animate !== "function" ||
      window.matchMedia(REDUCED_MOTION_QUERY).matches
    ) {
      return;
    }

    pageAnimationRef.current?.cancel();
    const frames: Keyframe[] =
      animation === "fade"
        ? [
            { opacity: 0.65 },
            { opacity: 1 },
          ]
        : [
            {
              opacity: 0.72,
              transform: `translateX(${direction > 0 ? 16 : -16}px)`,
            },
            { opacity: 1, transform: "translateX(0)" },
          ];

    pageAnimationRef.current = viewport.animate(frames, {
      duration: 180,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    });
  }, []);

  useEffect(() => {
    const version = loadVersionRef.current + 1;
    loadVersionRef.current = version;
    const controller = new AbortController();

    const load = async () => {
      setStatus("loading");
      setErrorMessage("");
      setModel(null);
      setActiveChunkIndex(0);
      modelRef.current = null;
      activeChunkIndexRef.current = 0;
      pageRef.current = 0;
      pageCountRef.current = 1;
      currentOffsetRef.current = 0;
      pendingPageRef.current = null;
      lastLocationRef.current = null;
      lastRelocationKeyRef.current = "";
      searchIndexRef.current = null;

      try {
        const response = await fetch(
          `/api/books/${encodeURIComponent(book.id)}/file`,
          {
            signal: controller.signal,
            cache: "no-store",
          },
        );

        if (!response.ok) {
          throw new Error(
            `无法读取文本文件（HTTP ${response.status}）`,
          );
        }

        const buffer = await response.arrayBuffer();
        if (controller.signal.aborted || version !== loadVersionRef.current) {
          return;
        }

        const decoded = decodeTxtBuffer(buffer, book.textEncoding);
        if (controller.signal.aborted || version !== loadVersionRef.current) {
          return;
        }

        const parsed = createTxtDocument(decoded.text);
        const requested = latestPropsRef.current.initialLocation;
        const requestedOffset =
          requested?.kind === "txt-offset" ? requested.offset : 0;
        const offset = Math.max(
          0,
          Math.min(
            Math.max(0, parsed.text.length - 1),
            requestedOffset,
          ),
        );
        const targetChunk = findChunkIndex(parsed.chunks, offset);

        modelRef.current = parsed;
        currentOffsetRef.current = offset;
        activeChunkIndexRef.current = targetChunk;
        setModel(parsed);
        setActiveChunkIndex(targetChunk);
        setStatus("ready");
        callbacksRef.current.onReady(parsed.toc);
      } catch (error) {
        if (
          controller.signal.aborted ||
          version !== loadVersionRef.current ||
          isAbortError(error)
        ) {
          return;
        }

        const normalized = asError(error);
        setErrorMessage(normalized.message);
        setStatus("error");
        callbacksRef.current.onError(normalized);
      }
    };

    void load();

    return () => {
      controller.abort();
    };
  }, [book.id, book.textEncoding, loadAttempt]);

  useLayoutEffect(() => {
    if (status !== "ready" || !model) {
      return;
    }

    const pendingPage = pendingPageRef.current;
    pendingPageRef.current = null;

    if (pendingPage !== null) {
      restorePendingPage(pendingPage);
    } else {
      restoreOffset(currentOffsetRef.current);
    }
  }, [
    activeChunkIndex,
    model,
    restoreOffset,
    restorePendingPage,
    settings.contentWidth,
    settings.fontFamily,
    settings.fontSize,
    settings.lineHeight,
    settings.paragraphSpacing,
    settings.textAlign,
    status,
  ]);

  useEffect(() => {
    if (status !== "ready" || !model) {
      return;
    }

    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) {
        restoreCurrentPosition();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [model, restoreCurrentPosition, status]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (
      status !== "ready" ||
      !viewport ||
      typeof ResizeObserver === "undefined"
    ) {
      return;
    }

    const observer = new ResizeObserver(() => {
      scheduleReflow();
    });
    observer.observe(viewport);

    return () => {
      observer.disconnect();
    };
  }, [scheduleReflow, status]);

  useEffect(() => {
    return () => {
      if (reflowFrameRef.current !== null) {
        cancelAnimationFrame(reflowFrameRef.current);
      }
      pageAnimationRef.current?.cancel();
      pointerStartRef.current = null;
    };
  }, []);

  const next = useCallback(
    () =>
      enqueueOperation(async () => {
        const activeModel = modelRef.current;
        const content = contentRef.current;
        if (!activeModel || !content) {
          return false;
        }

        const metrics = readPageMetrics(content);
        pageCountRef.current = metrics.pageCount;
        const currentPage = Math.min(
          metrics.pageCount - 1,
          pageRef.current,
        );

        if (currentPage < metrics.pageCount - 1) {
          pageRef.current = scrollToPage(
            content,
            currentPage + 1,
            metrics,
          );
          triggerTurnAnimation(1);
          await nextFrame();
          notifyLocation();
          return true;
        }

        const nextChunkIndex = activeChunkIndexRef.current + 1;
        const nextChunk = activeModel.chunks[nextChunkIndex];
        if (!nextChunk) {
          return false;
        }

        currentOffsetRef.current = nextChunk.start;
        activeChunkIndexRef.current = nextChunkIndex;
        pendingPageRef.current = null;
        setActiveChunkIndex(nextChunkIndex);
        await waitForReaderLayout();
        triggerTurnAnimation(1);
        return true;
      }),
    [enqueueOperation, notifyLocation, triggerTurnAnimation],
  );

  const previous = useCallback(
    () =>
      enqueueOperation(async () => {
        const activeModel = modelRef.current;
        const content = contentRef.current;
        if (!activeModel || !content) {
          return false;
        }

        const metrics = readPageMetrics(content);
        pageCountRef.current = metrics.pageCount;
        const currentPage = Math.max(0, pageRef.current);

        if (currentPage > 0) {
          pageRef.current = scrollToPage(
            content,
            currentPage - 1,
            metrics,
          );
          triggerTurnAnimation(-1);
          await nextFrame();
          notifyLocation();
          return true;
        }

        const previousChunkIndex = activeChunkIndexRef.current - 1;
        const previousChunk = activeModel.chunks[previousChunkIndex];
        if (!previousChunk) {
          return false;
        }

        currentOffsetRef.current = previousChunk.start;
        activeChunkIndexRef.current = previousChunkIndex;
        pendingPageRef.current = "last";
        setActiveChunkIndex(previousChunkIndex);
        await waitForReaderLayout();
        triggerTurnAnimation(-1);
        return true;
      }),
    [enqueueOperation, notifyLocation, triggerTurnAnimation],
  );

  const goTo = useCallback(
    (location: ReadingLocation) =>
      enqueueOperation(async () => {
        const activeModel = modelRef.current;
        if (!activeModel) {
          return;
        }
        if (location.kind !== "txt-offset") {
          throw new Error("TXT 阅读器不能跳转到 EPUB 位置");
        }

        const offset = Math.max(
          0,
          Math.min(
            Math.max(0, activeModel.text.length - 1),
            Math.trunc(location.offset),
          ),
        );
        const targetChunk = findChunkIndex(activeModel.chunks, offset);

        currentOffsetRef.current = offset;
        pendingPageRef.current = null;

        if (targetChunk === activeChunkIndexRef.current) {
          restoreOffset(offset, true);
          return;
        }

        activeChunkIndexRef.current = targetChunk;
        setActiveChunkIndex(targetChunk);
        await waitForReaderLayout();
      }),
    [enqueueOperation, restoreOffset],
  );

  const search = useCallback(
    async (
      query: string,
      signal?: AbortSignal,
    ): Promise<SearchResult[]> => {
      const activeModel = modelRef.current;
      if (!activeModel) {
        return [];
      }
      if (signal?.aborted) {
        const error = new Error("Search aborted");
        error.name = "AbortError";
        throw error;
      }

      let normalizedIndex = searchIndexRef.current;
      if (!normalizedIndex || normalizedIndex.source !== activeModel.text) {
        normalizedIndex = {
          source: activeModel.text,
          index: buildNormalizedSearchIndex(activeModel.text),
        };
        searchIndexRef.current = normalizedIndex;
      }

      return searchTxtText(
        activeModel.text,
        activeModel.chapters,
        activeModel.toc,
        query,
        normalizedIndex.index,
        { signal },
      );
    },
    [],
  );

  const getLocation = useCallback(
    () => lastLocationRef.current,
    [],
  );

  useImperativeHandle(
    ref,
    () => ({
      next,
      previous,
      goTo,
      getLocation,
      search,
    }),
    [getLocation, goTo, next, previous, search],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isInteractiveTarget(event.target)
      ) {
        return;
      }

      const pageDown =
        event.key === "PageDown" ||
        event.key === "ArrowRight" ||
        (event.key === " " && !event.shiftKey);
      const pageUp =
        event.key === "PageUp" ||
        event.key === "ArrowLeft" ||
        (event.key === " " && event.shiftKey);

      if (pageDown) {
        event.preventDefault();
        event.stopPropagation();
        void next().catch(reportError);
        return;
      }

      if (pageUp) {
        event.preventDefault();
        event.stopPropagation();
        void previous().catch(reportError);
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        event.stopPropagation();
        void goTo(createTxtLocation(0)).catch(reportError);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        event.stopPropagation();
        const activeModel = modelRef.current;
        if (activeModel) {
          void goTo(
            createTxtLocation(
              Math.max(0, activeModel.text.length - 1),
            ),
          ).catch(reportError);
        }
      }
    },
    [goTo, next, previous, reportError],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        event.pointerType === "mouse" ||
        !event.isPrimary
      ) {
        return;
      }

      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) {
        pointerStartRef.current = null;
        return;
      }

      pointerStartRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        time: performance.now(),
      };
    },
    [],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse") {
        return;
      }

      // The shell also offers swipe navigation. The reader owns touch events
      // inside the text surface so a text selection never turns the page.
      event.stopPropagation();
      const start = pointerStartRef.current;
      pointerStartRef.current = null;
      if (
        !start ||
        start.pointerId !== event.pointerId
      ) {
        return;
      }

      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) {
        return;
      }

      const elapsed = performance.now() - start.time;
      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;

      if (
        elapsed > 900 ||
        Math.abs(deltaX) < 48 ||
        Math.abs(deltaX) < Math.abs(deltaY) * 1.25
      ) {
        return;
      }

      if (deltaX < 0) {
        void next().catch(reportError);
      } else {
        void previous().catch(reportError);
      }
    },
    [next, previous, reportError],
  );

  const theme = resolveReaderTheme(settings);
  const headingOffsets = useMemo(
    () =>
      new Set(model?.chapters.map((chapter) => chapter.offset) ?? []),
    [model],
  );
  const activeChunk =
    model?.chunks[activeChunkIndex] ??
    model?.chunks[0] ??
    EMPTY_CHUNK;
  const blocks = useMemo(
    () =>
      model
        ? buildRenderBlocks(
            model.text,
            activeChunk.start,
            activeChunk.end,
            headingOffsets,
          )
        : [],
    [activeChunk.end, activeChunk.start, headingOffsets, model],
  );
  const isCjkContent = useMemo(() => {
    const language = book.language.toLowerCase();
    if (
      language.startsWith("zh") ||
      language.startsWith("ja") ||
      language.startsWith("ko")
    ) {
      return true;
    }

    return /[\u3400-\u9fff\u3040-\u30ff]/u.test(
      model?.text.slice(0, 12_000) ?? "",
    );
  }, [book.language, model]);
  const readerVariables = {
    "--txt-background": theme.background,
    "--txt-foreground": theme.foreground,
    "--txt-muted": theme.muted,
    "--txt-border": theme.border,
    "--txt-font-family": FONT_STACKS[settings.fontFamily],
    "--txt-font-size": `${settings.fontSize}px`,
    "--txt-line-height": String(settings.lineHeight),
    "--txt-paragraph-spacing": `${settings.paragraphSpacing}em`,
    "--txt-content-width": `${settings.contentWidth}px`,
    "--txt-text-align": settings.textAlign,
    "--txt-column-gap": `${DEFAULT_GAP}px`,
  } as CSSProperties;

  return (
    <div className={styles.root} style={readerVariables}>
      <div className={styles.stage}>
        {status === "loading" ? (
          <div className={styles.state} role="status">
            <span className={styles.spinner} aria-hidden="true" />
            <span>正在载入文本</span>
          </div>
        ) : null}

        {status === "error" ? (
          <div className={styles.state} role="alert">
            <p className={styles.errorMessage}>
              {errorMessage || "文本载入失败"}
            </p>
            <button
              className={styles.retryButton}
              type="button"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            >
              <RefreshCw size={15} aria-hidden="true" />
              重试
            </button>
          </div>
        ) : null}

        {status === "ready" && model ? (
          <div
            ref={viewportRef}
            className={styles.viewport}
            role="region"
            aria-label={`${book.title} 阅读区`}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => {
              pointerStartRef.current = null;
            }}
          >
            <div
              ref={contentRef}
              className={cn(
                styles.content,
                isCjkContent && styles.cjkContent,
              )}
              style={{ columnWidth: `${settings.contentWidth}px` }}
            >
              {blocks.map((block) => (
                <RenderBlock
                  key={`${block.start}-${block.kind}`}
                  block={block}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
});

TxtReaderImplementation.displayName = "TxtReader";

export const TxtReader: ForwardRefExoticComponent<
  ReaderViewProps & RefAttributes<ReaderHandle>
> = TxtReaderImplementation;

export default TxtReader;

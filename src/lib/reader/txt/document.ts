import type {
  ReadingLocation,
  TocItem,
} from "@/shared/types";

export interface TxtChapter {
  id: string;
  label: string;
  offset: number;
}

export interface TxtChunk {
  index: number;
  start: number;
  end: number;
}

export interface TxtDocumentModel {
  text: string;
  chapters: TxtChapter[];
  toc: TocItem[];
  chunks: TxtChunk[];
}

const CHINESE_NUMBER = "零〇一二三四五六七八九十百千万两壹贰叁肆伍陆柒捌玖拾佰仟";
const ENGLISH_NUMBER =
  "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty";

const CHINESE_CHAPTER = new RegExp(
  `^第\\s*[${CHINESE_NUMBER}\\d]{1,16}\\s*[章节回卷部篇集]\\s*(?:[：:、.．\\-—]\\s*)?(?:\\S.*)?$`,
  "u",
);
const CHINESE_SPECIAL_CHAPTER =
  /^(?:序章|序言|自序|前言|引子|楔子|后记|尾声|终章|番外(?:篇)?|附录|目录)(?:\s*[：:、.．\-—]\s*|\s+).*$|^(?:序章|序言|自序|前言|引子|楔子|后记|尾声|终章|番外(?:篇)?|附录|目录)$/u;
const CHINESE_NUMBERED_HEADING =
  new RegExp(`^[${CHINESE_NUMBER}]{1,6}\\s*[、.．]\\s*\\S.{0,60}$`, "u");
const ENGLISH_CHAPTER = new RegExp(
  `^(?:chapter|chap\\.?|part|book|volume|vol\\.?)\\s+(?:\\d{1,4}|[ivxlcdm]{1,12}|${ENGLISH_NUMBER})\\b(?:\\s*[:.\\-—]?\\s*.*)?$`,
  "iu",
);
const ENGLISH_WORD_NUMBER_CHAPTER = new RegExp(
  `^(?:chapter|chap\\.?|part|book|volume|vol\\.?)\\s+(${ENGLISH_NUMBER})(\\b.*)$`,
  "iu",
);
const ENGLISH_SPECIAL_CHAPTER =
  /^(?:prologue|epilogue|foreword|preface|introduction|afterword|appendix)(?:\s*[:.\-—]\s*.*|\s+.*)?$/iu;

export function isChapterHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 100) {
    return false;
  }

  const wordNumberMatch = trimmed.match(ENGLISH_WORD_NUMBER_CHAPTER);
  if (wordNumberMatch) {
    const suffix = wordNumberMatch[2].trim();
    if (
      suffix &&
      !/^[:.\-—]/u.test(suffix) &&
      /^[a-z]/u.test(suffix)
    ) {
      return false;
    }
  }

  return (
    CHINESE_CHAPTER.test(trimmed) ||
    CHINESE_SPECIAL_CHAPTER.test(trimmed) ||
    CHINESE_NUMBERED_HEADING.test(trimmed) ||
    ENGLISH_CHAPTER.test(trimmed) ||
    ENGLISH_SPECIAL_CHAPTER.test(trimmed)
  );
}

interface LineSlice {
  start: number;
  end: number;
}

export function forEachLine(
  text: string,
  rangeStart: number,
  rangeEnd: number,
  callback: (line: LineSlice) => void,
): void {
  let position = Math.max(0, rangeStart);
  const end = Math.min(text.length, rangeEnd);

  while (position < end) {
    let contentEnd = position;
    while (
      contentEnd < end &&
      text[contentEnd] !== "\n" &&
      text[contentEnd] !== "\r"
    ) {
      contentEnd += 1;
    }

    callback({ start: position, end: contentEnd });

    if (contentEnd >= end) {
      break;
    }

    if (text[contentEnd] === "\r" && text[contentEnd + 1] === "\n") {
      position = contentEnd + 2;
    } else {
      position = contentEnd + 1;
    }
  }
}

export function findTxtChapters(text: string): TxtChapter[] {
  const chapters: TxtChapter[] = [];

  forEachLine(text, 0, text.length, (line) => {
    const value = text.slice(line.start, line.end);
    if (!isChapterHeading(value)) {
      return;
    }

    const label = value.trim();
    chapters.push({
      id: `txt-chapter-${chapters.length}`,
      label,
      offset: line.start,
    });
  });

  return chapters;
}

function chapterToTocItem(chapter: TxtChapter): TocItem {
  return {
    id: chapter.id,
    label: chapter.label,
    location: {
      kind: "txt-offset",
      offset: chapter.offset,
      chapterId: chapter.id,
    },
    children: [],
  };
}

export function chaptersToToc(chapters: TxtChapter[]): TocItem[] {
  if (chapters.length === 0) {
    return [
      {
        id: "txt-body",
        label: "正文",
        location: {
          kind: "txt-offset",
          offset: 0,
          chapterId: "txt-body",
        },
        children: [],
      },
    ];
  }

  return chapters.map(chapterToTocItem);
}

export function flattenToc(items: TocItem[]): TocItem[] {
  const result: TocItem[] = [];
  const visit = (nodes: TocItem[]) => {
    for (const item of nodes) {
      result.push(item);
      visit(item.children);
    }
  };
  visit(items);
  return result;
}

export function getChapterAtOffset(
  chapters: TxtChapter[],
  offset: number,
): TxtChapter | null {
  if (chapters.length === 0) {
    return null;
  }

  let low = 0;
  let high = chapters.length - 1;
  let match = chapters[0];

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const chapter = chapters[middle];

    if (chapter.offset <= offset) {
      match = chapter;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return match;
}

export function getChapterLabel(
  chapters: TxtChapter[],
  offset: number,
): string {
  return getChapterAtOffset(chapters, offset)?.label ?? "正文";
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

function safeBoundary(text: string, start: number, target: number): number {
  let boundary = Math.min(text.length, Math.max(start + 1, target));
  if (
    boundary < text.length &&
    isLowSurrogate(text.charCodeAt(boundary))
  ) {
    boundary -= 1;
  }
  return boundary;
}

const DEFAULT_CHUNK_SIZE = 40_000;
const CHUNK_BREAK_SEARCH = 4_000;

export function createTextChunks(
  text: string,
  targetSize = DEFAULT_CHUNK_SIZE,
): TxtChunk[] {
  if (!text) {
    return [{ index: 0, start: 0, end: 0 }];
  }

  const chunks: TxtChunk[] = [];
  let start = 0;

  while (start < text.length) {
    const target = Math.min(text.length, start + Math.max(1_000, targetSize));
    let boundary = target;

    if (target < text.length) {
      const searchStart = Math.max(start + 1, target - CHUNK_BREAK_SEARCH);
      const window = text.slice(searchStart, target);
      const paragraphBreak = Math.max(
        window.lastIndexOf("\n\n"),
        window.lastIndexOf("\r\n\r\n"),
        window.lastIndexOf("\r\r"),
      );
      const lineBreak = Math.max(
        window.lastIndexOf("\n"),
        window.lastIndexOf("\r"),
      );

      if (paragraphBreak >= 0) {
        boundary = searchStart + paragraphBreak + 1;
      } else if (lineBreak >= 0) {
        boundary = searchStart + lineBreak + 1;
      } else {
        const forwardWindow = text.slice(
          target,
          Math.min(text.length, target + CHUNK_BREAK_SEARCH),
        );
        const forwardBreak = forwardWindow.search(/\r\n|\r|\n/);
        boundary =
          forwardBreak >= 0 ? target + forwardBreak + 1 : target;
      }
    }

    boundary = Math.max(start + 1, safeBoundary(text, start, boundary));
    chunks.push({ index: chunks.length, start, end: boundary });
    start = boundary;
  }

  if (chunks.length === 0) {
    chunks.push({ index: 0, start: 0, end: text.length });
  }

  return chunks;
}

export function findChunkIndex(chunks: TxtChunk[], offset: number): number {
  if (chunks.length <= 1) {
    return 0;
  }

  const clampedOffset = Math.max(0, offset);
  let low = 0;
  let high = chunks.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const chunk = chunks[middle];

    if (clampedOffset < chunk.start) {
      high = middle - 1;
    } else if (clampedOffset >= chunk.end && middle < chunks.length - 1) {
      low = middle + 1;
    } else {
      return middle;
    }
  }

  return Math.max(0, Math.min(chunks.length - 1, low));
}

export function createTxtDocument(text: string): TxtDocumentModel {
  const chapters = findTxtChapters(text);
  return {
    text,
    chapters,
    toc: chaptersToToc(chapters),
    chunks: createTextChunks(text),
  };
}

export function createTxtLocation(
  offset: number,
  chapterId?: string,
): ReadingLocation {
  return {
    kind: "txt-offset",
    offset,
    chapterId,
  };
}

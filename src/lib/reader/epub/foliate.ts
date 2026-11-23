import type { TocItem } from "@/shared/types";

export type FoliateNavigationDirection = "next" | "previous";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeFoliateTocLabel(
  label: string | Record<string, string> | undefined,
): string {
  if (typeof label === "string") {
    return label.replace(/\s+/g, " ").trim() || "未命名章节";
  }

  if (label) {
    const firstLabel = Object.values(label).find(
      (value) => typeof value === "string" && value.trim(),
    );

    if (firstLabel) {
      return firstLabel.replace(/\s+/g, " ").trim();
    }
  }

  return "未命名章节";
}

export function mapFoliateToc(
  items: FoliateTOCItem[] | undefined,
  parentId = "foliate-toc",
): TocItem[] {
  if (!items?.length) {
    return [];
  }

  return items.map((item, index) => {
    const href = item.href?.trim() || undefined;
    const id = `${parentId}/${item.id ?? href ?? index}`;

    return {
      id,
      label: normalizeFoliateTocLabel(item.label),
      href,
      location: href
        ? {
            kind: "epub-cfi",
            cfi: href,
            href,
          }
        : undefined,
      children: mapFoliateToc(item.subitems, id),
    };
  });
}

export function getFoliateTotalProgress(
  book: FoliateBook,
  sectionIndex: number,
  sectionFraction: number,
): number {
  const sizes = book.sections.map((section) =>
    section.linear !== "no" && Number(section.size) > 0
      ? Number(section.size)
      : 0,
  );
  const totalSize = sizes.reduce((sum, size) => sum + size, 0);
  if (totalSize <= 0) {
    return clamp(sectionFraction, 0, 1);
  }

  const before = sizes
    .slice(0, sectionIndex)
    .reduce((sum, size) => sum + size, 0);

  return clamp(
    (before + clamp(sectionFraction, 0, 1) * sizes[sectionIndex]) /
      totalSize,
    0,
    1,
  );
}

export function formatFoliateSearchExcerpt(
  excerpt: FoliateSearchExcerpt | undefined,
): string {
  const value =
    typeof excerpt === "string"
      ? excerpt
      : excerpt && typeof excerpt === "object"
        ? [excerpt.pre, excerpt.match, excerpt.post].filter(Boolean).join("")
        : "";

  return value.replace(/\s+/g, " ").trim().slice(0, 220);
}

export function getFoliateKeyboardDirection(
  event: KeyboardEvent,
  readingMode: "paginated" | "scroll",
): FoliateNavigationDirection | null {
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return null;
  }

  if (event.key === "ArrowRight" || event.key === "PageDown") {
    return "next";
  }

  if (event.key === "ArrowLeft" || event.key === "PageUp") {
    return "previous";
  }

  if (event.key === "ArrowDown") {
    return readingMode === "scroll" ? "next" : null;
  }

  if (event.key === "ArrowUp") {
    return readingMode === "scroll" ? "previous" : null;
  }

  return null;
}

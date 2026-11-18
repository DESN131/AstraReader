import type { TocItem } from "@/shared/types";

export interface EpubNavigationItem {
  id?: string;
  href?: string;
  label?: string;
  subitems?: EpubNavigationItem[];
}

const FALLBACK_LABEL = "未命名章节";
const FRONT_MATTER_LABEL =
  /^(?:封面|cover|制作信息|版权|copyright|简介|内容简介|内容说明|彩页|插画|插图|目录|contents?|title|书名页|扉页|献词|dedication|鸣谢|acknowledg(?:e)?ments?|quotation)$/iu;
const FRONT_MATTER_FILE =
  /(?:^|\/)(?:cover|title|message|summary|contents?|illus(?:tration)?\d*|quotation|dedication|copyright)(?:[-_.]?\d+)?\.xhtml?$/i;

export function normalizeEpubHref(href: string | null | undefined): string {
  if (!href) {
    return "";
  }

  const path = href.split("#", 1)[0].split("?", 1)[0].replace(/\\/g, "/");

  try {
    return decodeURIComponent(path)
      .replace(/^\.?\//, "")
      .toLowerCase();
  } catch {
    return path.replace(/^\.?\//, "").toLowerCase();
  }
}

export function mapEpubNavigationToToc(
  items: EpubNavigationItem[] | null | undefined,
  parentId = "epub-toc",
): TocItem[] {
  if (!items?.length) {
    return [];
  }

  const usedIds = new Set<string>();

  return items.map((item, index) => {
    const label = item.label?.replace(/\s+/g, " ").trim() || FALLBACK_LABEL;
    const href = item.href?.trim() || undefined;
    const baseId = item.id?.trim() || href || `item-${index}`;
    const rawId = `${parentId}/${baseId}`;
    let id = rawId;
    let suffix = 1;

    while (usedIds.has(id)) {
      id = `${rawId}-${suffix}`;
      suffix += 1;
    }

    usedIds.add(id);

    return {
      id,
      label,
      href,
      location: href
        ? {
            kind: "epub-cfi",
            cfi: href,
            href,
          }
        : undefined,
      children: mapEpubNavigationToToc(item.subitems, id),
    };
  });
}

export function createEpubChapterLabelLookup(
  toc: TocItem[],
): Map<string, string> {
  const labels = new Map<string, string>();

  function visit(items: TocItem[]) {
    for (const item of items) {
      const href =
        item.href ??
        (item.location?.kind === "epub-cfi"
          ? item.location.href
          : undefined);
      const normalized = normalizeEpubHref(href);

      if (normalized && !labels.has(normalized)) {
        labels.set(normalized, item.label);
      }

      visit(item.children);
    }
  }

  visit(toc);
  return labels;
}

export function findEpubChapterLabel(
  labels: Map<string, string>,
  href: string | null | undefined,
): string {
  return labels.get(normalizeEpubHref(href)) ?? "";
}

export function isEpubFrontMatterTarget(
  href: string | null | undefined,
): boolean {
  const normalized = normalizeEpubHref(href);
  return Boolean(normalized && FRONT_MATTER_FILE.test(normalized));
}

export function findFirstEpubReadingTarget(
  items: EpubNavigationItem[] | null | undefined,
): string | null {
  if (!items?.length) {
    return null;
  }

  for (const item of items) {
    const nested = findFirstEpubReadingTarget(item.subitems);
    if (nested) {
      return nested;
    }

    const label = item.label?.replace(/\s+/g, " ").trim() ?? "";
    const href = item.href?.trim() ?? "";
    if (
      href &&
      !FRONT_MATTER_LABEL.test(label) &&
      !isEpubFrontMatterTarget(href)
    ) {
      return href;
    }
  }

  return null;
}

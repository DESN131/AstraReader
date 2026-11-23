interface FoliateTOCItem {
  id?: string | number;
  href?: string;
  label?: string | Record<string, string>;
  subitems?: FoliateTOCItem[];
}

interface FoliateSection {
  id: string;
  cfi?: string;
  linear?: string;
  size?: number;
  load(): Promise<string>;
  unload?(): void;
  createDocument?(): Promise<Document>;
}

interface FoliateBook {
  dir?: "ltr" | "rtl";
  toc?: FoliateTOCItem[];
  sections: FoliateSection[];
  transformTarget?: EventTarget;
  resolveHref?(href: string): {
    index: number;
    anchor: (document: Document) => Node | null;
  } | null;
}

interface FoliateRelocateDetail {
  cfi?: string;
  fraction?: number;
  size?: number;
  index?: number;
  range?: Range;
  section?: {
    current: number;
    total: number;
  };
  tocItem?: FoliateTOCItem | null;
}

interface FoliateLoadDetail {
  doc: Document;
  index: number;
}

interface FoliateRenderer extends HTMLElement {
  page: number;
  pages: number;
  scrolled: boolean;
  start: number;
  end: number;
  viewSize: number;
  render(): void;
  goTo(target: {
    index: number;
    anchor?: number | (() => number);
  }): Promise<void>;
  setStyles(styles: string | [string, string]): void;
  getContents(): Array<{
    index: number;
    doc: Document;
  }>;
}

type FoliateSearchExcerpt =
  | string
  | {
      pre?: string;
      match?: string;
      post?: string;
    };

interface FoliateSearchResult {
  cfi?: string;
  excerpt?: string;
  label?: string;
  progress?: number;
  subitems?: Array<{
    cfi?: string;
    excerpt?: FoliateSearchExcerpt;
  }>;
}

interface FoliateViewElement extends HTMLElement {
  book: FoliateBook;
  renderer: FoliateRenderer;
  lastLocation?: FoliateRelocateDetail;
  open(book: FoliateBook): Promise<void>;
  close(): void;
  goTo(target: string | number | { fraction: number }): Promise<unknown>;
  goToFraction(fraction: number): Promise<void>;
  next(distance?: number): Promise<void>;
  prev(distance?: number): Promise<void>;
  search(options: {
    query: string;
    index?: number;
  }): AsyncGenerator<FoliateSearchResult | "done">;
  clearSearch(): void;
}

declare module "foliate-js/view.js" {
  export function makeBook(file: File | string): Promise<FoliateBook>;

  export class View extends HTMLElement {
    book: FoliateBook;
    renderer: FoliateRenderer;
    lastLocation?: FoliateRelocateDetail;
    open(book: FoliateBook | File | string): Promise<void>;
    close(): void;
    goTo(target: string | number | { fraction: number }): Promise<unknown>;
    goToFraction(fraction: number): Promise<void>;
    next(distance?: number): Promise<void>;
    prev(distance?: number): Promise<void>;
    search(options: {
      query: string;
      index?: number;
    }): AsyncGenerator<FoliateSearchResult | "done">;
    clearSearch(): void;
  }
}

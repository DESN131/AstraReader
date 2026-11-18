import type {
  BookDetails,
  ReadingLocation,
  ReaderSettings,
  SearchResult,
  TocItem,
} from "@/shared/types";

export interface ReaderAdapter {
  load(): Promise<void>;
  next(): Promise<boolean>;
  previous(): Promise<boolean>;
  goTo(location: ReadingLocation): Promise<void>;
  getLocation(): ReadingLocation | null;
  getToc(): TocItem[];
  search(query: string, signal?: AbortSignal): Promise<SearchResult[]>;
  applySettings(settings: ReaderSettings): void;
  destroy(): void;
}

export interface ReaderAdapterCallbacks {
  onRelocated?: (location: ReadingLocation, percentage: number) => void;
  onReady?: (toc: TocItem[]) => void;
  onError?: (error: Error) => void;
}

export interface ReaderHandle {
  next(): Promise<boolean>;
  previous(): Promise<boolean>;
  goTo(location: ReadingLocation): Promise<void>;
  getLocation(): ReadingLocation | null;
  search(query: string, signal?: AbortSignal): Promise<SearchResult[]>;
}

export interface ReaderViewProps {
  book: BookDetails;
  initialLocation: ReadingLocation | null;
  settings: ReaderSettings;
  onRelocated: (
    location: ReadingLocation,
    percentage: number,
    chapterLabel: string,
  ) => void;
  onReady: (toc: TocItem[]) => void;
  onError: (error: Error) => void;
}

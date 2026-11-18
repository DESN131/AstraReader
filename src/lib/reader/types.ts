import type {
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

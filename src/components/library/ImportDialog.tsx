"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  CircleAlert,
  CircleCheck,
  Clock3,
  FileText,
  LoaderCircle,
  Upload,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  useRef,
  useState,
} from "react";

import {
  getBookFormat,
  importBook,
  type ImportStage,
} from "@/lib/import";
import { cn, formatBytes } from "@/lib/utils";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

interface ImportQueueItem {
  id: string;
  file: File;
  stage: ImportStage;
  progress: number;
  error?: string;
}

const STAGE_LABELS: Record<ImportStage, string> = {
  queued: "等待导入",
  hashing: "计算 SHA-256",
  inspecting: "读取元数据",
  "checking-duplicate": "检查重复图书",
  uploading: "上传原文件",
  finalizing: "写入书库",
  done: "导入完成",
  error: "导入失败",
};

function stageIcon(stage: ImportStage) {
  if (stage === "done") {
    return CircleCheck;
  }
  if (stage === "error") {
    return CircleAlert;
  }
  if (
    stage === "hashing" ||
    stage === "inspecting" ||
    stage === "checking-duplicate" ||
    stage === "uploading" ||
    stage === "finalizing"
  ) {
    return LoaderCircle;
  }
  return Clock3;
}

export function ImportDialog({
  open,
  onOpenChange,
  onImported,
}: ImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(0);
  const [items, setItems] = useState<ImportQueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);

  const pendingCount = items.filter(
    (item) => item.stage === "queued" || item.stage === "error",
  ).length;

  const patchItem = (id: string, patch: Partial<ImportQueueItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const addFiles = (files: File[]) => {
    if (importing || files.length === 0) {
      return;
    }

    const additions = files.map((file) => {
      idRef.current += 1;
      const supported = Boolean(getBookFormat(file.name));

      return {
        id: `${Date.now()}-${idRef.current}`,
        file,
        stage: supported ? ("queued" as const) : ("error" as const),
        progress: 0,
        error: supported ? undefined : "仅支持 .txt 和 .epub 文件",
      };
    });

    setItems((current) => [...current, ...additions]);
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  };

  const startImport = async () => {
    const queue = items.filter(
      (item) => item.stage === "queued" || item.stage === "error",
    );
    if (queue.length === 0 || importing) {
      return;
    }

    setImporting(true);

    for (const item of queue) {
      patchItem(item.id, {
        stage: "hashing",
        progress: 0,
        error: undefined,
      });

      try {
        await importBook(item.file, {
          onStage: (stage) => patchItem(item.id, { stage }),
          onUploadProgress: (progress) =>
            patchItem(item.id, { progress }),
        });
        onImported();
      } catch (error) {
        patchItem(item.id, {
          stage: "error",
          error:
            error instanceof Error ? error.message : "导入过程中发生未知错误",
        });
      }
    }

    setImporting(false);
  };

  const clearItems = () => {
    if (!importing) {
      setItems([]);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!importing) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92svh] w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-line bg-surface-raised p-5 shadow-2xl outline-none sm:p-6">
          <div className="pr-10">
            <Dialog.Title className="text-xl font-semibold tracking-tight text-foreground">
              导入图书
            </Dialog.Title>
            <Dialog.Description className="mt-1.5 text-sm leading-6 text-muted">
              支持 TXT 与 EPUB。文件会依次完成解析、查重和上传，不会离开你的设备。
            </Dialog.Description>
          </div>

          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="关闭导入对话框"
              disabled={importing}
              className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </Dialog.Close>

          <div
            onDragEnter={(event) => {
              event.preventDefault();
              if (!importing) {
                setDragging(true);
              }
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                setDragging(false);
              }
            }}
            onDrop={onDrop}
            className={cn(
              "mt-5 rounded-md border border-dashed p-5 transition-colors sm:p-7",
              dragging
                ? "border-accent bg-accent-soft"
                : "border-line bg-background/60",
              importing && "pointer-events-none opacity-60",
            )}
          >
            <div className="flex flex-col items-center text-center">
              <span className="flex size-11 items-center justify-center rounded-md bg-accent-soft text-accent-strong">
                <Upload aria-hidden="true" className="size-5" />
              </span>
              <p className="mt-3 text-sm font-medium text-foreground">
                将 TXT 或 EPUB 文件拖到这里
              </p>
              <p className="mt-1 text-xs leading-5 text-muted">
                可以一次选择多本，将按照列表顺序逐本导入
              </p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="mt-4 rounded-md border border-line bg-surface-raised px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent hover:text-accent-strong"
              >
                选择文件
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".txt,.epub,text/plain,application/epub+zip"
                multiple
                className="sr-only"
                onChange={onFileChange}
              />
            </div>
          </div>

          <div className="mt-5" aria-live="polite">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">
                导入队列
                {items.length > 0 ? (
                  <span className="ml-2 font-normal text-muted">
                    {items.length} 个文件
                  </span>
                ) : null}
              </h3>
              {items.length > 0 ? (
                <button
                  type="button"
                  onClick={clearItems}
                  disabled={importing}
                  className="text-xs text-muted transition-colors hover:text-danger disabled:opacity-40"
                >
                  清除列表
                </button>
              ) : null}
            </div>

            {items.length === 0 ? (
              <p className="mt-3 border-t border-line py-4 text-sm text-muted">
                还没有选择文件。
              </p>
            ) : (
              <ul className="mt-2 max-h-64 divide-y divide-line overflow-y-auto border-y border-line">
                {items.map((item) => {
                  const Icon = stageIcon(item.stage);
                  const spinning =
                    item.stage !== "done" &&
                    item.stage !== "error" &&
                    item.stage !== "queued";

                  return (
                    <li key={item.id} className="py-3">
                      <div className="flex items-start gap-3">
                        <span
                          className={cn(
                            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded bg-background text-muted",
                            item.stage === "done" && "text-accent",
                            item.stage === "error" && "text-danger",
                          )}
                        >
                          <Icon
                            aria-hidden="true"
                            className={cn(
                              "size-4",
                              spinning && "animate-spin",
                            )}
                          />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                            <p className="min-w-0 break-all text-sm font-medium leading-5 text-foreground">
                              {item.file.name}
                            </p>
                            <span className="shrink-0 text-[11px] text-muted">
                              {formatBytes(item.file.size)}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-xs">
                            <FileText
                              aria-hidden="true"
                              className="size-3.5 text-muted"
                            />
                            <span
                              className={cn(
                                "text-muted",
                                item.stage === "error" && "text-danger",
                                item.stage === "done" && "text-accent-strong",
                              )}
                            >
                              {STAGE_LABELS[item.stage]}
                            </span>
                          </div>
                          {item.stage === "uploading" ? (
                            <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
                              <div
                                className="h-full rounded-full bg-accent transition-[width] duration-200"
                                style={{ width: `${item.progress}%` }}
                              />
                            </div>
                          ) : null}
                          {item.error ? (
                            <p className="mt-1.5 break-words text-xs leading-5 text-danger">
                              {item.error}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={importing}
                className="rounded-md border border-line px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-40"
              >
                关闭
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={startImport}
              disabled={pendingCount === 0 || importing}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-accent-strong px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
            >
              {importing ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 animate-spin"
                />
              ) : (
                <Upload aria-hidden="true" className="size-4" />
              )}
              {importing
                ? "正在逐本导入"
                : pendingCount > 0
                  ? `开始导入 ${pendingCount} 本`
                  : "导入完成"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

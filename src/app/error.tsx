"use client";

import { RotateCcw } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-5">
      <div className="w-full max-w-md text-center">
        <p className="mb-2 text-xs font-semibold text-danger">加载失败</p>
        <h1 className="text-2xl font-semibold">页面暂时没有打开</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          {error.message || "请检查本地服务是否仍在运行。"}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-7 inline-flex h-10 items-center gap-2 rounded-base bg-accent px-4 text-sm font-medium text-white hover:bg-accent-strong"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          重试
        </button>
      </div>
    </main>
  );
}

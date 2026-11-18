import { BookOpen, ChevronLeft } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-5">
      <div className="w-full max-w-md text-center">
        <BookOpen className="mx-auto mb-5 size-10 text-accent" aria-hidden="true" />
        <p className="mb-2 text-xs font-semibold text-accent">404</p>
        <h1 className="text-2xl font-semibold">没有找到这本书</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          它可能已经被删除，或者地址不完整。
        </p>
        <Link
          href="/"
          className="mt-7 inline-flex h-10 items-center gap-2 rounded-base bg-accent px-4 text-sm font-medium text-white hover:bg-accent-strong"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          返回书库
        </Link>
      </div>
    </main>
  );
}

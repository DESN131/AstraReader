import { LoaderCircle } from "lucide-react";

export default function Loading() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background">
      <div className="flex items-center gap-2 text-sm text-muted">
        <LoaderCircle className="size-5 animate-spin text-accent" aria-hidden="true" />
        正在整理书架
      </div>
    </div>
  );
}

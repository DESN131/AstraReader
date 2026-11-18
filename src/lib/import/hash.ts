import { EbookImportError } from "@/lib/import/types";

export async function sha256File(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new EbookImportError("当前浏览器不支持安全哈希计算");
  }

  const data = await file.arrayBuffer();
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

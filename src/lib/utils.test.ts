import { describe, expect, it } from "vitest";

import { formatBytes, formatReadingTime } from "@/lib/utils";

describe("formatBytes", () => {
  it("formats small and large files", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1_536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1_024 * 1_024)).toBe("5.0 MB");
  });
});

describe("formatReadingTime", () => {
  it("formats minutes and hours", () => {
    expect(formatReadingTime(30)).toBe("不足 1 分钟");
    expect(formatReadingTime(90)).toBe("1 分钟");
    expect(formatReadingTime(3_900)).toBe("1 小时 5 分钟");
  });
});

import { describe, expect, it } from "vitest";

import {
  decodeTxtBuffer,
  scoreDecodedText,
} from "@/lib/reader/txt/encoding";

function bytes(...values: number[]): ArrayBuffer {
  return Uint8Array.from(values).buffer;
}

function utf16Bytes(text: string, littleEndian: boolean): ArrayBuffer {
  const output = new Uint8Array(text.length * 2);
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    const offset = index * 2;
    if (littleEndian) {
      output[offset] = code & 0xff;
      output[offset + 1] = code >> 8;
    } else {
      output[offset] = code >> 8;
      output[offset + 1] = code & 0xff;
    }
  }
  return output.buffer;
}

describe("decodeTxtBuffer", () => {
  it("strips a UTF-8 BOM and honors it over the stored encoding", () => {
    const buffer = bytes(
      0xef,
      0xbb,
      0xbf,
      ...new TextEncoder().encode("中文 text"),
    );

    expect(decodeTxtBuffer(buffer, "gb18030")).toEqual({
      text: "中文 text",
      encoding: "utf-8",
      hadBom: true,
    });
  });

  it.each([
    [true, "utf-16le"],
    [false, "utf-16be"],
  ] as const)(
    "decodes UTF-16 BOM files as %s/%s",
    (littleEndian, expectedEncoding) => {
      const encoded = utf16Bytes("章节 Chapter", littleEndian);
      const bom = littleEndian
        ? Uint8Array.from([0xff, 0xfe])
        : Uint8Array.from([0xfe, 0xff]);
      const output = new Uint8Array(bom.length + encoded.byteLength);
      output.set(bom);
      output.set(new Uint8Array(encoded), bom.length);

      expect(decodeTxtBuffer(output.buffer, "utf-8")).toEqual({
        text: "章节 Chapter",
        encoding: expectedEncoding,
        hadBom: true,
      });
    },
  );

  it("decodes UTF-8 files without a BOM", () => {
    const text = "Plain UTF-8 中文";
    const buffer = new TextEncoder().encode(text).buffer;

    expect(decodeTxtBuffer(buffer, "utf-8")).toEqual({
      text,
      encoding: "utf-8",
      hadBom: false,
    });
  });

  it("detects BOM-less UTF-16 from its null-byte pattern", () => {
    const buffer = utf16Bytes("A plain UTF-16 file", true);
    const decoded = decodeTxtBuffer(buffer, "utf-8");

    expect(decoded.encoding).toBe("utf-16le");
    expect(decoded.text).toBe("A plain UTF-16 file");
  });

  it("uses GB18030 when invalid UTF-8 bytes decode cleanly there", () => {
    const buffer = bytes(0xd6, 0xd0, 0xce, 0xc4);

    expect(decodeTxtBuffer(buffer, "gb18030")).toEqual({
      text: "中文",
      encoding: "gb18030",
      hadBom: false,
    });
  });

  it("honors declared Big5 when its decoding is the better candidate", () => {
    const buffer = bytes(0xa4, 0xa4, 0xa4, 0xe5);
    const decoded = decodeTxtBuffer(buffer, "big5");

    expect(decoded.encoding).toBe("big5");
    expect(decoded.text).toBe("中文");
  });

  it("returns an empty document for empty input", () => {
    expect(decodeTxtBuffer(new ArrayBuffer(0), "big5")).toEqual({
      text: "",
      encoding: "big5",
      hadBom: false,
    });
  });
});

describe("scoreDecodedText", () => {
  it("penalizes replacement characters and rewards common CJK text", () => {
    expect(scoreDecodedText("我们的人民和国家的未来")).toBeGreaterThan(
      scoreDecodedText("我们���\ufffd\ufffd"),
    );
  });

  it("handles large inputs by sampling", () => {
    const text = `${"chapter text ".repeat(5_000)}我们的国家`;
    expect(Number.isFinite(scoreDecodedText(text))).toBe(true);
  });
});

import type { TextEncoding } from "@/shared/types";

export interface DecodedTxt {
  text: string;
  encoding: TextEncoding;
  hadBom: boolean;
}

interface BomResult {
  encoding: TextEncoding | null;
  length: number;
}

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;
const UTF16_LE_BOM = [0xff, 0xfe] as const;
const UTF16_BE_BOM = [0xfe, 0xff] as const;

const CJK_CHARACTER =
  /[\u2e80-\u2fff\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;
const COMMON_CJK =
  "的一是不了在人有我他这为之大来以个中上们到说国和地也子时道出而要于就下得可你年生自会那后能对着事其里所去行过家十用发天如然作方成者多日都三小军二无同么经法当起与好看学进种将还分此心前面又定见只主没公从";
const COMMON_CJK_SET = new Set(COMMON_CJK);
const BROKEN_TEXT_MARKERS = [
  "\ufffd",
  "锟斤拷",
  "烫烫烫",
  "屯屯屯",
  "Ã",
  "Â",
  "â€",
  "ï»¿",
];

function readBom(bytes: Uint8Array): BomResult {
  if (startsWith(bytes, UTF8_BOM)) {
    return { encoding: "utf-8", length: UTF8_BOM.length };
  }

  if (startsWith(bytes, UTF16_LE_BOM)) {
    return { encoding: "utf-16le", length: UTF16_LE_BOM.length };
  }

  if (startsWith(bytes, UTF16_BE_BOM)) {
    return { encoding: "utf-16be", length: UTF16_BE_BOM.length };
  }

  return { encoding: null, length: 0 };
}

function startsWith(
  bytes: Uint8Array,
  signature: readonly number[],
): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function toUint8Array(input: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }

  return new Uint8Array(
    input.buffer,
    input.byteOffset,
    input.byteLength,
  );
}

function decode(
  bytes: Uint8Array,
  encoding: TextEncoding,
  fatal = false,
): string {
  return new TextDecoder(encoding, { fatal }).decode(bytes);
}

function utf16Endianness(bytes: Uint8Array): TextEncoding | null {
  const sampleLength = Math.min(bytes.length, 8_192);
  if (sampleLength < 4) {
    return null;
  }

  let evenZeros = 0;
  let oddZeros = 0;
  let evenCharacters = 0;
  let oddCharacters = 0;

  for (let index = 0; index < sampleLength; index += 2) {
    if (bytes[index] === 0) {
      evenZeros += 1;
    }
    evenCharacters += 1;

    if (index + 1 < sampleLength) {
      if (bytes[index + 1] === 0) {
        oddZeros += 1;
      }
      oddCharacters += 1;
    }
  }

  const evenRatio = evenZeros / Math.max(1, evenCharacters);
  const oddRatio = oddZeros / Math.max(1, oddCharacters);

  if (oddRatio > 0.25 && oddRatio > evenRatio * 2) {
    return "utf-16le";
  }

  if (evenRatio > 0.25 && evenRatio > oddRatio * 2) {
    return "utf-16be";
  }

  return null;
}

function sampleText(text: string): string[] {
  if (text.length <= 12_000) {
    return [text];
  }

  const sampleSize = 4_000;
  return [
    text.slice(0, sampleSize),
    text.slice(
      Math.max(0, Math.floor(text.length / 2) - sampleSize / 2),
      Math.floor(text.length / 2) + sampleSize / 2,
    ),
    text.slice(-sampleSize),
  ];
}

/**
 * Scores decoded text using script density and common replacement artifacts.
 * It intentionally samples large books so encoding detection remains cheap.
 */
export function scoreDecodedText(text: string): number {
  let score = 0;
  let replacementCount = 0;
  let commonCjkCount = 0;
  let cjkCount = 0;
  const samples = sampleText(text);

  for (const sample of samples) {
    for (const character of sample) {
      const codePoint = character.codePointAt(0) ?? 0;

      if (character === "\ufffd") {
        replacementCount += 1;
        score -= 80;
        continue;
      }

      if (
        (codePoint < 0x20 && character !== "\n" && character !== "\r" && character !== "\t") ||
        (codePoint >= 0x7f && codePoint <= 0x9f)
      ) {
        score -= 20;
        continue;
      }

      if (
        (codePoint >= 0xe000 && codePoint <= 0xf8ff) ||
        (codePoint >= 0xf0000 && codePoint <= 0xffffd)
      ) {
        score -= 8;
        continue;
      }

      if (CJK_CHARACTER.test(character)) {
        cjkCount += 1;
        score += 2;
        if (COMMON_CJK_SET.has(character)) {
          commonCjkCount += 1;
          score += 1;
        }
        continue;
      }

      if (/[\u3000-\u303f\uff00-\uffef]/u.test(character)) {
        score += 1;
      }
    }
  }

  for (const marker of BROKEN_TEXT_MARKERS) {
    if (samples.some((sample) => sample.includes(marker))) {
      score -= marker === "\ufffd" ? replacementCount * 4 : 40;
    }
  }

  if (replacementCount === 0 && (cjkCount > 0 || commonCjkCount > 0)) {
    score += 8;
  }

  return score;
}

function chooseLegacyEncoding(
  bytes: Uint8Array,
  preferred: TextEncoding,
  utf8Text: string | null,
): { text: string; encoding: TextEncoding } {
  const gbText = decode(bytes, "gb18030");
  const big5Text = decode(bytes, "big5");
  const candidates: Array<{
    text: string;
    encoding: TextEncoding;
    preferred: boolean;
  }> = [
    { text: gbText, encoding: "gb18030", preferred: preferred === "gb18030" },
    { text: big5Text, encoding: "big5", preferred: preferred === "big5" },
  ];

  if (utf8Text !== null) {
    candidates.push({
      text: utf8Text,
      encoding: "utf-8",
      preferred: preferred === "utf-8",
    });
  }

  let best = candidates[0];
  let bestScore = scoreDecodedText(best.text) + (best.preferred ? 6 : 0);

  for (const candidate of candidates.slice(1)) {
    const score = scoreDecodedText(candidate.text) + (candidate.preferred ? 6 : 0);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return { text: best.text, encoding: best.encoding };
}

export function decodeTxtBuffer(
  input: ArrayBuffer | ArrayBufferView,
  preferred: TextEncoding = "utf-8",
): DecodedTxt {
  const bytes = toUint8Array(input);
  if (bytes.byteLength === 0) {
    return { text: "", encoding: preferred, hadBom: false };
  }

  const bom = readBom(bytes);
  if (bom.encoding) {
    return {
      text: decode(bytes.subarray(bom.length), bom.encoding),
      encoding: bom.encoding,
      hadBom: true,
    };
  }

  const utf16Guess = utf16Endianness(bytes);
  if (preferred === "utf-16le" || preferred === "utf-16be") {
    const encoding = utf16Guess ?? preferred;
    return {
      text: decode(bytes, encoding),
      encoding,
      hadBom: false,
    };
  }

  if (utf16Guess) {
    return {
      text: decode(bytes, utf16Guess),
      encoding: utf16Guess,
      hadBom: false,
    };
  }

  let utf8Text: string | null = null;
  try {
    utf8Text = decode(bytes, "utf-8", true);
  } catch {
    utf8Text = null;
  }

  if (preferred === "utf-8" && utf8Text !== null) {
    return { text: utf8Text, encoding: "utf-8", hadBom: false };
  }

  if (preferred === "gb18030" || preferred === "big5") {
    const legacy = chooseLegacyEncoding(bytes, preferred, utf8Text);
    return { ...legacy, hadBom: false };
  }

  if (utf8Text !== null) {
    return { text: utf8Text, encoding: "utf-8", hadBom: false };
  }

  const legacy = chooseLegacyEncoding(bytes, preferred, null);
  return { ...legacy, hadBom: false };
}

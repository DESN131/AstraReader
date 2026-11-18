import type { TextEncoding } from "@/shared/types";

const SAMPLE_SIZE = 256 * 1024;
const UTF8_BOM = [0xef, 0xbb, 0xbf];
const UTF16_LE_BOM = [0xff, 0xfe];
const UTF16_BE_BOM = [0xfe, 0xff];

const COMMON_CHINESE =
  "的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政四日那社义事平形相全表间样与关各重新线内数正心反你明看原又么利比或但质气第向道命此变条只没结解问意建月公无系军很情者最立代想已通并提直题党程展五果料象员革位入常文总次品式活设及管特件长求老头基资边流路级少图山统接知较将组见计别她手角期根论运农指几九区强放决西被干做必战先回则任取据处队南给色光门即保治北造百规热领七海口东导器压志世金增争济阶油思术极交受联什认六共权收证改清己美再采转更单风切打白教速花带安场身车例真务具万每目至达走积示议声报斗完类八离华名确才科张信马节话米整空元况今集温传土许步群广石记需段研界拉林律叫且究观越织装影算低持音众书布复容儿须际商非验连断深难近矿千周委素技备半办青省列习响约支般史感劳便团往酸历市克何除消构府称太准精值号率族维划选标写存候毛亲快效斯院查江型眼王按格养易置派层片始却专状育厂京识适属圆包火住调满县局照参红细引听该铁价严龙飞";

function hasPrefix(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

function decode(
  bytes: Uint8Array,
  encoding: TextEncoding | "big5",
  fatal = false,
): string | null {
  try {
    return new TextDecoder(encoding, { fatal }).decode(bytes);
  } catch {
    return null;
  }
}

function countUtf16Nulls(bytes: Uint8Array): {
  even: number;
  odd: number;
} {
  let even = 0;
  let odd = 0;

  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 0) {
      if (index % 2 === 0) {
        even += 1;
      } else {
        odd += 1;
      }
    }
  }

  return { even, odd };
}

function scoreChineseText(text: string): number {
  if (!text) {
    return Number.NEGATIVE_INFINITY;
  }

  const sample = text.slice(0, 12_000);
  let common = 0;
  let han = 0;
  let controls = 0;
  let replacements = 0;

  for (const character of sample) {
    if (COMMON_CHINESE.includes(character)) {
      common += 1;
    }
    if (/[\u3400-\u9fff]/u.test(character)) {
      han += 1;
    }
    if (
      character === "\uFFFD" ||
      (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(character) &&
        character !== "\n" &&
        character !== "\r" &&
        character !== "\t")
    ) {
      if (character === "\uFFFD") {
        replacements += 1;
      } else {
        controls += 1;
      }
    }
  }

  return common * 4 + han - controls * 12 - replacements * 30;
}

export function detectTextEncoding(bytes: Uint8Array): TextEncoding {
  if (hasPrefix(bytes, UTF8_BOM)) {
    return "utf-8";
  }

  if (hasPrefix(bytes, UTF16_LE_BOM)) {
    return "utf-16le";
  }

  if (hasPrefix(bytes, UTF16_BE_BOM)) {
    return "utf-16be";
  }

  const nulls = countUtf16Nulls(bytes);
  if (nulls.odd > bytes.length * 0.12 && nulls.odd > nulls.even * 2) {
    return "utf-16le";
  }
  if (nulls.even > bytes.length * 0.12 && nulls.even > nulls.odd * 2) {
    return "utf-16be";
  }

  if (decode(bytes, "utf-8", true) !== null) {
    return "utf-8";
  }

  const gbText = decode(bytes, "gb18030") ?? "";
  const big5Text = decode(bytes, "big5") ?? "";

  return scoreChineseText(big5Text) > scoreChineseText(gbText)
    ? "big5"
    : "gb18030";
}

export function detectTextLanguage(sample: string): string {
  const visible = sample.slice(0, 8_000);
  const han = (visible.match(/[\u3400-\u9fff]/gu) ?? []).length;
  const latin = (visible.match(/[A-Za-z]/gu) ?? []).length;

  if (han > 20 && han >= latin * 0.15) {
    return "zh";
  }

  return "en";
}

export async function inspectTextFile(file: File): Promise<{
  textEncoding: TextEncoding;
  language: string;
  sample: string;
}> {
  const sampleBuffer = await file.slice(0, SAMPLE_SIZE).arrayBuffer();
  const sampleBytes = new Uint8Array(sampleBuffer);
  const textEncoding = detectTextEncoding(sampleBytes);
  const sample = decode(sampleBytes, textEncoding) ?? "";

  return {
    textEncoding,
    language: detectTextLanguage(sample),
    sample,
  };
}

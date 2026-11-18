import { describe, expect, it } from "vitest";

import { buildRenderBlocks } from "@/lib/reader/txt/render";

describe("buildRenderBlocks", () => {
  it("groups blank-line paragraphs and preserves atom offsets", () => {
    const text = "标题\n\n第一行\n第二行\n\n下一段";
    const headingOffset = 0;
    const blocks = buildRenderBlocks(
      text,
      0,
      text.length,
      new Set([headingOffset]),
    );

    expect(blocks.map((block) => block.kind)).toEqual([
      "heading",
      "paragraph",
      "paragraph",
    ]);

    const allAtoms = blocks.flatMap((block) => block.atoms);
    for (const atom of allAtoms) {
      expect(text.slice(atom.start, atom.end)).toBe(atom.text);
    }
    expect(blocks[1].atoms.map((atom) => atom.text)).toEqual([
      "第一行",
      "第二行",
    ]);
  });

  it("uses each non-empty line as a paragraph when no blank lines exist", () => {
    const text = "第一段\n第二段\n第三段";
    const blocks = buildRenderBlocks(
      text,
      0,
      text.length,
      new Set(),
    );

    expect(blocks).toHaveLength(3);
    expect(blocks[1].atoms[0]).toEqual({
      start: text.indexOf("第二段"),
      end: text.indexOf("第二段") + "第二段".length,
      text: "第二段",
    });
  });
});

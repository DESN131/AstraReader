import { forEachLine } from "@/lib/reader/txt/document";

export interface TxtRenderAtom {
  start: number;
  end: number;
  text: string;
}

export interface TxtRenderBlock {
  start: number;
  end: number;
  kind: "paragraph" | "heading";
  atoms: TxtRenderAtom[];
}

export function buildRenderBlocks(
  text: string,
  chunkStart: number,
  chunkEnd: number,
  headingOffsets: ReadonlySet<number>,
): TxtRenderBlock[] {
  const chunkText = text.slice(chunkStart, chunkEnd);
  const splitEveryLine = !/(?:\r\n|\r|\n)[\t ]*(?:\r\n|\r|\n)/u.test(
    chunkText,
  );
  const blocks: TxtRenderBlock[] = [];
  let currentParagraph: TxtRenderBlock | null = null;

  const flushParagraph = () => {
    if (currentParagraph && currentParagraph.atoms.length > 0) {
      blocks.push(currentParagraph);
    }
    currentParagraph = null;
  };

  forEachLine(text, chunkStart, chunkEnd, (line) => {
    const value = text.slice(line.start, line.end);
    if (!value.trim()) {
      flushParagraph();
      return;
    }

    const atom: TxtRenderAtom = {
      start: line.start,
      end: line.end,
      text: value,
    };

    if (headingOffsets.has(line.start)) {
      flushParagraph();
      blocks.push({
        start: line.start,
        end: line.end,
        kind: "heading",
        atoms: [atom],
      });
      return;
    }

    if (splitEveryLine) {
      blocks.push({
        start: line.start,
        end: line.end,
        kind: "paragraph",
        atoms: [atom],
      });
      return;
    }

    if (!currentParagraph) {
      currentParagraph = {
        start: line.start,
        end: line.end,
        kind: "paragraph",
        atoms: [],
      };
    }

    currentParagraph.atoms.push(atom);
    currentParagraph.end = line.end;
  });

  flushParagraph();
  return blocks;
}

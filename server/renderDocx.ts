import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  FrameAnchorType,
  FrameWrap,
  HeightRule,
  HorizontalPositionRelativeFrom,
  ImageRun,
  LineRuleType,
  OverlapType,
  Packer,
  PageBreak,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableAnchorType,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  TextWrappingType,
  TabStopType,
  UnderlineType,
  VerticalPositionRelativeFrom,
  WidthType,
} from "docx";
import { pagePixels, resolvePageSetup, type PageSetup } from "../shared/pageSetup";
import {
  COLUMN_GAP_PX,
  type ColumnsBlock,
  type RenderRequest,
  type TableBlock,
  type TemplateBlock,
  type TemplatePage,
  type InlineRun,
  type TextAlign,
  type TextBlock,
  type TextList,
} from "../shared/template";

const TWIPS_PER_PX = 15;
const EMU_PER_PX = 9525;
// The editor centers a 1px stroke in a 12px row (Tailwind h-3).
const LINE_ROW_PX = 12;
const LINE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPgF9cCAACJAFEcS6mRAAAAAElFTkSuQmCC",
  "base64",
);
// Editor table rows measure 31px. Top and bottom cell padding is left at 0 because
// LibreOffice adds that padding on top of the row height and reopens the gap.
const TABLE_ROW_PX = 31;
const CELL_PAD_PX = 4;
const GRID_BORDER = { style: BorderStyle.SINGLE, size: 8, color: "000000" };
const TABLE_BORDERS = {
  top: GRID_BORDER,
  bottom: GRID_BORDER,
  left: GRID_BORDER,
  right: GRID_BORDER,
  insideHorizontal: GRID_BORDER,
  insideVertical: GRID_BORDER,
};
const CELL_BORDERS = {
  top: GRID_BORDER,
  bottom: GRID_BORDER,
  left: GRID_BORDER,
  right: GRID_BORDER,
};

export async function renderDocx(request: RenderRequest): Promise<Buffer> {
  const setup = resolvePageSetup(request.template.pageSetup);
  const pixels = pagePixels(setup);
  const portrait = pagePixels({ ...setup, orientation: "portrait" });
  const header = request.template.header ?? [];
  const footer = request.template.footer ?? [];
  const pages = pagesToRender(request.template.pages, header.length + footer.length > 0);
  const children: (Paragraph | Table)[] = [];
  let imageCount = 0;

  pages.forEach((page, pageIndex) => {
    const blocks = [...header, ...page.blocks, ...footer];
    if (blocks.length === 0) {
      children.push(new Paragraph({ spacing: collapsedSpacing(), children: [] }));
    }
    for (const block of blocks) {
      if (block.type === "table") {
        children.push(tableBlock(block));
        continue;
      }
      if (block.type === "columns") {
        children.push(columnsBlock(block));
        continue;
      }
      imageCount += block.type === "image" ? 1 : 0;
      children.push(blockToParagraph(block, imageCount, pixels.width));
    }
    if (pageIndex < pages.length - 1) {
      children.push(new Paragraph({ spacing: collapsedSpacing(), children: [new PageBreak()] }));
    }
  });

  const doc = new Document({
    background: { color: setup.color },
    styles: {
      default: {
        document: {
          paragraph: { spacing: { before: 0, after: 0 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: portrait.width * TWIPS_PER_PX,
              height: portrait.height * TWIPS_PER_PX,
              orientation: setup.orientation === "landscape" ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
            margin: marginTwips(setup),
          },
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}

function pagesToRender(pages: TemplatePage[], keepAll: boolean): TemplatePage[] {
  let lastContent = -1;
  pages.forEach((page, index) => {
    if (page.blocks.length > 0) lastContent = index;
  });
  if (keepAll) return pages.length > 0 ? pages : [{ blocks: [] }];
  if (lastContent < 0) return [{ blocks: [] }];
  return pages.slice(0, lastContent + 1);
}

function marginTwips(setup: PageSetup) {
  return {
    top: Math.round(setup.marginTopIn * 1440),
    bottom: Math.round(setup.marginBottomIn * 1440),
    left: Math.round(setup.marginLeftIn * 1440),
    right: Math.round(setup.marginRightIn * 1440),
    header: 0,
    footer: 0,
    gutter: 0,
  };
}

function collapsedSpacing() {
  return { before: 0, after: 0, line: 20, lineRule: LineRuleType.EXACT };
}

function textSpacing(sizePt: number, lineSpacing: number) {
  return exactLine(sizePt * (96 / 72) * lineSpacing);
}

function exactLine(linePx: number) {
  return { before: 0, after: 0, line: Math.max(1, Math.round(linePx * TWIPS_PER_PX)), lineRule: LineRuleType.EXACT };
}

function editorTextWidth(block: TextBlock, pageWidth: number): number {
  if (block.widthPx) return block.widthPx;
  return Math.min(460, Math.max(160, pageWidth - block.xPx - 24));
}

function variableWidth(value: string, xPx: number, pageWidth: number): number {
  return Math.min(pageWidth - xPx - 16, Math.ceil(value.length * 9.2) + 24);
}

function blockToParagraph(block: Exclude<TemplateBlock, TableBlock | ColumnsBlock>, imageCount: number, pageWidth: number): Paragraph {
  switch (block.type) {
    case "text":
      return textParagraph(block, pageWidth);
    case "variable":
      return new Paragraph({
        frame: placedFrame(block.xPx, block.yPx, variableWidth(block.value, block.xPx, pageWidth)),
        spacing: exactLine(24),
        children: [new TextRun({ text: block.value, font: "Calibri", size: 24 })],
      });
    case "line":
      return new Paragraph({
        spacing: collapsedSpacing(),
        children: [
          new ImageRun({
            type: "png",
            data: LINE_PNG,
            transformation: { width: Math.max(1, block.widthPx), height: 1 },
            floating: {
              horizontalPosition: {
                relative: HorizontalPositionRelativeFrom.PAGE,
                offset: Math.round(block.xPx * EMU_PER_PX),
              },
              verticalPosition: {
                relative: VerticalPositionRelativeFrom.PAGE,
                offset: Math.round((block.yPx + Math.floor((LINE_ROW_PX - 1) / 2)) * EMU_PER_PX),
              },
              allowOverlap: true,
              wrap: { type: TextWrappingType.NONE },
              behindDocument: false,
            },
            altText: { title: "Line", description: "Line", name: `line-${block.xPx}-${block.yPx}` },
          }),
        ],
      });
    case "image":
      return new Paragraph({
        spacing: collapsedSpacing(),
        children: [
          new ImageRun({
            type: block.mime === "image/png" ? "png" : "jpg",
            data: Buffer.from(block.dataBase64, "base64"),
            transformation: {
              width: block.widthPx,
              height: block.heightPx,
            },
            floating: {
              horizontalPosition: {
                relative: HorizontalPositionRelativeFrom.PAGE,
                offset: block.xPx * EMU_PER_PX,
              },
              verticalPosition: {
                relative: VerticalPositionRelativeFrom.PAGE,
                offset: block.yPx * EMU_PER_PX,
              },
              allowOverlap: true,
              wrap: { type: TextWrappingType.NONE },
            },
            altText: {
              title: "Template image",
              description: "Template image",
              name: `template-image-${imageCount}`,
            },
          }),
        ],
      });
    default: {
      const unreachable: never = block;
      throw new Error(`Unknown block ${String(unreachable)}`);
    }
  }
}

const OPEN_BORDER = { style: BorderStyle.NONE, size: 0, color: "auto" };
const OPEN_BORDERS = {
  top: OPEN_BORDER,
  bottom: OPEN_BORDER,
  left: OPEN_BORDER,
  right: OPEN_BORDER,
  insideHorizontal: OPEN_BORDER,
  insideVertical: OPEN_BORDER,
};

function columnsBlock(block: ColumnsBlock): Table {
  const gap = COLUMN_GAP_PX * TWIPS_PER_PX;
  const total = block.widthPx * TWIPS_PER_PX;
  const left = Math.floor((total - gap) / 2);
  const right = total - gap - left;
  const columnPx = Math.floor((block.widthPx - COLUMN_GAP_PX) / 2);
  const [leftText, rightText] = balanceColumns(block.text, columnPx, block.sizePt);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    borders: OPEN_BORDERS,
    columnWidths: [left, gap, right],
    float: {
      absoluteHorizontalPosition: block.xPx * TWIPS_PER_PX,
      absoluteVerticalPosition: block.yPx * TWIPS_PER_PX,
      horizontalAnchor: TableAnchorType.PAGE,
      verticalAnchor: TableAnchorType.PAGE,
      overlap: OverlapType.OVERLAP,
    },
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          columnCell(leftText, left, block),
          new TableCell({
            width: { size: gap, type: WidthType.DXA },
            borders: OPEN_BORDERS,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: [new Paragraph({ spacing: collapsedSpacing(), children: [] })],
          }),
          columnCell(rightText, right, block),
        ],
      }),
    ],
  });
}

function columnCell(text: string, width: number, block: ColumnsBlock): TableCell {
  const lines = text.length > 0 ? text.split("\n") : [""];
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: OPEN_BORDERS,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    verticalAlign: "top",
    children: lines.map(
      (line) =>
        new Paragraph({
          spacing: textSpacing(block.sizePt, block.lineSpacing),
          children: [
            new TextRun({
              text: line,
              font: block.font,
              size: Math.round(block.sizePt * 2),
              color: block.color,
            }),
          ],
        }),
    ),
  });
}

function balanceColumns(text: string, columnPx: number, sizePt: number): [string, string] {
  const breakAt = text.indexOf("\f");
  if (breakAt >= 0) return [text.slice(0, breakAt).replace(/\s+$/, ""), text.slice(breakAt + 1).replace(/^\s+/, "")];
  const trimmed = text.replace(/\s+$/, "");
  if (!trimmed) return ["", ""];
  const chars = Math.max(8, Math.floor(columnPx / (sizePt * (96 / 72) * 0.5)));
  const parts = trimmed.split("\n");
  const heights = parts.map((part) => Math.max(1, Math.ceil(part.length / chars)));
  const total = heights.reduce((sum, count) => sum + count, 0);
  let used = 0;
  let index = 0;
  for (let i = 0; i < heights.length; i++) {
    if (used + heights[i] >= total / 2) {
      const into = Math.max(1, Math.ceil(total / 2) - used);
      index += Math.min(parts[i].length, into * chars);
      break;
    }
    used += heights[i];
    index += parts[i].length + 1;
  }
  const space = trimmed.lastIndexOf(" ", index);
  const newline = trimmed.lastIndexOf("\n", index);
  const snap = Math.max(space, newline);
  const cut = snap > index * 0.55 ? snap : index;
  return [trimmed.slice(0, cut).trimEnd(), trimmed.slice(cut).trimStart()];
}

function tableBlock(block: TableBlock): Table {
  const columns = block.rows[0]?.length ?? 1;
  const tableWidth = block.widthPx * TWIPS_PER_PX;
  // Word clips the outer left border of a positioned table. A hairline column
  // puts that line between two cells, which Word does draw.
  const edge = 20;
  const widths = [edge, ...columnWidths(tableWidth, columns)];
  const pad = CELL_PAD_PX * TWIPS_PER_PX;
  return new Table({
    width: { size: tableWidth + edge, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: { ...TABLE_BORDERS, left: { style: BorderStyle.NONE, size: 0, color: "auto" } },
    margins: { top: 0, bottom: 0, left: pad, right: pad },
    float: {
      horizontalAnchor: TableAnchorType.PAGE,
      verticalAnchor: TableAnchorType.PAGE,
      absoluteHorizontalPosition: block.xPx * TWIPS_PER_PX - edge,
      absoluteVerticalPosition: block.yPx * TWIPS_PER_PX,
      overlap: OverlapType.OVERLAP,
    },
    rows: block.rows.map(
      (row) =>
        new TableRow({
          height: { value: TABLE_ROW_PX * TWIPS_PER_PX, rule: HeightRule.ATLEAST },
          children: [
            new TableCell({
              width: { size: edge, type: WidthType.DXA },
              borders: CELL_BORDERS,
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
              children: [new Paragraph({ spacing: collapsedSpacing(), children: [] })],
            }),
            ...row.map(
              (cell, columnIndex) =>
                new TableCell({
                  width: { size: widths[columnIndex + 1] ?? widths[1], type: WidthType.DXA },
                  borders: { ...CELL_BORDERS, start: GRID_BORDER, end: GRID_BORDER },
                  children: [
                    new Paragraph({
                      spacing: exactLine(22),
                      children: cell.split("\n").map(
                        (line, index) => new TextRun({ text: line, break: index > 0 ? 1 : undefined, font: "Calibri", size: 22 }),
                      ),
                    }),
                  ],
                }),
            ),
          ],
        }),
    ),
  });
}

function columnWidths(total: number, columns: number): number[] {
  const base = Math.floor(total / columns);
  const widths = Array.from({ length: columns }, () => base);
  widths[columns - 1] = total - base * (columns - 1);
  return widths;
}

function placedFrame(xPx: number, yPx: number, widthPx: number) {
  return {
    type: "absolute" as const,
    position: { x: xPx * TWIPS_PER_PX, y: yPx * TWIPS_PER_PX },
    width: widthPx * TWIPS_PER_PX,
    anchor: {
      horizontal: FrameAnchorType.PAGE,
      vertical: FrameAnchorType.PAGE,
    },
    wrap: FrameWrap.NONE,
    space: { horizontal: 0, vertical: 0 },
  };
}

function textParagraph(block: TextBlock, pageWidth: number): Paragraph {
  const linked = block.link !== "";
  const runs = textRuns(block, linked);
  const listPx = block.list === "none" ? 0 : 28;
  const indentPx = block.indent * 24 + listPx;
  return new Paragraph({
    frame: placedFrame(block.xPx, block.yPx, editorTextWidth(block, pageWidth)),
    alignment: alignmentOf(block.align),
    spacing: textSpacing(block.sizePt, block.lineSpacing),
    indent: indentPx > 0 ? { left: indentPx * TWIPS_PER_PX, hanging: listPx > 0 ? listPx * TWIPS_PER_PX : undefined } : undefined,
    tabStops: listPx > 0 ? [{ type: TabStopType.LEFT, position: indentPx * TWIPS_PER_PX }] : undefined,
    shading: block.highlight ? { type: ShadingType.CLEAR, fill: block.highlight } : undefined,
    children: linked ? [new ExternalHyperlink({ link: block.link, children: runs })] : runs,
  });
}

function alignmentOf(align: TextAlign) {
  if (align === "center") return AlignmentType.CENTER;
  if (align === "right") return AlignmentType.RIGHT;
  if (align === "justify") return AlignmentType.JUSTIFIED;
  return AlignmentType.LEFT;
}

function listMarker(list: TextList, index: number): string {
  if (list === "bullet") return "•\t";
  if (list === "number") return `${index + 1}.\t`;
  if (list === "check") return "☐\t";
  return "";
}

function textRuns(block: TextBlock, linked: boolean): TextRun[] {
  const source: InlineRun[] =
    block.runs && block.runs.length > 0
      ? block.runs
      : [{ text: block.text, bold: block.bold, italic: block.italic, underline: block.underline }];
  const docRuns: TextRun[] = [];
  let itemIndex = 0;
  let newItem = true;
  let pendingBreak = false;
  for (const run of source) {
    for (const part of run.text.split(/(\n|\u2028)/)) {
      if (part === "\n") {
        itemIndex += 1;
        newItem = true;
        pendingBreak = true;
        continue;
      }
      if (part === "\u2028") {
        newItem = false;
        pendingBreak = true;
        continue;
      }
      if (part === "" && !newItem) continue;
      const prefix = newItem && block.list !== "none" ? listMarker(block.list, itemIndex) : "";
      docRuns.push(
        new TextRun({
          text: `${prefix}${part}`,
          break: pendingBreak ? 1 : undefined,
          font: block.font,
          size: Math.round(block.sizePt * 2),
          bold: run.bold,
          italics: run.italic,
          underline: run.underline || linked ? { type: UnderlineType.SINGLE } : undefined,
          color: block.color,
        }),
      );
      pendingBreak = false;
      newItem = false;
    }
  }
  return docRuns.length > 0 ? docRuns : [new TextRun("")];
}

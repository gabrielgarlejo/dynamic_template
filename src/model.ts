import {
  MAX_IMAGE_WIDTH,
  MAX_LINE_WIDTH,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  MAX_TABLE_WIDTH,
  MAX_COLUMNS_WIDTH,
  MIN_COLUMNS_WIDTH,
  MIN_IMAGE_WIDTH,
  MIN_LINE_WIDTH,
  MIN_TABLE_WIDTH,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  type ImageBlock,
  type LineBlock,
  type RenderRequest,
  type ColumnsBlock,
  type TableBlock,
  type TemplateBlock,
  type TextBlock,
} from "../shared/template";
import { defaultPageSetup, loadDefaultPageSetup, type ClampBounds, type PageSetup } from "../shared/pageSetup";
import { createProposalTemplate } from "./proposalTemplate";
import { createSampleImage } from "./sampleImage";

export type EditorText = TextBlock & { id: string };
export type EditorVariable = { id: string; type: "variable"; value: string; xPx: number; yPx: number };
export type EditorImage = ImageBlock & {
  id: string;
  naturalWidth: number;
  naturalHeight: number;
};
export type EditorLine = LineBlock & { id: string };
export type EditorTable = TableBlock & { id: string };
export type EditorColumns = ColumnsBlock & { id: string };
export type EditorBlock = EditorText | EditorVariable | EditorImage | EditorLine | EditorTable | EditorColumns;
export type EditorPage = { id: string; blocks: EditorBlock[] };
export type EditorTemplate = {
  id: string;
  name: string;
  pages: EditorPage[];
  header: EditorBlock[];
  footer: EditorBlock[];
  pageSetup?: PageSetup;
};

export type PaletteKind = "text" | "image" | "variable" | "line" | "table" | "columns";

export function createStarterTemplates(): EditorTemplate[] {
  const sample = createSampleImage();
  const pageSetup = loadDefaultPageSetup() ?? defaultPageSetup();
  return [
    {
      id: "invoice",
      name: "Invoice template",
      header: [],
      footer: [],
      pages: threePages([
        textBlock("EPANG ENGINEERING", { xPx: 64, yPx: 56, font: "Calibri", sizePt: 28, bold: true }),
        textBlock("Company name", { xPx: 64, yPx: 140, sizePt: 14 }),
        variableBlock("Epang Engineering", 64, 190),
        imageBlock(sample, 287, 280),
      ]),
    },
    {
      id: "recurring",
      name: "Recurring template",
      header: [],
      footer: [],
      pages: threePages([
        textBlock("Recurring", { xPx: 64, yPx: 56, font: "Calibri", sizePt: 28, bold: true }),
        variableBlock("", 64, 150),
      ]),
    },
    {
      id: "blank",
      name: "Blank template",
      header: [],
      footer: [],
      pages: threePages([]),
    },
    createProposalTemplate(),
  ].map((template) => (template.id === "proposal" ? template : { ...template, pageSetup }));
}

export function toRequest(template: EditorTemplate): RenderRequest {
  const pages = template.pages.map((page) => ({
    blocks: page.blocks.map(toWireBlock),
  }));
  let lastContent = -1;
  pages.forEach((page, index) => {
    if (page.blocks.length > 0) lastContent = index;
  });
  return {
    template: {
      header: template.header.map(toWireBlock),
      footer: template.footer.map(toWireBlock),
      pages: lastContent < 0 ? [{ blocks: [] }] : pages.slice(0, lastContent + 1),
      pageSetup: template.pageSetup,
    },
  };
}

export function clampPoint(x: number, y: number, bounds?: ClampBounds): { xPx: number; yPx: number } {
  const minX = bounds?.minX ?? 0;
  const minY = bounds?.minY ?? 0;
  const maxX = bounds?.maxX ?? PAGE_WIDTH - 24;
  const maxY = bounds?.maxY ?? PAGE_HEIGHT - 24;
  return {
    xPx: Math.min(maxX, Math.max(minX, Math.round(x))),
    yPx: Math.min(maxY, Math.max(minY, Math.round(y))),
  };
}

export function createPaletteBlock(kind: PaletteKind, xPx: number, yPx: number): EditorBlock {
  if (kind === "text") return textBlock("Text", { xPx, yPx });
  if (kind === "image") return imageBlock(createSampleImage(), xPx, yPx);
  if (kind === "line") return lineBlock(xPx, yPx);
  if (kind === "table") return tableBlock(xPx, yPx);
  if (kind === "columns") return columnsBlock(xPx, yPx);
  return variableBlock("", xPx, yPx);
}

export function heightForWidth(widthPx: number, naturalWidth: number, naturalHeight: number): number {
  return Math.max(1, Math.round((widthPx * naturalHeight) / naturalWidth));
}

export function clampWidth(value: number): number {
  return Math.min(MAX_IMAGE_WIDTH, Math.max(MIN_IMAGE_WIDTH, Math.round(value)));
}

export function clampLineWidth(value: number): number {
  return Math.min(MAX_LINE_WIDTH, Math.max(MIN_LINE_WIDTH, Math.round(value)));
}

export function clampTableWidth(value: number): number {
  return Math.min(MAX_TABLE_WIDTH, Math.max(MIN_TABLE_WIDTH, Math.round(value)));
}

export function clampColumnsWidth(value: number): number {
  return Math.min(MAX_COLUMNS_WIDTH, Math.max(MIN_COLUMNS_WIDTH, Math.round(value)));
}

function threePages(first: EditorBlock[]): EditorPage[] {
  return [
    { id: newId(), blocks: first },
    { id: newId(), blocks: [] },
    { id: newId(), blocks: [] },
  ];
}

export function textBlock(
  text: string,
  options: { xPx: number; yPx: number; font?: TextBlock["font"]; sizePt?: number; bold?: boolean },
): EditorText {
  return {
    id: newId(),
    type: "text",
    text,
    font: options.font ?? "Calibri",
    sizePt: options.sizePt ?? 16,
    bold: options.bold ?? false,
    italic: false,
    underline: false,
    color: "000000",
    highlight: null,
    align: "left",
    lineSpacing: 1.3,
    list: "none",
    indent: 0,
    link: "",
    xPx: options.xPx,
    yPx: options.yPx,
  };
}

export function variableBlock(value: string, xPx: number, yPx: number): EditorVariable {
  return { id: newId(), type: "variable", value, xPx, yPx };
}

export function imageBlock(
  sample: { dataBase64: string; naturalWidth: number; naturalHeight: number },
  xPx: number,
  yPx: number,
  widthPx = 220,
): EditorImage {
  return {
    id: newId(),
    type: "image",
    mime: "image/png",
    dataBase64: sample.dataBase64,
    widthPx,
    heightPx: heightForWidth(widthPx, sample.naturalWidth, sample.naturalHeight),
    naturalWidth: sample.naturalWidth,
    naturalHeight: sample.naturalHeight,
    xPx,
    yPx,
  };
}

export function lineBlock(xPx: number, yPx: number, widthPx = 320): EditorLine {
  return { id: newId(), type: "line", widthPx, xPx, yPx };
}

export function tableBlock(xPx: number, yPx: number): EditorTable {
  return {
    id: newId(),
    type: "table",
    widthPx: 420,
    rows: [
      ["", "", ""],
      ["", "", ""],
    ],
    xPx,
    yPx,
  };
}

export function columnsBlock(xPx: number, yPx: number): EditorColumns {
  return {
    id: newId(),
    type: "columns",
    text: "",
    font: "Calibri",
    sizePt: 11,
    color: "000000",
    lineSpacing: 1.15,
    widthPx: 680,
    xPx,
    yPx,
  };
}

export function addTableRow(rows: string[][]): string[][] {
  if (rows.length >= MAX_TABLE_ROWS) return rows;
  const columns = rows[0]?.length ?? 1;
  return [...rows, Array.from({ length: columns }, () => "")];
}

export function addTableColumn(rows: string[][]): string[][] {
  if ((rows[0]?.length ?? 0) >= MAX_TABLE_COLUMNS) return rows;
  return rows.map((row) => [...row, ""]);
}

export function removeTableRow(rows: string[][]): string[][] {
  if (rows.length <= 1) return rows;
  return rows.slice(0, -1);
}

export function removeTableColumn(rows: string[][]): string[][] {
  if ((rows[0]?.length ?? 0) <= 1) return rows;
  return rows.map((row) => row.slice(0, -1));
}

export function copyBlock(block: EditorBlock, dx = 24, dy = 24, bounds?: ClampBounds): EditorBlock {
  const point = clampPoint(block.xPx + dx, block.yPx + dy, bounds);
  return { ...structuredClone(block), id: newId(), xPx: point.xPx, yPx: point.yPx };
}

function toWireBlock(block: EditorBlock): TemplateBlock {
  if (block.type === "image") {
    return {
      type: "image",
      mime: block.mime,
      dataBase64: block.dataBase64,
      widthPx: block.widthPx,
      heightPx: block.heightPx,
      xPx: block.xPx,
      yPx: block.yPx,
    };
  }
  if (block.type === "text") {
    return {
      type: "text",
      text: block.text,
      font: block.font,
      sizePt: block.sizePt,
      bold: block.bold,
      italic: block.italic,
      underline: block.underline,
      color: block.color,
      highlight: block.highlight,
      align: block.align,
      lineSpacing: block.lineSpacing,
      list: block.list,
      indent: block.indent,
      link: block.link,
      widthPx: block.widthPx,
      runs: block.runs,
      xPx: block.xPx,
      yPx: block.yPx,
    };
  }
  if (block.type === "line") {
    return { type: "line", widthPx: block.widthPx, xPx: block.xPx, yPx: block.yPx };
  }
  if (block.type === "table") {
    return { type: "table", widthPx: block.widthPx, rows: block.rows, xPx: block.xPx, yPx: block.yPx };
  }
  if (block.type === "columns") {
    return {
      type: "columns",
      text: block.text,
      font: block.font,
      sizePt: block.sizePt,
      color: block.color,
      lineSpacing: block.lineSpacing,
      widthPx: block.widthPx,
      xPx: block.xPx,
      yPx: block.yPx,
    };
  }
  return { type: "variable", value: block.value, xPx: block.xPx, yPx: block.yPx };
}

function newId(): string {
  return crypto.randomUUID();
}

import type { PageSetup } from "./pageSetup";

export const RENDER_PORT = 3789;

export const MAX_PAGES = 8;
export const MAX_BLOCKS = 40;
export const MIN_FONT_SIZE = 1;
export const MAX_FONT_SIZE = 72;
export const MIN_IMAGE_WIDTH = 40;
export const MAX_IMAGE_WIDTH = 600;
export const MIN_LINE_WIDTH = 40;
export const MAX_LINE_WIDTH = 700;
export const MIN_TABLE_WIDTH = 120;
export const MAX_TABLE_WIDTH = 700;
export const MIN_COLUMNS_WIDTH = 200;
export const MAX_COLUMNS_WIDTH = 700;
export const MAX_COLUMNS_TEXT = 20000;
export const COLUMN_GAP_PX = 19;
export const COLUMN_BREAK = "\f";
export const MAX_TABLE_ROWS = 12;
export const MAX_TABLE_COLUMNS = 6;
export const MAX_CELL_TEXT = 200;
export const PAGE_WIDTH = 794;
export const PAGE_HEIGHT = 1123;

export const FONTS = [
  "Arial",
  "Calibri",
  "Times New Roman",
  "Georgia",
  "Courier New",
  "Verdana",
] as const;

export type FontName = (typeof FONTS)[number];

export const TEXT_ALIGNS = ["left", "center", "right", "justify"] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];

export const TEXT_LISTS = ["none", "bullet", "number", "check"] as const;
export type TextList = (typeof TEXT_LISTS)[number];

export const LINE_SPACINGS = [1, 1.15, 1.3, 1.5, 2] as const;
export type LineSpacing = (typeof LINE_SPACINGS)[number];

export const MAX_INDENT = 8;

export const TEXT_COLORS = ["000000", "666666", "E03E3E", "D9730D", "DFAB01", "0F7B6C", "0B6E99", "6940A5"] as const;
export const HIGHLIGHT_COLORS = ["FFF3A3", "D3F8DF", "CDEFFF", "FDE2E4", "FAE3C4"] as const;

export function isHexColor(value: string): boolean {
  return /^[0-9A-F]{6}$/.test(value);
}

export function isLineSpacing(value: number): value is LineSpacing {
  return (LINE_SPACINGS as readonly number[]).includes(value);
}

export function isFontSize(value: unknown): value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < MIN_FONT_SIZE || value > MAX_FONT_SIZE) return false;
  const tenths = Math.round(value * 10);
  return Math.abs(value - tenths / 10) < 0.001;
}

export function clampFontSize(value: number): number {
  const clamped = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, value));
  return Math.round(clamped * 10) / 10;
}

export function readFontSize(draft: string): number | null {
  if (!/^\d+(\.\d)?$/.test(draft)) return null;
  const value = Number(draft);
  return isFontSize(value) ? value : null;
}

export function isWebLink(value: string): boolean {
  return value.length <= 500 && (value.startsWith("https://") || value.startsWith("http://"));
}

export type BlockPosition = {
  xPx: number;
  yPx: number;
};

export type InlineRun = {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

export type TextBlock = BlockPosition & {
  type: "text";
  text: string;
  font: FontName;
  sizePt: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  highlight: string | null;
  align: TextAlign;
  lineSpacing: LineSpacing;
  list: TextList;
  indent: number;
  link: string;
  widthPx?: number;
  runs?: InlineRun[];
};

export type VariableBlock = BlockPosition & {
  type: "variable";
  value: string;
};

export type ImageBlock = BlockPosition & {
  type: "image";
  mime: "image/png" | "image/jpeg";
  dataBase64: string;
  widthPx: number;
  heightPx: number;
};

export type LineBlock = BlockPosition & {
  type: "line";
  widthPx: number;
};

export type TableBlock = BlockPosition & {
  type: "table";
  widthPx: number;
  rows: string[][];
};

export type ColumnsBlock = BlockPosition & {
  type: "columns";
  text: string;
  font: FontName;
  sizePt: number;
  color: string;
  lineSpacing: LineSpacing;
  widthPx: number;
};

export type TemplateBlock = TextBlock | VariableBlock | ImageBlock | LineBlock | TableBlock | ColumnsBlock;

export type TemplatePage = {
  blocks: TemplateBlock[];
};

export type Template = {
  pages: TemplatePage[];
  header: TemplateBlock[];
  footer: TemplateBlock[];
  pageSetup?: PageSetup;
};

export type RenderRequest = {
  template: Template;
};

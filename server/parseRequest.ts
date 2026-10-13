import {
  FONTS,
  MAX_BLOCKS,
  MAX_FONT_SIZE,
  MAX_IMAGE_WIDTH,
  MAX_LINE_WIDTH,
  MAX_PAGES,
  MAX_CELL_TEXT,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  MAX_TABLE_WIDTH,
  MAX_COLUMNS_TEXT,
  MAX_COLUMNS_WIDTH,
  MIN_COLUMNS_WIDTH,
  MAX_INDENT,
  MIN_FONT_SIZE,
  MIN_IMAGE_WIDTH,
  MIN_LINE_WIDTH,
  MIN_TABLE_WIDTH,
  TEXT_ALIGNS,
  TEXT_LISTS,
  isHexColor,
  isFontSize,
  isLineSpacing,
  isWebLink,
  type FontName,
  type ImageBlock,
  type InlineRun,
  type LineBlock,
  type RenderRequest,
  type TableBlock,
  type TemplateBlock,
  type TemplatePage,
  type TextBlock,
} from "../shared/template";
import { isPageSetup, legacyPageSetup, type PageSetup } from "../shared/pageSetup";

const MAX_TEXT = 4000;
const MAX_IMAGE_BYTES = 5_000_000;

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

export function parseRenderRequest(body: unknown): RenderRequest {
  if (!isRecord(body)) throw new ParseError("Expected a JSON object.");
  const template = body.template;
  if (!isRecord(template) || !Array.isArray(template.pages)) {
    throw new ParseError("Expected template.pages.");
  }
  if (template.pages.length < 1 || template.pages.length > MAX_PAGES) {
    throw new ParseError(`Expected 1 to ${MAX_PAGES} pages.`);
  }
  return {
    template: {
      pages: template.pages.map(parsePage),
      header: parseChrome(template.header),
      footer: parseChrome(template.footer),
      pageSetup: parsePageSetup(template.pageSetup),
    },
  };
}

function parseChrome(value: unknown): TemplateBlock[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ParseError("Header and footer must be lists of blocks.");
  if (value.length > 12) throw new ParseError("Header and footer can have at most 12 blocks.");
  return value.map(parseBlock);
}

function parsePage(value: unknown): TemplatePage {
  if (!isRecord(value) || !Array.isArray(value.blocks)) throw new ParseError("Expected page.blocks.");
  if (value.blocks.length > MAX_BLOCKS) throw new ParseError("A page has too many blocks.");
  return { blocks: value.blocks.map(parseBlock) };
}

function parseBlock(value: unknown): TemplateBlock {
  if (!isRecord(value)) throw new ParseError("Expected a block.");
  if (value.type === "text") return parseText(value);
  if (value.type === "variable") return parseVariable(value);
  if (value.type === "image") return parseImage(value);
  if (value.type === "line") return parseLine(value);
  if (value.type === "table") return parseTable(value);
  if (value.type === "columns") return parseColumns(value);
  throw new ParseError("Unknown block.");
}

function parseText(value: Record<string, unknown>): TextBlock {
  if (typeof value.text !== "string" || value.text.length > MAX_TEXT) {
    throw new ParseError("Text must be a string of at most 4000 characters.");
  }
  if (typeof value.font !== "string" || !isFont(value.font)) {
    throw new ParseError("Choose a supported font.");
  }
  if (!isFontSize(value.sizePt)) {
    throw new ParseError(`Font size must be from ${MIN_FONT_SIZE} to ${MAX_FONT_SIZE}, with at most one decimal place.`);
  }
  if (typeof value.bold !== "boolean" || typeof value.italic !== "boolean" || typeof value.underline !== "boolean") {
    throw new ParseError("Bold, italic, and underline must be true or false.");
  }
  if (typeof value.color !== "string" || !isHexColor(value.color)) {
    throw new ParseError("Text color must be a 6-digit hex color.");
  }
  if (value.highlight !== null && (typeof value.highlight !== "string" || !isHexColor(value.highlight))) {
    throw new ParseError("Highlight color must be a 6-digit hex color.");
  }
  if (typeof value.align !== "string" || !TEXT_ALIGNS.includes(value.align as (typeof TEXT_ALIGNS)[number])) {
    throw new ParseError("Choose a text alignment.");
  }
  if (typeof value.lineSpacing !== "number" || !isLineSpacing(value.lineSpacing)) {
    throw new ParseError("Choose a line spacing.");
  }
  if (typeof value.list !== "string" || !TEXT_LISTS.includes(value.list as (typeof TEXT_LISTS)[number])) {
    throw new ParseError("Choose a list style.");
  }
  if (typeof value.indent !== "number" || !Number.isInteger(value.indent) || value.indent < 0 || value.indent > MAX_INDENT) {
    throw new ParseError("Indent must be a whole number from 0 to 8.");
  }
  if (typeof value.link !== "string" || (value.link !== "" && !isWebLink(value.link))) {
    throw new ParseError("A link must start with http:// or https://.");
  }
  return {
    type: "text",
    text: value.text,
    font: value.font,
    sizePt: value.sizePt,
    bold: value.bold,
    italic: value.italic,
    underline: value.underline,
    color: value.color,
    highlight: value.highlight,
    align: value.align as TextBlock["align"],
    lineSpacing: value.lineSpacing,
    list: value.list as TextBlock["list"],
    indent: value.indent,
    link: value.link,
    widthPx: parseOptionalWidth(value.widthPx),
    runs: parseRuns(value.runs, value.text),
    ...parsePoint(value),
  };
}

function parseOptionalWidth(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 40 || value > 700) {
    throw new ParseError("Text width must be a whole number from 40 to 700.");
  }
  return value;
}

function parseRuns(value: unknown, text: string): InlineRun[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new ParseError("Text runs must be a list.");
  const runs = value.map((run) => {
    if (!isRecord(run) || typeof run.text !== "string") throw new ParseError("Each text run needs text.");
    if (typeof run.bold !== "boolean" || typeof run.italic !== "boolean" || typeof run.underline !== "boolean") {
      throw new ParseError("Each text run needs bold, italic, and underline flags.");
    }
    return { text: run.text, bold: run.bold, italic: run.italic, underline: run.underline };
  });
  if (runs.map((run) => run.text).join("") !== text) throw new ParseError("Text runs must match the text.");
  return runs;
}

function parseVariable(value: Record<string, unknown>) {
  if (typeof value.value !== "string" || value.value.length > MAX_TEXT) {
    throw new ParseError("Variable text must be a string of at most 4000 characters.");
  }
  return { type: "variable" as const, value: value.value, ...parsePoint(value) };
}

function parseImage(value: Record<string, unknown>): ImageBlock {
  if (value.mime !== "image/png" && value.mime !== "image/jpeg") {
    throw new ParseError("The image must be a PNG or JPEG.");
  }
  if (typeof value.dataBase64 !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.dataBase64)) {
    throw new ParseError("The image data is not valid base64.");
  }
  const bytes = Buffer.from(value.dataBase64, "base64");
  if (bytes.length < 8 || bytes.length > MAX_IMAGE_BYTES) {
    throw new ParseError("The image is empty or too large.");
  }
  if (value.mime === "image/png" && !isPng(bytes)) throw new ParseError("The image is not a PNG.");
  if (value.mime === "image/jpeg" && !isJpeg(bytes)) throw new ParseError("The image is not a JPEG.");
  if (!isPixelSize(value.widthPx) || !isPixelSize(value.heightPx)) {
    throw new ParseError("Image width and height must be whole pixels from 1 to 2000.");
  }
  if (value.widthPx < MIN_IMAGE_WIDTH || value.widthPx > MAX_IMAGE_WIDTH) {
    throw new ParseError("Image width must be from 40 to 600 pixels.");
  }
  return {
    type: "image",
    mime: value.mime,
    dataBase64: value.dataBase64,
    widthPx: value.widthPx,
    heightPx: value.heightPx,
    ...parsePoint(value),
  };
}

function parseLine(value: Record<string, unknown>): LineBlock {
  if (!isSpan(value.widthPx, MIN_LINE_WIDTH, MAX_LINE_WIDTH)) {
    throw new ParseError("Line width must be from 40 to 700 pixels.");
  }
  return { type: "line", widthPx: value.widthPx, ...parsePoint(value) };
}

function parseTable(value: Record<string, unknown>): TableBlock {
  if (!isSpan(value.widthPx, MIN_TABLE_WIDTH, MAX_TABLE_WIDTH)) {
    throw new ParseError("Table width must be from 120 to 700 pixels.");
  }
  if (!Array.isArray(value.rows) || value.rows.length < 1 || value.rows.length > MAX_TABLE_ROWS) {
    throw new ParseError("A table needs 1 to 12 rows.");
  }
  const columns = columnCount(value.rows[0]);
  if (columns < 1 || columns > MAX_TABLE_COLUMNS) {
    throw new ParseError("A table needs 1 to 6 columns.");
  }
  const rows = value.rows.map((row) => {
    if (!Array.isArray(row) || row.length !== columns) {
      throw new ParseError("Every table row needs the same number of cells.");
    }
    return row.map((cell) => {
      if (typeof cell !== "string" || cell.length > MAX_CELL_TEXT) {
        throw new ParseError("A table cell must be text of at most 200 characters.");
      }
      return cell;
    });
  });
  return { type: "table", widthPx: value.widthPx, rows, ...parsePoint(value) };
}

function parseColumns(value: Record<string, unknown>) {
  if (typeof value.text !== "string" || value.text.length > MAX_COLUMNS_TEXT) {
    throw new ParseError("Column text must be a string of at most 20000 characters.");
  }
  if (typeof value.font !== "string" || !isFont(value.font)) {
    throw new ParseError("Choose a supported font.");
  }
  if (!isFontSize(value.sizePt)) {
    throw new ParseError(`Font size must be from ${MIN_FONT_SIZE} to ${MAX_FONT_SIZE}, with at most one decimal place.`);
  }
  if (typeof value.color !== "string" || !isHexColor(value.color)) {
    throw new ParseError("Text color must be a 6-digit hex color.");
  }
  if (typeof value.lineSpacing !== "number" || !isLineSpacing(value.lineSpacing)) {
    throw new ParseError("Choose a line spacing.");
  }
  if (!isSpan(value.widthPx, MIN_COLUMNS_WIDTH, MAX_COLUMNS_WIDTH)) {
    throw new ParseError("Column width must be from 200 to 700 pixels.");
  }
  return {
    type: "columns" as const,
    text: value.text,
    font: value.font,
    sizePt: value.sizePt,
    color: value.color,
    lineSpacing: value.lineSpacing,
    widthPx: value.widthPx,
    ...parsePoint(value),
  };
}

function columnCount(row: unknown): number {
  return Array.isArray(row) ? row.length : 0;
}

function isSpan(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function parsePageSetup(value: unknown): PageSetup {
  if (value === undefined) return legacyPageSetup();
  if (!isPageSetup(value)) throw new ParseError("Page setup is invalid.");
  return value;
}

function parsePoint(value: Record<string, unknown>): { xPx: number; yPx: number } {
  if (!isCoord(value.xPx, 2000) || !isCoord(value.yPx, 2000)) {
    throw new ParseError("Place the block on the page.");
  }
  return { xPx: value.xPx, yPx: value.yPx };
}

function isCoord(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}

function isPixelSize(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 2000;
}

function isFont(value: string): value is FontName {
  return (FONTS as readonly string[]).includes(value);
}

function isPng(bytes: Buffer): boolean {
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function isJpeg(bytes: Buffer): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

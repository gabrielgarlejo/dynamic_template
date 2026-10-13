import { PAGE_HEIGHT, PAGE_WIDTH, isHexColor } from "./template";

export const PX_PER_INCH = 96;

export const PAPER_SIZES = [
  { id: "letter", name: "Letter", widthIn: 8.5, heightIn: 11 },
  { id: "a4", name: "A4", widthIn: 8.27, heightIn: 11.69 },
  { id: "legal", name: "Legal", widthIn: 8.5, heightIn: 14 },
  { id: "a3", name: "A3", widthIn: 11.69, heightIn: 16.54 },
  { id: "a5", name: "A5", widthIn: 5.83, heightIn: 8.27 },
  { id: "tabloid", name: "Tabloid", widthIn: 11, heightIn: 17 },
] as const;

export type PaperSize = (typeof PAPER_SIZES)[number]["id"];
export type PageOrientation = "portrait" | "landscape";
export type PageMode = "pages" | "pageless";

export type PageSetup = {
  mode: PageMode;
  orientation: PageOrientation;
  paper: PaperSize;
  color: string;
  marginTopIn: number;
  marginBottomIn: number;
  marginLeftIn: number;
  marginRightIn: number;
};

export type PageBox = {
  width: number;
  height: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type ClampBounds = { minX: number; minY: number; maxX: number; maxY: number };

const DEFAULT_KEY = "template-maker.page-setup";

export function defaultPageSetup(): PageSetup {
  return {
    mode: "pages",
    orientation: "portrait",
    paper: "a4",
    color: "FFFFFF",
    marginTopIn: 1,
    marginBottomIn: 1,
    marginLeftIn: 1,
    marginRightIn: 1,
  };
}

export function legacyPageSetup(): PageSetup {
  return { ...defaultPageSetup(), marginTopIn: 0, marginBottomIn: 0, marginLeftIn: 0, marginRightIn: 0 };
}

export function resolvePageSetup(value: PageSetup | undefined): PageSetup {
  return value ?? legacyPageSetup();
}

export function isPaperSize(value: string): value is PaperSize {
  return PAPER_SIZES.some((paper) => paper.id === value);
}

export function pagePixels(setup: PageSetup): { width: number; height: number } {
  if (setup.paper === "a4") {
    return setup.orientation === "landscape"
      ? { width: PAGE_HEIGHT, height: PAGE_WIDTH }
      : { width: PAGE_WIDTH, height: PAGE_HEIGHT };
  }
  const paper = PAPER_SIZES.find((item) => item.id === setup.paper) ?? PAPER_SIZES[1];
  const width = Math.round(paper.widthIn * PX_PER_INCH);
  const height = Math.round(paper.heightIn * PX_PER_INCH);
  return setup.orientation === "landscape" ? { width: height, height: width } : { width, height };
}

export function pageBox(setup: PageSetup): PageBox {
  const { width, height } = pagePixels(setup);
  const left = Math.round(setup.marginLeftIn * PX_PER_INCH);
  const top = Math.round(setup.marginTopIn * PX_PER_INCH);
  const right = width - Math.round(setup.marginRightIn * PX_PER_INCH);
  const bottom = height - Math.round(setup.marginBottomIn * PX_PER_INCH);
  return { width, height, left, top, right, bottom };
}

export function sheetBounds(box: PageBox): ClampBounds {
  return { minX: 0, minY: 0, maxX: Math.max(0, box.width - 24), maxY: Math.max(0, box.height - 24) };
}

export function layerBounds(box: PageBox, layer: "page" | "header" | "footer"): ClampBounds {
  if (layer === "header") return { minX: 0, minY: 0, maxX: Math.max(0, box.width - 24), maxY: 36 };
  if (layer === "footer") {
    const minY = Math.max(0, box.height - 72);
    return { minX: 0, minY, maxX: Math.max(0, box.width - 24), maxY: Math.max(minY, box.height - 24) };
  }
  return {
    minX: box.left,
    minY: box.top,
    maxX: Math.max(box.left, box.right - 24),
    maxY: Math.max(box.top, box.bottom - 24),
  };
}

export function pageSetupError(setup: PageSetup): string | null {
  const margins = [
    ["Top", setup.marginTopIn],
    ["Bottom", setup.marginBottomIn],
    ["Left", setup.marginLeftIn],
    ["Right", setup.marginRightIn],
  ] as const;
  for (const [label, value] of margins) {
    if (!Number.isFinite(value) || value < 0) return `${label} margin must be zero or more.`;
    if (value > 6) return `${label} margin must be 6 inches or less.`;
  }
  const box = pageBox(setup);
  if (box.right - box.left < 48) return "Left and right margins leave no room on the page.";
  if (box.bottom - box.top < 48) return "Top and bottom margins leave no room on the page.";
  if (!isHexColor(setup.color)) return "Choose a page color.";
  return null;
}

export function loadDefaultPageSetup(): PageSetup | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(DEFAULT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPageSetup(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveDefaultPageSetup(setup: PageSetup): void {
  localStorage.setItem(DEFAULT_KEY, JSON.stringify(setup));
}

export function isPageSetup(value: unknown): value is PageSetup {
  if (!value || typeof value !== "object") return false;
  const setup = value as PageSetup;
  if (setup.mode !== "pages" && setup.mode !== "pageless") return false;
  if (setup.orientation !== "portrait" && setup.orientation !== "landscape") return false;
  if (typeof setup.paper !== "string" || !isPaperSize(setup.paper)) return false;
  if (typeof setup.color !== "string" || !isHexColor(setup.color)) return false;
  return [setup.marginTopIn, setup.marginBottomIn, setup.marginLeftIn, setup.marginRightIn].every(
    (margin) => typeof margin === "number" && Number.isFinite(margin),
  ) && pageSetupError(setup) === null;
}

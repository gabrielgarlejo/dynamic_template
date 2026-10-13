import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type CSSProperties, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  FONTS,
  MAX_BLOCKS,
  MAX_CELL_TEXT,
  HIGHLIGHT_COLORS,
  LINE_SPACINGS,
  MAX_COLUMNS_TEXT,
  MAX_FONT_SIZE,
  MAX_IMAGE_WIDTH,
  MAX_LINE_WIDTH,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  MAX_TABLE_WIDTH,
  MIN_FONT_SIZE,
  MIN_IMAGE_WIDTH,
  MIN_LINE_WIDTH,
  MIN_TABLE_WIDTH,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  TEXT_COLORS,
  COLUMN_BREAK,
  COLUMN_GAP_PX,
  clampFontSize,
  isWebLink,
  readFontSize,
  type FontName,
  type LineSpacing,
  type TextAlign,
  type TextList,
  type ImageBlock,
} from "../shared/template";
import {
  addTableColumn,
  addTableRow,
  clampColumnsWidth,
  clampLineWidth,
  clampPoint,
  clampTableWidth,
  clampWidth,
  copyBlock,
  createPaletteBlock,
  heightForWidth,
  removeTableColumn,
  removeTableRow,
  type EditorBlock,
  type EditorColumns,
  type EditorImage,
  type EditorLine,
  type EditorTable,
  type EditorTemplate,
  type EditorText,
  type EditorVariable,
  type PaletteKind,
} from "./model";
import {
  caretOffset,
  insertText,
  joinItems,
  mergeRuns,
  normalizeRuns,
  placeCaret,
  plainText,
  readRuns,
  runHtml,
  selectionInBlock,
  sliceRuns,
  splitItems,
  toggleMark,
  type TextMark,
} from "./richText";
import type { InlineRun } from "../shared/template";
import { layerBounds, pageBox, resolvePageSetup, saveDefaultPageSetup, sheetBounds, type PageSetup } from "../shared/pageSetup";
import { PageSetupDialog } from "./PageSetupDialog";

let currentDrag: PaletteKind | null = null;
let suppressPaletteClick = false;
const CHROME_BAND = 96;

export function Editor({
  template,
  message,
  error,
  rendering,
  onChange,
  onBack,
  onSave,
  onRender,
}: {
  template: EditorTemplate;
  message: string | null;
  error: string | null;
  rendering: boolean;
  onChange: (template: EditorTemplate) => void;
  onBack: () => void;
  onSave: () => void;
  onRender: () => void;
}) {
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [marquee, setMarquee] = useState<{ page: number; x: number; y: number; w: number; h: number } | null>(null);
  const skipClear = useRef(false);
  const [clipboard, setClipboard] = useState<{ block: EditorBlock; times: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [chrome, setChrome] = useState<null | "header" | "footer">(null);
  const [zoom, setZoom] = useState(1);
  const [painter, setPainter] = useState<Partial<EditorText> | null>(null);
  const [historyTick, setHistoryTick] = useState(0);
  const [pageSetupOpen, setPageSetupOpen] = useState(false);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const sheetRefs = useRef<Array<HTMLDivElement | null>>([]);
  const past = useRef<EditorTemplate[]>([]);
  const future = useRef<EditorTemplate[]>([]);
  const gesture = useRef<EditorTemplate | null>(null);
  const typingTimer = useRef<number | null>(null);
  const page = template.pages[pageIndex] ?? template.pages[0];
  const setup = resolvePageSetup(template.pageSetup);
  const sheet = pageBox(setup);
  const pageWidth = sheet.width;
  const pageHeight = sheet.height;
  const pageless = setup.mode === "pageless";
  const visibleBlocks = [
    ...(template.header ?? []),
    ...template.pages.flatMap((item) => item.blocks),
    ...(template.footer ?? []),
  ];
  const selected =
    visibleBlocks.find((block) => block.id === selectedIds[selectedIds.length - 1]) ??
    visibleBlocks.find((block) => selectedIds.includes(block.id)) ??
    null;
  const canUndo = historyTick >= 0 && (past.current.length > 0 || gesture.current !== null);
  const canRedo = future.current.length > 0;

  useEffect(() => {
    past.current = [];
    future.current = [];
    gesture.current = null;
    setHistoryTick((tick) => tick + 1);
    setPageIndex(0);
    setSelectedIds([]);
    setEditingId(null);
    setChrome(null);
  }, [template.id]);

  useEffect(() => {
    function clearDrag() {
      currentDrag = null;
    }
    window.addEventListener("dragend", clearDrag);
    return () => window.removeEventListener("dragend", clearDrag);
  }, []);

  function bumpHistory() {
    setHistoryTick((tick) => tick + 1);
  }

  function rememberGesture() {
    if (gesture.current) return;
    gesture.current = structuredClone(template);
    future.current = [];
    bumpHistory();
  }

  function endGesture() {
    if (!gesture.current) return;
    past.current.push(gesture.current);
    if (past.current.length > 100) past.current.shift();
    future.current = [];
    gesture.current = null;
    bumpHistory();
  }

  function commit(next: EditorTemplate) {
    if (typingTimer.current !== null) {
      window.clearTimeout(typingTimer.current);
      typingTimer.current = null;
    }
    if (gesture.current) {
      past.current.push(gesture.current);
      gesture.current = null;
    }
    past.current.push(structuredClone(template));
    if (past.current.length > 100) past.current.shift();
    future.current = [];
    bumpHistory();
    onChange(next);
  }

  function preview(next: EditorTemplate) {
    rememberGesture();
    onChange(next);
  }

  function liveChange(next: EditorTemplate) {
    rememberGesture();
    onChange(next);
    if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => {
      typingTimer.current = null;
      endGesture();
    }, 700);
  }

  function undo() {
    if (typingTimer.current !== null) {
      window.clearTimeout(typingTimer.current);
      typingTimer.current = null;
    }
    if (gesture.current) {
      future.current.push(structuredClone(template));
      const restore = gesture.current;
      gesture.current = null;
      bumpHistory();
      onChange(restore);
      return;
    }
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push(structuredClone(template));
    bumpHistory();
    onChange(previous);
  }

  function redo() {
    if (gesture.current) {
      past.current.push(gesture.current);
      gesture.current = null;
    }
    const next = future.current.pop();
    if (!next) {
      bumpHistory();
      return;
    }
    past.current.push(structuredClone(template));
    if (past.current.length > 100) past.current.shift();
    bumpHistory();
    onChange(next);
  }

  function pasteClipboard() {
    if (!page || !clipboard) return;
    const layer = chrome ?? "page";
    const list = layer === "header" ? (template.header ?? []) : layer === "footer" ? (template.footer ?? []) : page.blocks;
    if (list.length >= (layer === "page" ? MAX_BLOCKS : 12)) return;
    const copy = fitChrome(copyBlock(clipboard.block, 24 * (clipboard.times + 1), 24 * (clipboard.times + 1), layerBounds(sheet, layer)), layer, pageHeight);
    if (layer === "header") commit({ ...template, header: [...list, copy] });
    else if (layer === "footer") commit({ ...template, footer: [...list, copy] });
    else commit(withBlocks([...page.blocks, copy]));
    setSelectedIds([copy.id]);
    setEditingId(null);
    setClipboard({ block: clipboard.block, times: clipboard.times + 1 });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      const command = (event.ctrlKey || event.metaKey) && !event.altKey;
      if (command && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (command && key === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (event.key === "Escape" && pageSetupOpen) {
        event.preventDefault();
        setPageSetupOpen(false);
        return;
      }
      if (event.key === "Escape" && chrome) {
        event.preventDefault();
        closeChrome();
        return;
      }
      if (isEditingField(event.target)) return;
      if (command && key === "c" && selected) {
        event.preventDefault();
        setClipboard({ block: selected, times: 0 });
      } else if (command && key === "v" && clipboard && page) {
        event.preventDefault();
        pasteClipboard();
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedIds.length > 0 && page) {
        event.preventDefault();
        const ids = new Set(selectedIds);
        const keep = (blocks: EditorBlock[]) => blocks.filter((block) => !ids.has(block.id));
        commit({
          ...template,
          header: keep(template.header ?? []),
          footer: keep(template.footer ?? []),
          pages: template.pages.map((item) => ({ ...item, blocks: keep(item.blocks) })),
        });
        setSelectedIds([]);
        setEditingId(null);
      } else if (event.key.startsWith("Arrow") && selectedIds.length > 0 && page) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        const ids = new Set(selectedIds);
        const nudge = (blocks: EditorBlock[], layer: "page" | "header" | "footer") =>
          blocks.map((block) => (ids.has(block.id) ? { ...block, ...clampPoint(block.xPx + dx, block.yPx + dy, layerBounds(sheet, layer)) } : block));
        commit({
          ...template,
          header: nudge(template.header ?? [], "header"),
          footer: nudge(template.footer ?? [], "footer"),
          pages: template.pages.map((item) => ({ ...item, blocks: nudge(item.blocks, "page") })),
        });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (!page) return null;

  function withBlocks(blocks: EditorBlock[]): EditorTemplate {
    return {
      ...template,
      pages: template.pages.map((item, index) => (index === pageIndex ? { ...item, blocks } : item)),
    };
  }

  function mapLayers(mapList: (blocks: EditorBlock[]) => EditorBlock[]): EditorTemplate {
    return {
      ...template,
      header: mapList(template.header ?? []),
      footer: mapList(template.footer ?? []),
      pages: template.pages.map((item) => ({ ...item, blocks: mapList(item.blocks) })),
    };
  }

  function patchBlock(
    id: string,
    patch: Partial<EditorText> | Partial<EditorImage> | Partial<EditorVariable> | Partial<EditorLine> | Partial<EditorTable> | Partial<EditorColumns>,
    mode: "commit" | "live" | "preview" = "commit",
  ) {
    const next = mapLayers((blocks) =>
      blocks.map((block) => {
        if (block.id !== id) return block;
        const merged = { ...block, ...patch } as EditorBlock;
        if (merged.type !== "text" || block.type !== "text" || "runs" in patch) return merged;
        if (!("bold" in patch) && !("italic" in patch) && !("underline" in patch)) return merged;
        const runs = normalizeRuns(block).map((run) => ({
          ...run,
          bold: "bold" in patch ? Boolean(patch.bold) : run.bold,
          italic: "italic" in patch ? Boolean(patch.italic) : run.italic,
          underline: "underline" in patch ? Boolean(patch.underline) : run.underline,
        }));
        return { ...merged, runs, text: plainText(runs) };
      }),
    );
    if (mode === "live") liveChange(next);
    else if (mode === "preview") preview(next);
    else commit(next);
  }

  function applyMark(mark: TextMark) {
    if (selected?.type !== "text") return;
    const root = pageRefs.current[pageIndex]?.querySelector<HTMLElement>(`[data-block-id="${selected.id}"]`);
    const runs = normalizeRuns(selected);
    const picked = root ? selectionInBlock(root) : null;
    const turnOn = !runs.every((run) => run[mark]);
    const next = picked ? toggleMark(runs, picked.start, picked.end, mark) : runs.map((run) => ({ ...run, [mark]: turnOn }));
    patchBlock(selected.id, {
      runs: next,
      text: plainText(next),
      bold: next.every((run) => run.bold),
      italic: next.every((run) => run.italic),
      underline: next.every((run) => run.underline),
    });
  }

  function openChrome(next: "header" | "footer") {
    setChrome(next);
    setSelectedIds([]);
    setEditingId(null);
    setPainter(null);
  }

  function closeChrome() {
    setChrome(null);
    setSelectedIds([]);
    setEditingId(null);
  }

  function addBlock(kind: PaletteKind, xPx: number, yPx: number, layer: "page" | "header" | "footer", index = pageIndex) {
    const target = template.pages[index];
    if (!target) return;
    const list = layer === "header" ? (template.header ?? []) : layer === "footer" ? (template.footer ?? []) : target.blocks;
    if (list.length >= (layer === "page" ? MAX_BLOCKS : 12)) return;
    const placed = clampPoint(xPx, yPx, layerBounds(sheet, layer));
    const created = fitChrome(createPaletteBlock(kind, placed.xPx, placed.yPx), layer, pageHeight);
    if (layer === "header") commit({ ...template, header: [...list, created] });
    else if (layer === "footer") commit({ ...template, footer: [...list, created] });
    else {
      commit({
        ...template,
        pages: template.pages.map((item, itemIndex) => (itemIndex === index ? { ...item, blocks: [...item.blocks, created] } : item)),
      });
    }
    setPageIndex(index);
    setSelectedIds([created.id]);
    setEditingId(null);
  }

  function pointOnPage(clientX: number, clientY: number, pageEl: HTMLElement | null) {
    const rect = pageEl?.getBoundingClientRect();
    if (!rect) return clampPoint(Math.max(sheet.left, 48), Math.max(sheet.top, 48), sheetBounds(sheet));
    const scale = rect.width / pageWidth || 1;
    return clampPoint((clientX - rect.left) / scale, (clientY - rect.top) / scale, sheetBounds(sheet));
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    const kind = currentDrag;
    currentDrag = null;
    if (!kind) return;
    const pageEl = event.currentTarget.closest<HTMLElement>("[data-page-index]");
    const index = Number(pageEl?.dataset.pageIndex);
    const point = pointOnPage(event.clientX, event.clientY, pageEl);
    const inHeader = chrome === "header" && point.yPx <= CHROME_BAND;
    const inFooter = chrome === "footer" && point.yPx >= pageHeight - CHROME_BAND;
    if (chrome && !inHeader && !inFooter) closeChrome();
    addBlock(kind, point.xPx, point.yPx, inHeader ? "header" : inFooter ? "footer" : "page", Number.isNaN(index) ? pageIndex : index);
  }

  function startMove(event: ReactPointerEvent, block: EditorBlock, wasSelected: boolean) {
    const pageEl = event.currentTarget.closest<HTMLElement>("[data-page-index]");
    const ids = wasSelected && selectedIds.includes(block.id) ? selectedIds : [block.id];
    const starts = new Map(visibleBlocks.filter((item) => ids.includes(item.id)).map((item) => [item.id, { xPx: item.xPx, yPx: item.yPx }]));
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
      moved = true;
      const rect = pageEl?.getBoundingClientRect();
      if (!rect) return;
      const scale = rect.width / pageWidth || 1;
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      const moveList = (blocks: EditorBlock[], layer: "page" | "header" | "footer") =>
        blocks.map((item) => {
          const start = starts.get(item.id);
          return start ? { ...item, ...clampPoint(start.xPx + dx, start.yPx + dy, layerBounds(sheet, layer)) } : item;
        });
      preview({
        ...template,
        header: moveList(template.header ?? [], "header"),
        footer: moveList(template.footer ?? [], "footer"),
        pages: template.pages.map((item) => ({ ...item, blocks: moveList(item.blocks, "page") })),
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (moved) endGesture();
      else if (wasSelected && (block.type === "text" || block.type === "variable" || block.type === "columns")) setEditingId(block.id);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function startMarquee(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const pageEl = event.currentTarget;
    const index = Number(pageEl.dataset.pageIndex);
    const start = pointOnPage(event.clientX, event.clientY, pageEl);
    let rect = { x: start.xPx, y: start.yPx, w: 0, h: 0 };
    const move = (ev: PointerEvent) => {
      const point = pointOnPage(ev.clientX, ev.clientY, pageEl);
      rect = {
        x: Math.min(start.xPx, point.xPx),
        y: Math.min(start.yPx, point.yPx),
        w: Math.abs(point.xPx - start.xPx),
        h: Math.abs(point.yPx - start.yPx),
      };
      setMarquee({ page: index, ...rect });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setMarquee(null);
      if (rect.w < 4 && rect.h < 4) return;
      skipClear.current = true;
      const pageBox = pageEl.getBoundingClientRect();
      const scale = pageBox.width / pageWidth || 1;
      const allowed = new Set(
        (chrome === "header" ? (template.header ?? []) : chrome === "footer" ? (template.footer ?? []) : (template.pages[index]?.blocks ?? [])).map(
          (block) => block.id,
        ),
      );
      const hits = [...pageEl.querySelectorAll<HTMLElement>("[data-block-id]")]
        .filter((element) => {
          const box = element.getBoundingClientRect();
          const bounds = {
            x: (box.left - pageBox.left) / scale,
            y: (box.top - pageBox.top) / scale,
            w: box.width / scale,
            h: box.height / scale,
          };
          return (
            allowed.has(element.dataset.blockId ?? "") &&
            bounds.x < rect.x + rect.w &&
            bounds.x + bounds.w > rect.x &&
            bounds.y < rect.y + rect.h &&
            bounds.y + bounds.h > rect.y
          );
        })
        .map((element) => element.dataset.blockId ?? "")
        .filter(Boolean);
      setSelectedIds(hits);
      setEditingId(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function startResize(event: ReactPointerEvent, block: EditorBlock, corner: "nw" | "ne" | "sw" | "se") {
    event.stopPropagation();
    event.preventDefault();
    const startW = boxWidth(block, pageWidth);
    const pageEl = (event.currentTarget as HTMLElement).closest<HTMLElement>("[data-page-index]");
    const element = pageEl?.querySelector<HTMLElement>(`[data-block-id="${block.id}"]`);
    const pageRect = pageEl?.getBoundingClientRect();
    const scale = pageRect ? pageRect.width / pageWidth || 1 : 1;
    const startH = element ? element.getBoundingClientRect().height / scale : 40;
    const startSize = block.type === "text" ? block.sizePt : 16;
    const startX = block.xPx;
    const startY = block.yPx;
    const pointer = pointOnPage(event.clientX, event.clientY, pageEl);
    let moved = false;
    const move = (ev: PointerEvent) => {
      const point = pointOnPage(ev.clientX, ev.clientY, pageEl);
      if (!moved && Math.hypot(point.xPx - pointer.xPx, point.yPx - pointer.yPx) < 2) return;
      moved = true;
      const dx = point.xPx - pointer.xPx;
      let width = corner === "ne" || corner === "se" ? startW + dx : startW - dx;
      width = Math.min(700, Math.max(40, Math.round(width)));
      const ratio = width / startW;
      let x = corner === "nw" || corner === "sw" ? startX + (startW - width) : startX;
      let y = corner === "nw" || corner === "ne" ? startY + startH * (1 - ratio) : startY;
      const position = clampPoint(x, y, sheetBounds(sheet));
      if (block.type === "text") {
        const sizePt = clampFontSize(startSize * ratio);
        patchBlock(block.id, { widthPx: width, sizePt, ...position }, "preview");
      } else if (block.type === "image") {
        const widthPx = Math.min(MAX_IMAGE_WIDTH, Math.max(MIN_IMAGE_WIDTH, width));
        patchBlock(block.id, { widthPx, heightPx: heightForWidth(widthPx, block.naturalWidth, block.naturalHeight), ...position }, "preview");
      } else if (block.type === "line") {
        patchBlock(block.id, { widthPx: clampLineWidth(width), ...position }, "preview");
      } else if (block.type === "table") {
        patchBlock(block.id, { widthPx: clampTableWidth(width), ...position }, "preview");
      } else if (block.type === "columns") {
        patchBlock(block.id, { widthPx: clampColumnsWidth(width), ...position }, "preview");
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (moved) endGesture();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div className="flex h-dvh flex-col bg-slate-200 p-4 text-slate-900">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem] border-2 border-slate-400 bg-slate-50">
        <header className="flex items-center justify-between gap-4 border-b border-slate-300 px-5 py-3">
          <button type="button" onClick={onBack} className="text-sm font-medium text-slate-700">
            Templates
          </button>
          <h1 className="text-sm font-medium">{template.name}</h1>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setPageSetupOpen(true)} className="text-sm font-medium text-slate-700">
              Page setup
            </button>
            <button type="button" onClick={onSave} className="text-sm font-medium text-slate-700">
              Save
            </button>
            <button
              type="button"
              onClick={onRender}
              disabled={rendering}
              className="rounded-full bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {rendering ? "Rendering…" : "Render"}
            </button>
          </div>
        </header>
        {error ? <p className="px-5 py-2 text-sm text-red-700">{error}</p> : null}
        {message ? <p className="px-5 py-2 text-sm text-emerald-700">{message}</p> : null}

        <div className="flex min-h-0 flex-1">
          <aside className="flex w-36 shrink-0 flex-col gap-3 overflow-y-auto border-r border-slate-300 p-4">
            {template.pages.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setPageIndex(index);
                  setSelectedIds([]);
                  setEditingId(null);
                  sheetRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={`flex h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 text-sm ${
                  index === pageIndex ? "border-slate-900 bg-white" : "border-slate-300 bg-slate-100"
                }`}
              >
                <MiniPage blocks={item.blocks} pageWidth={pageWidth} pageHeight={pageHeight} color={setup.color} />
                Page {index + 1}
              </button>
            ))}
          </aside>

          <main className="relative z-10 flex min-w-0 flex-1 flex-col">
            <FormatBar
              block={selected?.type === "text" ? selected : null}
              canUndo={canUndo}
              canRedo={canRedo}
              zoom={zoom}
              painter={painter !== null}
              onUndo={undo}
              onRedo={redo}
              onZoom={setZoom}
              onPaint={() => {
                if (selected?.type !== "text") return;
                setPainter((current) => (current ? null : copiedStyle(selected)));
              }}
              onInsertImage={() => addAtEnd("image")}
              onMark={applyMark}
              onPatch={(patch) => {
                if (selected?.type === "text") patchBlock(selected.id, patch);
              }}
            />
            <div
              className="min-h-0 flex-1 overflow-auto bg-slate-200/70 px-8 py-8"
              onScroll={(event) => {
                const edge = event.currentTarget.getBoundingClientRect().top + 48;
                let next = 0;
                pageRefs.current.forEach((element, index) => {
                  if (element && element.getBoundingClientRect().top - 40 <= edge) next = index;
                });
                setPageIndex((current) => (current === next ? current : next));
              }}
            >
              <div className={`mx-auto flex flex-col items-center ${pageless ? "gap-0" : "gap-10"}`} style={{ width: pageWidth * zoom }}>
              {template.pages.map((sheetPage, index) => {
                const sheetBlocks = [...(template.header ?? []), ...sheetPage.blocks, ...(template.footer ?? [])];
                return (
              <div
                key={sheetPage.id}
                ref={(node) => {
                  sheetRefs.current[index] = node;
                }}
                className="flex flex-col items-center"
              >
              {pageless ? null : <p className="mb-2 text-xs text-slate-500">Page {index + 1}</p>}
              <div style={{ width: pageWidth * zoom, height: pageHeight * zoom }}>
              <div
                ref={(node) => {
                  pageRefs.current[index] = node;
                }}
                data-page-index={index}
                className={`relative select-none ${pageless ? "" : "shadow-lg"}`}
                style={{ width: pageWidth, height: pageHeight, transform: `scale(${zoom})`, transformOrigin: "top left", backgroundColor: `#${setup.color}` }}
                onPointerDown={(event) => {
                  setPageIndex(index);
                  startMarquee(event);
                }}
                onClick={() => {
                  if (skipClear.current) {
                    skipClear.current = false;
                    return;
                  }
                  setSelectedIds([]);
                  setEditingId(null);
                  setPainter(null);
                }}
                onDoubleClick={(event) => {
                  if (event.target !== event.currentTarget) return;
                  const point = pointOnPage(event.clientX, event.clientY, event.currentTarget);
                  if (point.yPx <= CHROME_BAND) openChrome("header");
                  else if (point.yPx >= pageHeight - CHROME_BAND) openChrome("footer");
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={onDrop}
              >
                {!pageless && (sheet.left > 0 || sheet.top > 0 || sheet.right < pageWidth || sheet.bottom < pageHeight) ? (
                  <div
                    className="pointer-events-none absolute z-0 border border-dashed border-slate-400/70"
                    style={{ left: sheet.left, top: sheet.top, width: sheet.right - sheet.left, height: sheet.bottom - sheet.top }}
                  />
                ) : null}
                {chrome ? (
                  <div
                    className={`pointer-events-none absolute inset-x-0 z-20 border-blue-500 ${chrome === "header" ? "top-0 border-b-2" : "bottom-0 border-t-2"}`}
                    style={{ height: CHROME_BAND }}
                  >
                    <span className={`absolute left-3 text-xs text-slate-500 ${chrome === "header" ? "bottom-2" : "top-2"}`}>
                      {chrome === "header" ? "Header" : "Footer"}
                    </span>
                    {(chrome === "header" ? (template.header ?? []) : (template.footer ?? [])).length === 0 ? (
                      <span className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                        Drop a block here. It repeats on every page.
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {chrome ? (
                  <div
                    className="absolute inset-x-0 z-[15] cursor-default bg-slate-400/25"
                    style={chrome === "header" ? { top: CHROME_BAND, bottom: 0 } : { top: 0, bottom: CHROME_BAND }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      closeChrome();
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.stopPropagation();
                      onDrop(event);
                    }}
                  />
                ) : null}
                {sheetPage.blocks.length === 0 && (template.header ?? []).length === 0 && (template.footer ?? []).length === 0 && !chrome ? (
                  <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                    Drop a block anywhere on the page.
                  </p>
                ) : null}
                {sheetBlocks.map((block) => {
                  const layer = (template.header ?? []).some((item) => item.id === block.id)
                    ? "header"
                    : (template.footer ?? []).some((item) => item.id === block.id)
                      ? "footer"
                      : "page";
                  const quiet = layer === "page" ? chrome !== null : chrome !== layer;
                  return (
                  <BlockRow
                    key={block.id}
                    block={block}
                    pageWidth={pageWidth}
                    quiet={quiet}
                    raised={chrome !== null && !quiet}
                    selected={selectedIds.includes(block.id)}
                    editing={editingId === block.id && index === pageIndex}
                    painting={painter !== null && block.type === "text"}
                    onSelect={(shift) => {
                      if (painter && block.type === "text") {
                        patchBlock(block.id, painter);
                        setPainter(null);
                        setSelectedIds([block.id]);
                        return;
                      }
                      if (shift) {
                        setSelectedIds((current) => (current.includes(block.id) ? current.filter((id) => id !== block.id) : [...current, block.id]));
                      } else if (!selectedIds.includes(block.id)) {
                        setSelectedIds([block.id]);
                      }
                      if (block.id !== selected?.id) setEditingId(null);
                    }}
                    onText={(text, runs) =>
                      patchBlock(
                        block.id,
                        {
                          text,
                          runs,
                          bold: runs.every((run) => run.bold),
                          italic: runs.every((run) => run.italic),
                          underline: runs.every((run) => run.underline),
                        },
                        "live",
                      )
                    }
                    onValue={(value) => patchBlock(block.id, { value }, "live")}
                    onRows={(rows) => patchBlock(block.id, { rows }, "live")}
                    onColumns={(text) => patchBlock(block.id, { text: text.slice(0, MAX_COLUMNS_TEXT) }, "live")}
                    onMove={(event) => startMove(event, block, selectedIds.includes(block.id))}
                    onResize={(corner, event) => startResize(event, block, corner)}
                  />
                  );
                })}
                {marquee && marquee.page === index ? (
                  <div
                    className="pointer-events-none absolute z-20 border border-blue-500 bg-blue-500/10"
                    style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
                  />
                ) : null}
              </div>
              </div>
              </div>
                );
              })}
              </div>
            </div>
          </main>

          <aside className="flex w-72 shrink-0 flex-col gap-6 overflow-auto border-l border-slate-300 p-4">
            <section>
              <h2 className="text-sm font-medium">Variables</h2>
              <p className="mt-1 text-xs text-slate-500">Drop it where you want it, then type the value.</p>
              <div className="mt-3 flex flex-col gap-2">
                <PaletteCard
                  title="Variable"
                  detail="a value you can change"
                  onDrag={() => {
                    currentDrag = "variable";
                  }}
                  onAdd={() => addAtEnd("variable")}
                />
              </div>
            </section>
            <section>
              <h2 className="text-sm font-medium">Blocks</h2>
              <div className="mt-3 flex flex-col gap-2">
                <PaletteCard
                  title="Text"
                  detail="bold, italic, underline"
                  onDrag={() => {
                    currentDrag = "text";
                  }}
                  onAdd={() => addAtEnd("text")}
                />
                <PaletteCard
                  title="Image"
                  detail="drop where you want it"
                  onDrag={() => {
                    currentDrag = "image";
                  }}
                  onAdd={() => addAtEnd("image")}
                />
                <PaletteCard
                  title="Line"
                  detail="a horizontal rule"
                  onDrag={() => {
                    currentDrag = "line";
                  }}
                  onAdd={() => addAtEnd("line")}
                />
                <PaletteCard
                  title="Table"
                  detail="rows and columns"
                  onDrag={() => {
                    currentDrag = "table";
                  }}
                  onAdd={() => addAtEnd("table")}
                />
                <PaletteCard
                  title="Columns"
                  detail="two compact columns"
                  onDrag={() => {
                    currentDrag = "columns";
                  }}
                  onAdd={() => addAtEnd("columns")}
                />
                <button
                  type="button"
                  disabled={
                    !clipboard ||
                    (chrome === "header"
                      ? (template.header ?? []).length >= 12
                      : chrome === "footer"
                        ? (template.footer ?? []).length >= 12
                        : page.blocks.length >= MAX_BLOCKS)
                  }
                  onClick={pasteClipboard}
                  className="rounded-2xl border-2 border-slate-300 bg-white px-3 py-3 text-left text-sm font-medium disabled:opacity-40"
                >
                  Paste
                  <div className="mt-1 text-xs font-normal text-slate-500">Ctrl+V places a copy</div>
                </button>
              </div>
            </section>
            {selected ? (
              <SelectionSettings
                block={selected}
                onPatch={(patch) =>
                  patchBlock(selected.id, patch, selected.type === "variable" && "value" in patch ? "live" : "commit")
                }
                onCopy={() => setClipboard({ block: selected, times: 0 })}
                onRemove={() => {
                  const ids = new Set(selectedIds.length > 0 ? selectedIds : [selected.id]);
                  const keep = (blocks: EditorBlock[]) => blocks.filter((block) => !ids.has(block.id));
                  commit({
                    ...template,
                    header: keep(template.header ?? []),
                    footer: keep(template.footer ?? []),
                    pages: template.pages.map((item) => ({ ...item, blocks: keep(item.blocks) })),
                  });
                  setSelectedIds([]);
                }}
              />
            ) : null}
            <p className="mt-auto text-xs text-slate-500">
              Double-click the top of a page to edit the header, and the bottom to edit the footer. Click the page to close it. Render downloads a .docx for LibreOffice and Google Docs.
            </p>
          </aside>
        </div>
      </div>
      {pageSetupOpen ? (
        <PageSetupDialog
          setup={setup}
          onCancel={() => setPageSetupOpen(false)}
          onOk={(next: PageSetup) => {
            commit({ ...template, pageSetup: next });
            setPageSetupOpen(false);
          }}
          onSetDefault={saveDefaultPageSetup}
        />
      ) : null}
    </div>
  );

  function addAtEnd(kind: PaletteKind) {
    const count = chrome === "header" ? (template.header ?? []).length : chrome === "footer" ? (template.footer ?? []).length : page.blocks.length;
    const layer = chrome ?? "page";
    const y = layer === "header" ? 24 : layer === "footer" ? pageHeight - 64 : sheet.top + count * 36;
    const point = clampPoint(sheet.left + (count % 4) * 16, y, layerBounds(sheet, layer));
    addBlock(kind, point.xPx, point.yPx, layer);
  }
}

const TEXT_STYLES = [
  { id: "normal", label: "Normal text", patch: { sizePt: 12, bold: false, italic: false } },
  { id: "title", label: "Title", patch: { sizePt: 20, bold: true, italic: false } },
  { id: "heading", label: "Heading", patch: { sizePt: 14, bold: true, italic: false } },
  { id: "subtitle", label: "Subtitle", patch: { sizePt: 12, bold: false, italic: true } },
] as const;

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function copiedStyle(block: EditorText): Partial<EditorText> {
  return {
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
  };
}

function styleId(block: EditorText | null): string {
  if (!block) return "normal";
  const match = TEXT_STYLES.find(
    (style) => style.patch.sizePt === block.sizePt && style.patch.bold === block.bold && style.patch.italic === block.italic,
  );
  return match?.id ?? "custom";
}

function FormatBar({
  block,
  canUndo,
  canRedo,
  zoom,
  painter,
  onUndo,
  onRedo,
  onZoom,
  onPaint,
  onInsertImage,
  onPatch,
  onMark,
}: {
  block: EditorText | null;
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  painter: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onZoom: (zoom: number) => void;
  onPaint: () => void;
  onInsertImage: () => void;
  onPatch: (patch: Partial<EditorText>) => void;
  onMark: (mark: TextMark) => void;
}) {
  const disabled = !block;
  const size = block?.sizePt ?? 16;

  return (
    <div className="relative z-30 flex min-w-0 flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-3 py-2 [&>*]:shrink-0">
      <HistoryButton label="Undo" disabled={!canUndo} onClick={onUndo} direction="undo" />
      <HistoryButton label="Redo" disabled={!canRedo} onClick={onRedo} direction="redo" />
      <BarGap />
      <ToolButton label="Paint format" pressed={painter} disabled={disabled} onClick={onPaint}>
        <BrushIcon />
      </ToolButton>
      <select
        aria-label="Zoom"
        value={String(zoom)}
        onChange={(event) => onZoom(Number(event.target.value))}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
      >
        {ZOOMS.map((value) => (
          <option key={value} value={value}>
            {Math.round(value * 100)}%
          </option>
        ))}
      </select>
      <BarGap />
      <select
        aria-label="Style"
        disabled={disabled}
        value={styleId(block)}
        onChange={(event) => {
          const style = TEXT_STYLES.find((item) => item.id === event.target.value);
          if (style) onPatch(style.patch);
        }}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm disabled:opacity-40"
      >
        <option value="custom" hidden>
          Custom
        </option>
        {TEXT_STYLES.map((style) => (
          <option key={style.id} value={style.id}>
            {style.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Font"
        disabled={disabled}
        value={block?.font ?? "Calibri"}
        onChange={(event) => onPatch({ font: event.target.value as FontName })}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm disabled:opacity-40"
      >
        {FONTS.map((font) => (
          <option key={font} value={font}>
            {font}
          </option>
        ))}
      </select>
      <ToolButton
        label="Decrease font size"
        disabled={disabled || size <= MIN_FONT_SIZE}
        onClick={() => onPatch({ sizePt: clampFontSize(size - 0.5) })}
      >
        −
      </ToolButton>
      <SizeField size={size} disabled={disabled} onChange={(sizePt) => onPatch({ sizePt })} />
      <ToolButton
        label="Increase font size"
        disabled={disabled || size >= MAX_FONT_SIZE}
        onClick={() => onPatch({ sizePt: clampFontSize(size + 0.5) })}
      >
        +
      </ToolButton>
      <BarGap />
      <ToolButton label="Bold" pressed={block ? normalizeRuns(block).every((run) => run.bold) : false} disabled={disabled} onClick={() => onMark("bold")}>
        <span className="font-bold">B</span>
      </ToolButton>
      <ToolButton label="Italic" pressed={block ? normalizeRuns(block).every((run) => run.italic) : false} disabled={disabled} onClick={() => onMark("italic")}>
        <span className="italic">I</span>
      </ToolButton>
      <ToolButton
        label="Underline"
        pressed={block ? normalizeRuns(block).every((run) => run.underline) : false}
        disabled={disabled}
        onClick={() => onMark("underline")}
      >
        <span className="underline">U</span>
      </ToolButton>
      <SwatchMenu
        label="Text color"
        disabled={disabled}
        colors={TEXT_COLORS}
        value={block?.color ?? "000000"}
        onChange={(color) => {
          if (color) onPatch({ color });
        }}
        swatch={<span className="border-b-[3px] px-0.5 font-semibold" style={{ borderColor: `#${block?.color ?? "000000"}` }}>A</span>}
      />
      <SwatchMenu
        label="Highlight color"
        disabled={disabled}
        colors={HIGHLIGHT_COLORS}
        value={block?.highlight ?? null}
        allowEmpty
        onChange={(highlight) => onPatch({ highlight })}
        swatch={<span className="rounded px-0.5 font-semibold" style={{ backgroundColor: block?.highlight ? `#${block.highlight}` : "transparent" }}>H</span>}
      />
      <LinkMenu link={block?.link ?? ""} disabled={disabled} onChange={(link) => onPatch({ link })} />
      <ToolButton label="Insert image" onClick={onInsertImage}>
        <ImageIcon />
      </ToolButton>
      <BarGap />
      <ToolButton label="Align left" pressed={block?.align === "left"} disabled={disabled} onClick={() => onPatch({ align: "left" })}>
        <AlignIcon align="left" />
      </ToolButton>
      <ToolButton label="Align center" pressed={block?.align === "center"} disabled={disabled} onClick={() => onPatch({ align: "center" })}>
        <AlignIcon align="center" />
      </ToolButton>
      <ToolButton label="Align right" pressed={block?.align === "right"} disabled={disabled} onClick={() => onPatch({ align: "right" })}>
        <AlignIcon align="right" />
      </ToolButton>
      <ToolButton label="Justify" pressed={block?.align === "justify"} disabled={disabled} onClick={() => onPatch({ align: "justify" })}>
        <AlignIcon align="justify" />
      </ToolButton>
      <SpacingMenu value={block?.lineSpacing ?? 1.3} disabled={disabled} onChange={(lineSpacing) => onPatch({ lineSpacing })} />
      <BarGap />
      <ToolButton label="Checklist" pressed={block?.list === "check"} disabled={disabled} onClick={() => onPatch({ list: block?.list === "check" ? "none" : "check" })}>
        <span>☐</span>
      </ToolButton>
      <ToolButton label="Bulleted list" pressed={block?.list === "bullet"} disabled={disabled} onClick={() => onPatch({ list: block?.list === "bullet" ? "none" : "bullet" })}>
        <span>•</span>
      </ToolButton>
      <ToolButton label="Numbered list" pressed={block?.list === "number"} disabled={disabled} onClick={() => onPatch({ list: block?.list === "number" ? "none" : "number" })}>
        <span>1.</span>
      </ToolButton>
      <ToolButton
        label="Decrease indent"
        disabled={disabled || (block?.indent ?? 0) <= 0}
        onClick={() => onPatch({ indent: Math.max(0, (block?.indent ?? 0) - 1) })}
      >
        <IndentIcon direction="decrease" />
      </ToolButton>
      <ToolButton
        label="Increase indent"
        disabled={disabled || (block?.indent ?? 0) >= 8}
        onClick={() => onPatch({ indent: Math.min(8, (block?.indent ?? 0) + 1) })}
      >
        <IndentIcon direction="increase" />
      </ToolButton>
      <ToolButton
        label="Clear formatting"
        disabled={disabled}
        onClick={() =>
          onPatch({
            font: "Calibri",
            sizePt: 12,
            bold: false,
            italic: false,
            underline: false,
            color: "000000",
            highlight: null,
            align: "left",
            lineSpacing: 1.3,
            list: "none",
            indent: 0,
            link: "",
          })
        }
      >
        <span className="text-xs line-through">T</span>
      </ToolButton>
    </div>
  );
}

function SizeField({ size, disabled, onChange }: { size: number; disabled: boolean; onChange: (sizePt: number) => void }) {
  const [draft, setDraft] = useState(String(size));

  useEffect(() => {
    setDraft(String(size));
  }, [size]);

  return (
    <input
      aria-label="Font size"
      type="number"
      min={MIN_FONT_SIZE}
      max={MAX_FONT_SIZE}
      step={0.1}
      disabled={disabled}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        const sizePt = readFontSize(event.target.value);
        if (sizePt !== null) onChange(sizePt);
      }}
      onBlur={() => {
        const parsed = Number(draft);
        const sizePt = Number.isFinite(parsed) ? clampFontSize(parsed) : size;
        setDraft(String(sizePt));
        onChange(sizePt);
      }}
      className="w-14 rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-40"
    />
  );
}

function BarGap() {
  return <span className="mx-1 h-6 w-px bg-slate-200" />;
}

function useDismiss(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const close = () => onClose();
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open, onClose]);
}

function HistoryButton({
  label,
  disabled,
  direction,
  onClick,
}: {
  label: string;
  disabled: boolean;
  direction: "undo" | "redo";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md p-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-30"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        {direction === "undo" ? (
          <path
            fill="currentColor"
            d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L3 8v9h9l-2.62-2.62A7.96 7.96 0 0 1 12.5 12c3.73 0 6.84 2.55 7.73 6h2.08c-.96-4.57-4.96-8-9.81-8z"
          />
        ) : (
          <path
            fill="currentColor"
            d="M18.4 10.6A9.95 9.95 0 0 0 11.5 8c-4.85 0-8.85 3.43-9.81 8h2.08a8.01 8.01 0 0 1 7.73-6c1.7 0 3.26.53 4.54 1.42L13 14h9V5l-2.6 2.6z"
          />
        )}
      </svg>
    </button>
  );
}

function ToolButton({
  label,
  pressed = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`rounded-md px-1.5 py-1 text-sm text-slate-800 hover:bg-slate-100 disabled:opacity-30 ${
        pressed ? "bg-blue-100 text-blue-800" : ""
      }`}
    >
      {children}
    </button>
  );
}

function SwatchMenu({
  label,
  disabled,
  colors,
  value,
  allowEmpty = false,
  swatch,
  onChange,
}: {
  label: string;
  disabled: boolean;
  colors: readonly string[];
  value: string | null;
  allowEmpty?: boolean;
  swatch: ReactNode;
  onChange: (color: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  useDismiss(open, () => setOpen(false));
  return (
    <div className="relative" onPointerDown={(event) => event.stopPropagation()}>
      <ToolButton label={label} disabled={disabled} pressed={open} onClick={() => setOpen((current) => !current)}>
        {swatch}
      </ToolButton>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1 flex w-40 flex-wrap gap-1 rounded-md border border-slate-200 bg-white p-2 shadow">
          {allowEmpty ? (
            <button type="button" className="w-full rounded px-1 py-0.5 text-left text-xs hover:bg-slate-100" onClick={() => { onChange(null); setOpen(false); }}>
              None
            </button>
          ) : null}
          {colors.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={color}
              className={`h-5 w-5 rounded-full border ${value === color ? "border-slate-900" : "border-slate-300"}`}
              style={{ backgroundColor: `#${color}` }}
              onClick={() => {
                onChange(color);
                setOpen(false);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SpacingMenu({
  value,
  disabled,
  onChange,
}: {
  value: LineSpacing;
  disabled: boolean;
  onChange: (spacing: LineSpacing) => void;
}) {
  const [open, setOpen] = useState(false);
  useDismiss(open, () => setOpen(false));
  return (
    <div className="relative" onPointerDown={(event) => event.stopPropagation()}>
      <ToolButton label="Line spacing" disabled={disabled} pressed={open} onClick={() => setOpen((current) => !current)}>
        <span className="text-xs">↕</span>
      </ToolButton>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1 w-28 rounded-md border border-slate-200 bg-white py-1 shadow">
          {LINE_SPACINGS.map((spacing) => (
            <button
              key={spacing}
              type="button"
              className={`block w-full px-3 py-1 text-left text-sm hover:bg-slate-100 ${spacing === value ? "bg-blue-50" : ""}`}
              onClick={() => {
                onChange(spacing);
                setOpen(false);
              }}
            >
              {spacing}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LinkMenu({ link, disabled, onChange }: { link: string; disabled: boolean; onChange: (link: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(link);
  const [error, setError] = useState("");
  useDismiss(open, () => setOpen(false));

  useEffect(() => {
    setDraft(link);
    setError("");
  }, [link]);

  return (
    <div className="relative" onPointerDown={(event) => event.stopPropagation()}>
      <ToolButton label="Insert link" disabled={disabled} pressed={open || link !== ""} onClick={() => setOpen((current) => !current)}>
        <span className="text-xs">🔗</span>
      </ToolButton>
      {open ? (
        <form
          className="absolute left-0 top-full z-20 mt-1 w-64 rounded-md border border-slate-200 bg-white p-2 shadow"
          onSubmit={(event) => {
            event.preventDefault();
            const next = draft.trim();
            if (next !== "" && !isWebLink(next)) {
              setError("Use an http or https link.");
              return;
            }
            onChange(next);
            setOpen(false);
          }}
        >
          <input
            aria-label="Link address"
            value={draft}
            placeholder="https://"
            onChange={(event) => setDraft(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
          <div className="mt-2 flex gap-2">
            <button type="submit" className="rounded-md bg-slate-900 px-2 py-1 text-xs text-white">
              Apply
            </button>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs text-slate-600"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Remove
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function BrushIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="currentColor" d="M7 16c.6 1.5 1.2 3 3 3 2.2 0 2.5-2 4-2 1 0 2 .5 3 1.2V14H7v2zm11-8 1-4H5l1 4h12zM6 10h12v2H6v-2z" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="currentColor" d="M5 5h14v14H5V5zm2 2v7.2l2.4-2.4 2.1 2.1 3-3.6L17 14.5V7H7zm0 10h10v-1.2l-2.6-3.2-3 3.6-2.1-2.1L7 16.6V17zm2.2-6.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z" />
    </svg>
  );
}

function AlignIcon({ align }: { align: TextAlign }) {
  const widths = align === "center" ? [14, 8, 14] : align === "right" ? [10, 14, 8] : align === "justify" ? [14, 14, 14] : [14, 10, 12];
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      {widths.map((width, index) => (
        <rect key={index} x={align === "right" ? 18 - width : align === "center" ? (24 - width) / 2 : 5} y={6 + index * 4} width={width} height="2" fill="currentColor" />
      ))}
    </svg>
  );
}

function IndentIcon({ direction }: { direction: "increase" | "decrease" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="currentColor" d={direction === "increase" ? "M4 6h16v2H4V6zm6 4h10v2H10v-2zm0 4h10v2H10v-2zM4 18h16v2H4v-2zM4 10l4 3-4 3v-6z" : "M4 6h16v2H4V6zm6 4h10v2H10v-2zm0 4h10v2H10v-2zM4 18h16v2H4v-2zM8 10v6l-4-3 4-3z"} />
    </svg>
  );
}

function PaletteCard({
  title,
  detail,
  onDrag,
  onAdd,
}: {
  title: string;
  detail: string;
  onDrag: () => void;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      draggable
      onPointerDown={() => {
        suppressPaletteClick = false;
      }}
      onDragStart={(event) => {
        suppressPaletteClick = true;
        onDrag();
        event.dataTransfer.setData("text/plain", title);
        event.dataTransfer.effectAllowed = "copy";
      }}
      onClick={() => {
        if (suppressPaletteClick) return;
        onAdd();
      }}
      className="w-full cursor-grab rounded-2xl border-2 border-slate-300 bg-white px-3 py-3 text-left active:cursor-grabbing"
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </button>
  );
}

function DocumentText({
  block,
  editing,
  onText,
}: {
  block: EditorText;
  editing: boolean;
  onText: (text: string, runs: InlineRun[]) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const writing = useRef(false);
  const runs = normalizeRuns(block);
  const items = splitItems(runs);
  const signature = JSON.stringify(runs);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const editors = [...root.querySelectorAll<HTMLElement>("[data-editor]")];
    editors.forEach((editor, index) => {
      const item = items[index] ?? [];
      if (sameRuns(readRuns(editor), item)) return;
      const active = document.activeElement === editor;
      const caret = active ? caretOffset(editor) : null;
      writing.current = true;
      editor.innerHTML = runHtml(item);
      writing.current = false;
      if (caret !== null) placeCaret(editor, caret);
    });
  }, [signature]);

  useEffect(() => {
    if (!editing) return;
    const editor = rootRef.current?.querySelector<HTMLElement>("[data-editor]");
    if (editor && !rootRef.current?.contains(document.activeElement)) editor.focus();
  }, [editing]);

  function emit(nextItems: InlineRun[][]) {
    const next = joinItems(nextItems);
    onText(plainText(next), next);
  }

  function onItemKeyDown(event: ReactKeyboardEvent<HTMLDivElement>, index: number) {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "a") {
      event.preventDefault();
      selectAllLines(rootRef.current);
      return;
    }
    const picked = spannedSelection();
    if (picked && (event.key === "Backspace" || event.key === "Delete")) {
      event.preventDefault();
      replaceSpanned(picked.start, picked.end, "");
      return;
    }
    if (picked && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      replaceSpanned(picked.start, picked.end, event.key);
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    const editor = event.currentTarget;
    const caret = caretOffset(editor) ?? 0;
    const item = items[index] ?? [];
    if (block.list !== "none" && event.shiftKey) {
      emit(items.map((entry, itemIndex) => (itemIndex === index ? insertText(entry, caret, "\u2028", styleAt(entry, caret)) : entry)));
      focusItem(rootRef.current, index, caret + 1);
      return;
    }
    if (block.list !== "none") {
      const before = sliceRuns(item, 0, caret);
      const after = sliceRuns(item, caret, plainText(item).length);
      emit([...items.slice(0, index), before, after, ...items.slice(index + 1)]);
      focusItem(rootRef.current, index + 1, 0);
      return;
    }
    const start = itemStart(items, index);
    const next = insertText(runs, start + caret, "\n", styleAt(runs, start + caret));
    onText(plainText(next), next);
    focusItem(rootRef.current, index + 1, 0);
  }

  function onRootPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!editing || event.button !== 0 || event.detail > 1) return;
    const root = rootRef.current;
    if (!root) return;
    const anchor = textPoint(root, event.clientX, event.clientY);
    if (!anchor) return;
    event.preventDefault();
    const host = [...root.querySelectorAll<HTMLElement>("[data-editor]")].find((editor) => editor.contains(anchor.node));
    host?.focus();
    const selection = window.getSelection();
    selection?.setBaseAndExtent(anchor.node, anchor.offset, anchor.node, anchor.offset);
    const startX = event.clientX;
    const startY = event.clientY;
    let dragged = false;
    const move = (ev: PointerEvent) => {
      if (!dragged && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
      dragged = true;
      const focus = textPoint(root, ev.clientX, ev.clientY);
      if (!focus) return;
      window.getSelection()?.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!dragged) return;
      const focus = textPoint(root, ev.clientX, ev.clientY);
      if (!focus) return;
      window.getSelection()?.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function spannedSelection(): { start: number; end: number } | null {
    const root = rootRef.current;
    const picked = root ? selectionInBlock(root) : null;
    if (!root || !picked) return null;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    const editors = [...root.querySelectorAll<HTMLElement>("[data-editor]")];
    const startEditor = editors.find((editor) => editor.contains(range.startContainer));
    const endEditor = editors.find((editor) => editor.contains(range.endContainer));
    if (!startEditor || !endEditor || startEditor === endEditor) return null;
    return picked;
  }

  function replaceSpanned(start: number, end: number, text: string) {
    const style = styleAt(runs, start);
    const next = mergeRuns([...sliceRuns(runs, 0, start), { ...style, text }, ...sliceRuns(runs, end, plainText(runs).length)]);
    onText(plainText(next), next);
    const nextItems = splitItems(next);
    let count = 0;
    const caret = start + text.length;
    for (let itemIndex = 0; itemIndex < nextItems.length; itemIndex += 1) {
      const length = plainText(nextItems[itemIndex] ?? []).length;
      if (count + length >= caret || itemIndex === nextItems.length - 1) {
        focusItem(rootRef.current, itemIndex, caret - count);
        return;
      }
      count += length + 1;
    }
  }

  return (
    <div
      ref={rootRef}
      onPointerDown={onRootPointerDown}
      className="w-full"
      style={{
        paddingLeft: block.indent * 24,
        color: `#${block.color}`,
        backgroundColor: block.highlight ? `#${block.highlight}` : "transparent",
        fontFamily: block.font,
        fontSize: `${block.sizePt}pt`,
        textAlign: block.align === "justify" ? "justify" : block.align,
        lineHeight: block.lineSpacing,
      }}
    >
      {items.map((item, index) => (
        <div key={index} className="flex items-start" data-item={index}>
          {block.list !== "none" ? (
            <span contentEditable={false} className="w-7 shrink-0 select-none">
              {listMarker(block.list, index)}
            </span>
          ) : null}
          <div
            data-editor
            contentEditable={editing}
            suppressContentEditableWarning
            role="textbox"
            spellCheck={false}
            onInput={(event) => {
              if (writing.current) return;
              const nextItems = items.map((entry, itemIndex) => (itemIndex === index ? readRuns(event.currentTarget) : entry));
              emit(nextItems);
            }}
            onBeforeInput={(event) => {
              const picked = spannedSelection();
              if (!picked) return;
              const input = event.nativeEvent;
              if (!(input instanceof InputEvent)) return;
              if (input.inputType.startsWith("delete")) {
                event.preventDefault();
                replaceSpanned(picked.start, picked.end, "");
                return;
              }
              if (input.inputType === "insertText" || input.inputType === "insertCompositionText") {
                event.preventDefault();
                replaceSpanned(picked.start, picked.end, input.data ?? "");
              }
            }}
            onCopy={(event) => {
              const picked = spannedSelection();
              if (!picked) return;
              event.preventDefault();
              event.clipboardData.setData("text/plain", plainText(runs).slice(picked.start, picked.end));
            }}
            onCut={(event) => {
              const picked = spannedSelection();
              if (!picked) return;
              event.preventDefault();
              event.clipboardData.setData("text/plain", plainText(runs).slice(picked.start, picked.end));
              replaceSpanned(picked.start, picked.end, "");
            }}
            onPaste={(event) => {
              const picked = spannedSelection();
              if (!picked) return;
              event.preventDefault();
              replaceSpanned(picked.start, picked.end, event.clipboardData.getData("text/plain"));
            }}
            onKeyDown={(event) => onItemKeyDown(event, index)}
            className={`min-w-0 flex-1 whitespace-pre-wrap outline-none ${editing ? "cursor-text select-text" : ""}`}
          />
        </div>
      ))}
    </div>
  );
}

function sameRuns(left: InlineRun[], right: InlineRun[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function styleAt(runs: InlineRun[], index: number): Omit<InlineRun, "text"> {
  let count = 0;
  for (const run of runs) {
    if (count + run.text.length >= Math.max(index, 1)) return { bold: run.bold, italic: run.italic, underline: run.underline };
    count += run.text.length;
  }
  const last = runs[runs.length - 1];
  return { bold: last?.bold ?? false, italic: last?.italic ?? false, underline: last?.underline ?? false };
}

function itemStart(items: InlineRun[][], index: number): number {
  let count = 0;
  for (let itemIndex = 0; itemIndex < index; itemIndex += 1) count += plainText(items[itemIndex] ?? []).length + 1;
  return count;
}

function textPoint(root: HTMLElement, x: number, y: number): { node: Node; offset: number } | null {
  const editors = [...root.querySelectorAll<HTMLElement>("[data-editor]")];
  if (editors.length === 0) return null;
  const direct = caretAt(x, y);
  if (direct && editors.some((editor) => editor.contains(direct.node))) return direct;
  let editor = editors[0];
  for (const item of editors) {
    if (y >= item.getBoundingClientRect().top) editor = item;
  }
  const rect = editor.getBoundingClientRect();
  const localX = Math.min(Math.max(x, rect.left + 1), Math.max(rect.left + 1, rect.right - 1));
  const localY = Math.min(Math.max(y, rect.top + 1), Math.max(rect.top + 1, rect.bottom - 1));
  const snapped = caretAt(localX, localY);
  if (snapped && editor.contains(snapped.node)) return snapped;
  return x <= rect.left + rect.width / 2 ? { node: editor, offset: 0 } : { node: editor, offset: editor.childNodes.length };
}

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = doc.caretPositionFromPoint?.(x, y);
  if (position) return { node: position.offsetNode, offset: position.offset };
  const range = doc.caretRangeFromPoint?.(x, y);
  if (!range) return null;
  return { node: range.startContainer, offset: range.startOffset };
}

function selectAllLines(root: HTMLDivElement | null) {
  if (!root) return;
  const editors = [...root.querySelectorAll<HTMLElement>("[data-editor]")];
  if (editors.length === 0) return;
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  const last = editors[editors.length - 1];
  range.setStart(editors[0], 0);
  range.setEnd(last, last.childNodes.length);
  selection.removeAllRanges();
  selection.addRange(range);
}

function focusItem(root: HTMLDivElement | null, index: number, caret: number) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const editor = root?.querySelectorAll<HTMLElement>("[data-editor]")[index];
      if (!editor) return;
      editor.focus();
      placeCaret(editor, caret);
    });
  });
}

function listMarker(list: TextList, index: number): string {
  if (list === "bullet") return "•";
  if (list === "number") return `${index + 1}.`;
  if (list === "check") return "☐";
  return "";
}

function fitChrome<T extends EditorBlock>(block: T, layer: "page" | "header" | "footer", pageHeight = PAGE_HEIGHT): T {
  if (layer === "header") return { ...block, yPx: Math.min(block.yPx, 36) };
  if (layer === "footer") return { ...block, yPx: Math.max(block.yPx, pageHeight - 72) };
  return block;
}

function boxWidth(block: EditorBlock, pageWidth = PAGE_WIDTH): number {
  if (block.type === "text") return block.widthPx ?? Math.min(460, Math.max(160, pageWidth - block.xPx - 24));
  if (block.type === "line" || block.type === "table" || block.type === "image" || block.type === "columns") return block.widthPx;
  return Math.min(pageWidth - block.xPx - 16, Math.ceil(block.value.length * 9.2) + 24);
}

function BlockRow({
  block,
  pageWidth,
  quiet,
  raised,
  selected,
  editing,
  painting,
  onSelect,
  onText,
  onValue,
  onRows,
  onColumns,
  onMove,
  onResize,
}: {
  block: EditorBlock;
  pageWidth: number;
  quiet: boolean;
  raised: boolean;
  selected: boolean;
  editing: boolean;
  painting: boolean;
  onSelect: (shift: boolean) => void;
  onText: (text: string, runs: InlineRun[]) => void;
  onValue: (value: string) => void;
  onRows: (rows: string[][]) => void;
  onColumns: (text: string) => void;
  onMove: (event: ReactPointerEvent) => void;
  onResize: (corner: "nw" | "ne" | "sw" | "se", event: ReactPointerEvent) => void;
}) {
  const width = boxWidth(block, pageWidth);
  return (
    <div
      data-block-id={block.id}
      className={`absolute rounded-sm ${
        quiet
          ? "pointer-events-none z-[1]"
          : raised
            ? `z-30 ${selected ? "outline outline-2 outline-blue-500" : "hover:outline hover:outline-1 hover:outline-blue-300"}`
            : selected
              ? "z-10 outline outline-2 outline-blue-500"
              : "z-[1] hover:outline hover:outline-1 hover:outline-blue-300"
      } ${painting ? "cursor-copy" : editing || quiet ? "" : "cursor-move touch-none"}`}
      style={{ left: block.xPx, top: block.yPx, width }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(event.shiftKey);
      }}
      onPointerDown={(event) => {
        if (painting) {
          event.stopPropagation();
          return;
        }
        if (event.shiftKey) {
          event.stopPropagation();
          onSelect(true);
          return;
        }
        onSelect(false);
        if (block.type === "table" && isEditingField(event.target)) return;
        if (editing && isEditingField(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        onMove(event);
      }}
    >
      {selected && !editing && !quiet
        ? (["nw", "ne", "sw", "se"] as const).map((corner) => (
            <span
              key={corner}
              role="presentation"
              onPointerDown={(event) => onResize(corner, event)}
              className={`absolute z-20 h-2.5 w-2.5 rounded-sm border border-blue-500 bg-white ${
                corner === "nw" ? "-left-1 -top-1 cursor-nwse-resize" : ""
              } ${corner === "ne" ? "-right-1 -top-1 cursor-nesw-resize" : ""} ${
                corner === "sw" ? "-bottom-1 -left-1 cursor-nesw-resize" : ""
              } ${corner === "se" ? "-bottom-1 -right-1 cursor-nwse-resize" : ""}`}
            />
          ))
        : null}
      {block.type === "text" ? <DocumentText block={block} editing={editing} onText={onText} /> : null}
      {block.type === "variable" ? <VariableField value={block.value} editing={editing} onChange={onValue} /> : null}
      {block.type === "line" ? (
        <div className="flex h-3 cursor-grab items-center active:cursor-grabbing">
          <div className="h-px w-full bg-slate-900" />
        </div>
      ) : null}
      {block.type === "table" ? <DocumentTable rows={block.rows} onRows={onRows} /> : null}
      {block.type === "columns" ? <DocumentColumns block={block} editing={editing} onText={onColumns} /> : null}
      {block.type === "image" ? (
        <img
          alt="Template image"
          draggable={false}
          src={`data:${block.mime};base64,${block.dataBase64}`}
          style={{ width: block.widthPx }}
          className="h-auto"
        />
      ) : null}
    </div>
  );
}

function isEditingField(target: EventTarget | null): boolean {
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) return !target.readOnly && !target.disabled;
  if (target instanceof HTMLSelectElement) return !target.disabled;
  return false;
}

function SelectionSettings({
  block,
  onPatch,
  onCopy,
  onRemove,
}: {
  block: EditorBlock;
  onPatch: (patch: Partial<EditorText> | Partial<EditorImage> | Partial<EditorVariable> | Partial<EditorLine> | Partial<EditorTable> | Partial<EditorColumns>) => void;
  onCopy: () => void;
  onRemove: () => void;
}) {
  return (
    <section className="rounded-2xl border-2 border-slate-300 bg-white p-3">
      {block.type === "text" ? <TextSettings block={block} onPatch={onPatch} /> : null}
      {block.type === "variable" ? (
        <VariableSettings value={block.value} onChange={(value) => onPatch({ value })} />
      ) : null}
      {block.type === "line" ? <LineSettings block={block} onPatch={onPatch} /> : null}
      {block.type === "table" ? <TableSettings block={block} onPatch={onPatch} /> : null}
      {block.type === "columns" ? <ColumnsSettings block={block} onPatch={onPatch} /> : null}
      {block.type === "image" ? <ImageSettings block={block} onPatch={onPatch} /> : null}
      <div className="mt-3 flex gap-3">
        <button type="button" onClick={onCopy} className="text-xs font-medium text-slate-700">
          Copy
        </button>
        <button type="button" onClick={onRemove} className="text-xs font-medium text-slate-500">
          Remove from page
        </button>
      </div>
    </section>
  );
}

function TextSettings({
  block,
  onPatch,
}: {
  block: EditorText;
  onPatch: (patch: Partial<EditorText>) => void;
}) {
  const [sizeDraft, setSizeDraft] = useState(String(block.sizePt));

  useEffect(() => {
    setSizeDraft(String(block.sizePt));
  }, [block.id, block.sizePt]);

  return (
    <div>
      <h2 className="text-sm font-medium">Text</h2>
      <label className="mt-3 flex flex-col gap-1 text-xs text-slate-600">
        Font
        <select
          value={block.font}
          onChange={(event) => onPatch({ font: event.target.value as FontName })}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
        >
          {FONTS.map((font) => (
            <option key={font} value={font}>
              {font}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 flex flex-col gap-1 text-xs text-slate-600">
        Size
        <input
          type="number"
          min={MIN_FONT_SIZE}
          max={MAX_FONT_SIZE}
          step={0.1}
          value={sizeDraft}
          onChange={(event) => {
            setSizeDraft(event.target.value);
            const sizePt = readFontSize(event.target.value);
            if (sizePt !== null) onPatch({ sizePt });
          }}
          onBlur={() => {
            const parsed = Number(sizeDraft);
            const sizePt = Number.isFinite(parsed) ? clampFontSize(parsed) : block.sizePt;
            setSizeDraft(String(sizePt));
            onPatch({ sizePt });
          }}
          className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
      </label>
    </div>
  );
}

function VariableField({
  value,
  editing,
  onChange,
}: {
  value: string;
  editing: boolean;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  return (
    <input
      ref={ref}
      aria-label="Variable text"
      value={value}
      placeholder="Variable"
      readOnly={!editing}
      size={Math.max(value.length, 8)}
      onChange={(event) => onChange(event.target.value)}
      style={{ fontFamily: "Calibri", fontSize: "12pt", lineHeight: 1, padding: 0, width: "100%" }}
      className={`bg-transparent text-slate-900 outline-none placeholder:text-slate-400 ${editing ? "select-text" : "pointer-events-none"}`}
    />
  );
}

function DocumentColumns({
  block,
  editing,
  onText,
}: {
  block: EditorColumns;
  editing: boolean;
  onText: (text: string) => void;
}) {
  if (block.text.includes(COLUMN_BREAK)) return <SplitColumns block={block} editing={editing} onText={onText} />;
  return <FlowColumns block={block} editing={editing} onText={onText} />;
}

function columnStyle(block: EditorColumns): CSSProperties {
  return {
    fontFamily: block.font,
    fontSize: `${block.sizePt}pt`,
    lineHeight: block.lineSpacing,
    color: `#${block.color}`,
    whiteSpace: "pre-wrap",
  };
}

function SplitColumns({
  block,
  editing,
  onText,
}: {
  block: EditorColumns;
  editing: boolean;
  onText: (text: string) => void;
}) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const writing = useRef(false);
  const parts = block.text.split(COLUMN_BREAK);
  const left = parts[0] ?? "";
  const right = parts.slice(1).join(COLUMN_BREAK);

  useLayoutEffect(() => {
    if (writing.current) return;
    const panes = [
      [leftRef.current, left],
      [rightRef.current, right],
    ] as const;
    for (const [element, text] of panes) {
      if (!element) continue;
      if (element.innerText.replace(/\n$/, "") !== text) element.innerText = text;
    }
  }, [left, right]);

  useEffect(() => {
    if (editing) leftRef.current?.focus();
  }, [editing]);

  function publish() {
    const nextLeft = leftRef.current?.innerText.replace(/\n$/, "") ?? "";
    const nextRight = rightRef.current?.innerText.replace(/\n$/, "") ?? "";
    onText(`${nextLeft}${COLUMN_BREAK}${nextRight}`.slice(0, MAX_COLUMNS_TEXT));
  }

  function pastePlain(event: ReactClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text/plain").replaceAll(COLUMN_BREAK, "");
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    selection.deleteFromDocument();
    selection.getRangeAt(0).insertNode(document.createTextNode(pasted));
    selection.collapseToEnd();
    writing.current = true;
    publish();
  }

  const pane = `${editing ? "min-w-0 flex-1 outline-none" : "min-w-0 flex-1 pointer-events-none"}`;

  return (
    <div className="flex" style={{ gap: COLUMN_GAP_PX }}>
      <div
        ref={leftRef}
        contentEditable={editing}
        suppressContentEditableWarning
        spellCheck={false}
        role="textbox"
        aria-label="Left column"
        className={pane}
        style={columnStyle(block)}
        onInput={() => {
          writing.current = true;
          publish();
        }}
        onBlur={() => {
          writing.current = false;
        }}
        onPaste={pastePlain}
      />
      <div
        ref={rightRef}
        contentEditable={editing}
        suppressContentEditableWarning
        spellCheck={false}
        role="textbox"
        aria-label="Right column"
        className={pane}
        style={columnStyle(block)}
        onInput={() => {
          writing.current = true;
          publish();
        }}
        onBlur={() => {
          writing.current = false;
        }}
        onPaste={pastePlain}
      />
    </div>
  );
}

function FlowColumns({
  block,
  editing,
  onText,
}: {
  block: EditorColumns;
  editing: boolean;
  onText: (text: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const writing = useRef(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || writing.current) return;
    const current = element.innerText.replace(/\n$/, "");
    if (current !== block.text) element.innerText = block.text;
  }, [block.text]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const full = element.parentElement?.clientWidth ?? element.clientWidth;
    const column = Math.max(40, Math.floor((full - COLUMN_GAP_PX) / 2));
    element.style.width = `${column}px`;
    element.style.columnCount = "1";
    element.style.height = "auto";
    const single = element.scrollHeight;
    element.style.width = "";
    element.style.columnCount = "2";
    const line = block.sizePt * (96 / 72) * block.lineSpacing;
    element.style.height = `${Math.max(line * 2, Math.ceil(single / 2) + line)}px`;
  });

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  return (
    <div className="relative">
      {block.text === "" && !editing ? (
        <span className="pointer-events-none absolute inset-0 text-slate-400">Paste text here. It flows down the left column, then the right.</span>
      ) : null}
      <div
        ref={ref}
        contentEditable={editing}
        suppressContentEditableWarning
        spellCheck={false}
        role="textbox"
        aria-label="Two columns"
        onInput={(event) => {
          writing.current = true;
          onText(event.currentTarget.innerText.replace(/\n$/, "").slice(0, MAX_COLUMNS_TEXT));
        }}
        onBlur={() => {
          writing.current = false;
        }}
        onPaste={(event) => {
          event.preventDefault();
          const pasted = event.clipboardData.getData("text/plain");
          const selection = window.getSelection();
          if (!selection || selection.rangeCount === 0) return;
          selection.deleteFromDocument();
          selection.getRangeAt(0).insertNode(document.createTextNode(pasted));
          selection.collapseToEnd();
          writing.current = true;
          onText((event.currentTarget as HTMLDivElement).innerText.replace(/\n$/, "").slice(0, MAX_COLUMNS_TEXT));
        }}
        className={editing ? "outline-none" : "pointer-events-none"}
        style={{
          columnGap: COLUMN_GAP_PX,
          columnFill: "balance",
          ...columnStyle(block),
        }}
      />
    </div>
  );
}

function ColumnsSettings({
  block,
  onPatch,
}: {
  block: EditorColumns;
  onPatch: (patch: Partial<EditorColumns>) => void;
}) {
  const [sizeDraft, setSizeDraft] = useState(String(block.sizePt));

  useEffect(() => {
    setSizeDraft(String(block.sizePt));
  }, [block.id, block.sizePt]);

  return (
    <div>
      <h2 className="text-sm font-medium">Columns</h2>
      <p className="mt-1 text-xs text-slate-500">Text fills the left column, then continues in the right. Useful for long terms.</p>
      <label className="mt-3 flex flex-col gap-1 text-xs text-slate-600">
        Font
        <select
          value={block.font}
          onChange={(event) => onPatch({ font: event.target.value as FontName })}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
        >
          {FONTS.map((font) => (
            <option key={font} value={font}>
              {font}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 flex flex-col gap-1 text-xs text-slate-600">
        Size
        <input
          type="number"
          min={MIN_FONT_SIZE}
          max={MAX_FONT_SIZE}
          step={0.1}
          value={sizeDraft}
          onChange={(event) => {
            setSizeDraft(event.target.value);
            const sizePt = readFontSize(event.target.value);
            if (sizePt !== null) onPatch({ sizePt });
          }}
          onBlur={() => {
            const parsed = Number(sizeDraft);
            const sizePt = Number.isFinite(parsed) ? clampFontSize(parsed) : block.sizePt;
            setSizeDraft(String(sizePt));
            onPatch({ sizePt });
          }}
          className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="mt-3 flex flex-col gap-1 text-xs text-slate-600">
        Line spacing
        <select
          value={block.lineSpacing}
          onChange={(event) => onPatch({ lineSpacing: Number(event.target.value) as LineSpacing })}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
        >
          {LINE_SPACINGS.map((spacing) => (
            <option key={spacing} value={spacing}>
              {spacing}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function DocumentTable({ rows, onRows }: { rows: string[][]; onRows: (rows: string[][]) => void }) {
  function write(rowIndex: number, columnIndex: number, text: string) {
    onRows(
      rows.map((item, index) =>
        index === rowIndex ? item.map((value, cellIndex) => (cellIndex === columnIndex ? text.slice(0, MAX_CELL_TEXT) : value)) : item,
      ),
    );
  }

  function focusCell(rowIndex: number, columnIndex: number) {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>(`[data-cell="${rowIndex}-${columnIndex}"]`)?.focus();
    });
  }

  return (
    <table className="w-full border-collapse" style={{ fontFamily: "Calibri", fontSize: "11pt" }}>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, columnIndex) => (
              <td key={columnIndex} className="border border-slate-900 p-0 align-top">
                <CellField
                  label={`Row ${rowIndex + 1} column ${columnIndex + 1}`}
                  cellKey={`${rowIndex}-${columnIndex}`}
                  value={cell}
                  onChange={(text) => write(rowIndex, columnIndex, text)}
                  onTab={(shift) => {
                    const columns = row.length;
                    let nextRow = rowIndex;
                    let nextColumn = columnIndex + (shift ? -1 : 1);
                    if (nextColumn >= columns) {
                      nextColumn = 0;
                      nextRow += 1;
                    }
                    if (nextColumn < 0) {
                      nextColumn = columns - 1;
                      nextRow -= 1;
                    }
                    if (nextRow >= rows.length) {
                      onRows(addTableRow(rows));
                      focusCell(nextRow, nextColumn);
                      return;
                    }
                    if (nextRow >= 0) focusCell(nextRow, nextColumn);
                  }}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CellField({
  label,
  cellKey,
  value,
  onChange,
  onTab,
}: {
  label: string;
  cellKey: string;
  value: string;
  onChange: (text: string) => void;
  onTab: (shift: boolean) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      data-cell={cellKey}
      aria-label={label}
      value={value}
      rows={1}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Tab") {
          event.preventDefault();
          onTab(event.shiftKey);
        }
      }}
      className="block w-full resize-none overflow-hidden bg-transparent p-1 outline-none"
    />
  );
}

function VariableSettings({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <h2 className="text-sm font-medium">Variable</h2>
      <label className="mt-3 flex flex-col gap-1 text-xs text-slate-600">
        Text
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
        />
      </label>
      <p className="mt-2 text-xs text-slate-500">The document shows this text.</p>
    </div>
  );
}

function LineSettings({
  block,
  onPatch,
}: {
  block: EditorLine;
  onPatch: (patch: Partial<EditorLine>) => void;
}) {
  return (
    <WidthSetting
      title="Line"
      detail="Drag it anywhere on the page."
      value={block.widthPx}
      min={MIN_LINE_WIDTH}
      max={MAX_LINE_WIDTH}
      onChange={(widthPx) => onPatch({ widthPx: clampLineWidth(widthPx) })}
    />
  );
}

function TableSettings({
  block,
  onPatch,
}: {
  block: EditorTable;
  onPatch: (patch: Partial<EditorTable>) => void;
}) {
  const columns = block.rows[0]?.length ?? 1;
  return (
    <div>
      <WidthSetting
        title="Table"
        detail="Type in the cells. Drag the border to move it."
        value={block.widthPx}
        min={MIN_TABLE_WIDTH}
        max={MAX_TABLE_WIDTH}
        onChange={(widthPx) => onPatch({ widthPx: clampTableWidth(widthPx) })}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <SmallButton disabled={block.rows.length >= MAX_TABLE_ROWS} onClick={() => onPatch({ rows: addTableRow(block.rows) })}>
          Add row
        </SmallButton>
        <SmallButton disabled={columns >= MAX_TABLE_COLUMNS} onClick={() => onPatch({ rows: addTableColumn(block.rows) })}>
          Add column
        </SmallButton>
        <SmallButton disabled={block.rows.length <= 1} onClick={() => onPatch({ rows: removeTableRow(block.rows) })}>
          Remove row
        </SmallButton>
        <SmallButton disabled={columns <= 1} onClick={() => onPatch({ rows: removeTableColumn(block.rows) })}>
          Remove column
        </SmallButton>
      </div>
    </div>
  );
}

function WidthSetting({
  title,
  detail,
  value,
  min,
  max,
  onChange,
}: {
  title: string;
  detail: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  return (
    <div>
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
      <label className="mt-3 flex flex-col gap-1 text-xs text-slate-600">
        Width (px)
        <input
          type="number"
          min={min}
          max={max}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            const parsed = Number(event.target.value);
            if (Number.isInteger(parsed) && parsed >= min && parsed <= max) onChange(parsed);
          }}
          onBlur={() => {
            const parsed = Number(draft);
            const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : value;
            setDraft(String(next));
            onChange(next);
          }}
          className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
      </label>
    </div>
  );
}

function SmallButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function ImageSettings({
  block,
  onPatch,
}: {
  block: EditorImage;
  onPatch: (patch: Partial<EditorImage>) => void;
}) {
  const [widthDraft, setWidthDraft] = useState(String(block.widthPx));

  useEffect(() => {
    setWidthDraft(String(block.widthPx));
  }, [block.id, block.widthPx]);

  function applyWidth(widthPx: number) {
    onPatch({
      widthPx,
      heightPx: heightForWidth(widthPx, block.naturalWidth, block.naturalHeight),
    });
    setWidthDraft(String(widthPx));
  }

  return (
    <div>
      <h2 className="text-sm font-medium">Image</h2>
      <p className="mt-1 text-xs text-slate-500">Drag it anywhere on the page.</p>
      <label className="mt-3 flex flex-col gap-1 text-xs text-slate-600">
        Width (px)
        <input
          type="number"
          min={MIN_IMAGE_WIDTH}
          max={MAX_IMAGE_WIDTH}
          value={widthDraft}
          onChange={(event) => {
            setWidthDraft(event.target.value);
            const parsed = Number(event.target.value);
            if (Number.isInteger(parsed) && parsed >= MIN_IMAGE_WIDTH && parsed <= MAX_IMAGE_WIDTH) {
              applyWidth(parsed);
            }
          }}
          onBlur={() => {
            const parsed = Number(widthDraft);
            applyWidth(Number.isFinite(parsed) ? clampWidth(parsed) : block.widthPx);
          }}
          className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="mt-3 inline-flex cursor-pointer rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium">
        Choose image
        <input
          type="file"
          accept="image/png,image/jpeg"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void replaceImage(file, block, onPatch);
          }}
        />
      </label>
    </div>
  );
}

function MiniPage({ blocks, pageWidth, pageHeight, color }: { blocks: EditorBlock[]; pageWidth: number; pageHeight: number; color: string }) {
  const landscape = pageWidth > pageHeight;
  return (
    <span
      className={`relative rounded-md border border-slate-200 ${landscape ? "h-8 w-10" : "h-10 w-8"}`}
      style={{ backgroundColor: `#${color}` }}
    >
      {blocks.slice(0, 6).map((block) => (
        <span
          key={block.id}
          className={`absolute h-1 w-2 rounded-full ${block.type === "image" ? "bg-slate-400" : "bg-slate-500"}`}
          style={{
            left: `${(block.xPx / pageWidth) * 100}%`,
            top: `${(block.yPx / pageHeight) * 100}%`,
          }}
        />
      ))}
    </span>
  );
}

async function replaceImage(
  file: File,
  block: EditorImage,
  onPatch: (patch: Partial<EditorImage>) => void,
) {
  if (file.type !== "image/png" && file.type !== "image/jpeg") return;
  const dataBase64 = await readBase64(file);
  const measured = await measure(file.type, dataBase64);
  onPatch({
    mime: file.type,
    dataBase64,
    naturalWidth: measured.width,
    naturalHeight: measured.height,
    heightPx: heightForWidth(block.widthPx, measured.width, measured.height),
  });
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Could not read that image."));
        return;
      }
      const base64 = reader.result.split(",")[1];
      if (!base64) {
        reject(new Error("Could not read that image."));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
}

function measure(mime: string, dataBase64: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = `data:${mime};base64,${dataBase64}`;
  });
}

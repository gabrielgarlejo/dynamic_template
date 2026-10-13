import type { InlineRun } from "../shared/template";

export type TextMark = "bold" | "italic" | "underline";

type StyledBlock = {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  runs?: InlineRun[];
};

export function normalizeRuns(block: StyledBlock): InlineRun[] {
  if (block.runs && block.runs.length > 0) return mergeRuns(block.runs);
  return [{ text: block.text, bold: block.bold, italic: block.italic, underline: block.underline }];
}

export function plainText(runs: InlineRun[]): string {
  return runs.map((run) => run.text).join("");
}

export function mergeRuns(runs: InlineRun[]): InlineRun[] {
  const merged: InlineRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const previous = merged[merged.length - 1];
    if (previous && previous.bold === run.bold && previous.italic === run.italic && previous.underline === run.underline) {
      previous.text += run.text;
    } else {
      merged.push({ ...run });
    }
  }
  return merged.length > 0 ? merged : [{ text: "", bold: false, italic: false, underline: false }];
}

export function splitItems(runs: InlineRun[]): InlineRun[][] {
  const items: InlineRun[][] = [[]];
  for (const run of runs) {
    const parts = run.text.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) items.push([]);
      items[items.length - 1].push({ ...run, text: part });
    });
  }
  return items.map((item) => mergeRuns(item));
}

export function joinItems(items: InlineRun[][]): InlineRun[] {
  const runs: InlineRun[] = [];
  items.forEach((item, index) => {
    const piece = mergeRuns(item);
    if (index > 0) {
      const last = runs[runs.length - 1];
      if (last) last.text += "\n";
      else runs.push({ text: "\n", bold: false, italic: false, underline: false });
    }
    for (const run of piece) {
      if (run.text) runs.push({ ...run });
    }
  });
  return mergeRuns(runs);
}

export function toggleMark(runs: InlineRun[], start: number, end: number, mark: TextMark): InlineRun[] {
  if (end <= start) return runs;
  const enable = !rangeHasMark(runs, start, end, mark);
  const chars = explode(runs);
  for (let index = start; index < end && index < chars.length; index += 1) chars[index][mark] = enable;
  return collapse(chars);
}

export function sliceRuns(runs: InlineRun[], start: number, end: number): InlineRun[] {
  return collapse(explode(runs).slice(start, end));
}

export function insertText(runs: InlineRun[], index: number, text: string, style: Omit<InlineRun, "text">): InlineRun[] {
  const chars = explode(runs);
  const added = [...text].map((ch) => ({ ch, bold: style.bold, italic: style.italic, underline: style.underline }));
  chars.splice(index, 0, ...added);
  return collapse(chars);
}

export function runHtml(runs: InlineRun[]): string {
  const html = mergeRuns(runs)
    .map((run) => {
      const body = escapeHtml(run.text).replaceAll("\u2028", "<br>");
      const style = [
        run.bold ? "font-weight:700" : "font-weight:400",
        run.italic ? "font-style:italic" : "font-style:normal",
        run.underline ? "text-decoration:underline" : "text-decoration:none",
      ].join(";");
      return `<span style="${style}">${body || "<br>"}</span>`;
    })
    .join("");
  return html || "<span><br></span>";
}

export function readRuns(root: HTMLElement): InlineRun[] {
  const runs: InlineRun[] = [];
  const walk = (node: Node, style: Omit<InlineRun, "text">) => {
    if (node.nodeType === Node.TEXT_NODE) {
      runs.push({ ...style, text: node.textContent ?? "" });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") {
      runs.push({ ...style, text: "\u2028" });
      return;
    }
    const next = {
      bold: style.bold || node.style.fontWeight === "700" || node.tagName === "STRONG" || node.tagName === "B",
      italic: style.italic || node.style.fontStyle === "italic" || node.tagName === "EM" || node.tagName === "I",
      underline: style.underline || node.style.textDecoration.includes("underline") || node.tagName === "U",
    };
    node.childNodes.forEach((child) => walk(child, next));
  };
  root.childNodes.forEach((child) => walk(child, { bold: false, italic: false, underline: false }));
  const merged = mergeRuns(runs);
  if (merged.length === 1 && merged[0].text === "\u2028") return [{ text: "", bold: false, italic: false, underline: false }];
  return merged;
}

export function caretOffset(root: HTMLElement): number | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;
  return nodeOffset(root, range.startContainer, range.startOffset);
}

export function placeCaret(root: HTMLElement, offset: number) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  const point = pointAt(root, offset);
  range.setStart(point.node, point.offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function selectionInBlock(block: HTMLElement): { start: number; end: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!block.contains(range.startContainer) || !block.contains(range.endContainer)) return null;
  const start = blockOffset(block, range.startContainer, range.startOffset);
  const end = blockOffset(block, range.endContainer, range.endOffset);
  return start === end ? null : { start: Math.min(start, end), end: Math.max(start, end) };
}

function blockOffset(block: HTMLElement, container: Node, offset: number): number {
  const items = [...block.querySelectorAll<HTMLElement>("[data-editor]")];
  let count = 0;
  for (let index = 0; index < items.length; index += 1) {
    if (index > 0) count += 1;
    const editor = items[index];
    if (editor.contains(container)) return count + nodeOffset(editor, container, offset);
    count += plainText(readRuns(editor)).length;
  }
  return count;
}

function nodeOffset(root: HTMLElement, container: Node, offset: number): number {
  let count = 0;
  const visit = (node: Node): boolean => {
    if (node === container) {
      if (node.nodeType === Node.TEXT_NODE) count += offset;
      else {
        const children = [...node.childNodes].slice(0, offset);
        for (const child of children) count += nodeLength(child);
      }
      return true;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      count += node.textContent?.length ?? 0;
      return false;
    }
    if (node instanceof HTMLElement && node.tagName === "BR") {
      count += 1;
      return false;
    }
    for (const child of node.childNodes) {
      if (visit(child)) return true;
    }
    return false;
  };
  visit(root);
  return count;
}

function pointAt(root: HTMLElement, target: number): { node: Node; offset: number } {
  let count = 0;
  const visit = (node: Node): { node: Node; offset: number } | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0;
      if (count + length >= target) return { node, offset: target - count };
      count += length;
      return null;
    }
    if (node instanceof HTMLElement && node.tagName === "BR") {
      if (count === target) return { node: node.parentNode ?? root, offset: indexOf(node) };
      count += 1;
      return null;
    }
    for (const child of node.childNodes) {
      const found = visit(child);
      if (found) return found;
    }
    return null;
  };
  return visit(root) ?? { node: root, offset: root.childNodes.length };
}

function nodeLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length ?? 0;
  if (node instanceof HTMLElement && node.tagName === "BR") return 1;
  return [...node.childNodes].reduce((sum, child) => sum + nodeLength(child), 0);
}

function indexOf(node: Node): number {
  return [...(node.parentNode?.childNodes ?? [])].indexOf(node as ChildNode);
}

function rangeHasMark(runs: InlineRun[], start: number, end: number, mark: TextMark): boolean {
  const chars = explode(runs).slice(start, end).filter((item) => item.ch !== "\n" && item.ch !== "\u2028");
  return chars.length > 0 && chars.every((item) => item[mark]);
}

function explode(runs: InlineRun[]): Array<Omit<InlineRun, "text"> & { ch: string }> {
  const chars: Array<Omit<InlineRun, "text"> & { ch: string }> = [];
  for (const run of runs) {
    for (const ch of run.text) chars.push({ ch, bold: run.bold, italic: run.italic, underline: run.underline });
  }
  return chars;
}

function collapse(chars: Array<Omit<InlineRun, "text"> & { ch: string }>): InlineRun[] {
  return mergeRuns(chars.map((item) => ({ text: item.ch, bold: item.bold, italic: item.italic, underline: item.underline })));
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

import { MAX_BLOCKS, PAGE_HEIGHT, PAGE_WIDTH, COLUMN_BREAK } from "../shared/template";
import { epangLogo } from "./epangLogo";
import {
  columnsBlock,
  imageBlock,
  textBlock,
  variableBlock,
  type EditorBlock,
  type EditorPage,
  type EditorTemplate,
} from "./model";
import { PROPOSAL_TERMS } from "./proposalTerms";

const LEFT = 56;
const FIELD_X = 528;
const TOP = 48;
const BOTTOM = PAGE_HEIGHT - 24;
const GAP = 10;
const HANDLE = 16;
const LOGO_WIDTH = 116;

function linePx(sizePt: number): number {
  return sizePt * (96 / 72) * 1.3;
}

function textHeight(text: string, sizePt: number): number {
  const fontPx = sizePt * (96 / 72);
  const charsPerLine = Math.max(1, Math.floor(460 / (fontPx * 0.55)));
  const lines = text.split("\n").reduce((count, line) => {
    return count + Math.max(1, Math.ceil(line.length / charsPerLine));
  }, 0);
  return HANDLE + lines * linePx(sizePt);
}

function columnsHeight(block: { text: string; sizePt: number; lineSpacing: number; widthPx: number }): number {
  const columnPx = Math.max(40, (block.widthPx - 19) / 2);
  const chars = Math.max(8, Math.floor(columnPx / (block.sizePt * (96 / 72) * 0.5)));
  const lines = block.text.split("\n").reduce((count, part) => count + Math.max(1, Math.ceil(part.length / chars)), 0);
  return HANDLE + Math.ceil(lines / 2) * block.sizePt * (96 / 72) * block.lineSpacing;
}

function blockHeight(block: EditorBlock): number {
  if (block.type === "image") return block.heightPx;
  if (block.type === "line") return 12;
  if (block.type === "table") return 36 + block.rows.length * 28;
  if (block.type === "variable") return 28;
  if (block.type === "columns") return columnsHeight(block);
  return textHeight(block.text, block.sizePt);
}

function stackedPages(blocks: EditorBlock[]): EditorPage[] {
  const groups: EditorBlock[][] = [];
  let current: EditorBlock[] = [];
  let y = TOP;

  for (const block of blocks) {
    const height = blockHeight(block);
    if (current.length > 0 && (y + height > BOTTOM || current.length >= MAX_BLOCKS)) {
      groups.push(current);
      current = [];
      y = TOP;
    }
    current.push({ ...block, yPx: Math.round(y) });
    y += height + GAP;
  }

  if (current.length > 0) groups.push(current);
  return groups.map((pageBlocks) => ({ id: crypto.randomUUID(), blocks: pageBlocks }));
}

function blank(label: string): string {
  return `${label}: ____________________`;
}

function heading(text: string): EditorBlock {
  return textBlock(text, { xPx: LEFT, yPx: 0, sizePt: 14, bold: true });
}

function body(text: string): EditorBlock {
  return textBlock(text, { xPx: LEFT, yPx: 0, sizePt: 12 });
}

function slot(key: string): EditorBlock {
  return variableBlock(key, LEFT, 0);
}

function letterPage(): EditorPage {
  const blocks: EditorBlock[] = [];
  const title = "Structural Engineering Proposal";
  const titleY = 40;
  const logo = imageBlock(epangLogo, PAGE_WIDTH - LEFT - LOGO_WIDTH, titleY, LOGO_WIDTH);
  blocks.push(textBlock(title, { xPx: LEFT, yPx: titleY, sizePt: 20, bold: true }));
  blocks.push(logo);

  const letter = [
    "Epang Engineering Inc.",
    "PO Box 22, Kohler, WI 53044",
    "Phone: (920) 249-4016",
    "Email: info@epangengr.com",
    "Date:",
  ].join("\n");
  let y = Math.max(titleY + textHeight(title, 20), titleY + logo.heightPx) + 16;
  blocks.push(textBlock(letter, { xPx: LEFT, yPx: y, sizePt: 12 }));
  blocks.push(variableBlock("PROPOSAL_DATE", FIELD_X, Math.round(y + HANDLE + 4 * linePx(12))));
  y += textHeight(letter, 12) + 20;

  blocks.push(textBlock("Client Information:", { xPx: LEFT, yPx: y, sizePt: 14, bold: true }));
  y += textHeight("Client Information:", 14) + GAP;

  const clientLabels = [
    blank("Company Name"),
    blank("Company Address"),
    blank("Project Manager Name"),
    blank("Project Manager Email"),
    blank("Project Manager Phone"),
    blank("Invoice Name"),
    blank("Invoice Email"),
    blank("Invoice Phone"),
  ].join("\n");
  const clientKeys = [
    "COMPANY_NAME",
    "COMPANY_ADDRESS",
    "PROJECT_MANAGER_NAME",
    "PROJECT_MANAGER_EMAIL",
    "PROJECT_MANAGER_PHONE",
    "INVOICE_NAME",
    "INVOICE_EMAIL",
    "INVOICE_PHONE",
  ];
  blocks.push(textBlock(clientLabels, { xPx: LEFT, yPx: Math.round(y), sizePt: 12 }));
  clientKeys.forEach((key, index) => {
    blocks.push(variableBlock(key, FIELD_X, Math.round(y + HANDLE + index * linePx(12))));
  });
  y += textHeight(clientLabels, 12) + 20;

  blocks.push(textBlock("Project Information:", { xPx: LEFT, yPx: Math.round(y), sizePt: 14, bold: true }));
  y += textHeight("Project Information:", 14) + GAP;

  const projectLabels = [
    blank("Epang Project Number"),
    blank("Client Job PO"),
    blank("Project Name"),
    blank("Project Address"),
  ].join("\n");
  const projectKeys = ["PROJECT_NUMBER", "CLIENT_PO", "PROJECT_NAME", "PROJECT_ADDRESS"];
  blocks.push(textBlock(projectLabels, { xPx: LEFT, yPx: Math.round(y), sizePt: 12 }));
  projectKeys.forEach((key, index) => {
    blocks.push(variableBlock(key, FIELD_X, Math.round(y + HANDLE + index * linePx(12))));
  });

  return { id: crypto.randomUUID(), blocks };
}

function detailBlocks(): EditorBlock[] {
  return [
    textBlock("Proposal Details:", { xPx: LEFT, yPx: 0, sizePt: 16, bold: true }),
    body(
      "1. Executive Summary\nEpang Engineering proposes a complete structural design package for {{PROJECT_NAME}} at {{PROJECT_ADDRESS}}. The package will deliver:",
    ),
    slot("EXECUTIVE_SUMMARY"),
    body(
      "Our licensed professional, Rodger Enters, P.E., will lead the effort and will serve as the single point of contact throughout the project.",
    ),
    heading("2. Scope of Work"),
    slot("SCOPE_OF_WORK"),
    body("All deliverables will be provided electronically unless hard copies are specifically requested."),
    heading("3. Project Schedule"),
    slot("PROJECT_SCHEDULE"),
    body("The schedule assumes timely receipt of any additional information requested from the Owner."),
    heading("4. Fee Structure"),
    slot("FEE_STRUCTURE"),
    body(
      "All fees are fixed-price and include all labor, software, and documentation required to complete the scope outlined above.",
    ),
    body(
      "5. Payment Terms\nInvoice Delivery: The invoice will be emailed to the Owner's designated address ({{OWNER_EMAIL}}) upon delivery of the final engineering report.\nDue Date: Payment is due within {{COMPANY_TERMS}} day/s upon receipt of the invoice (net {{COMPANY_TERMS}}).\nOur standard Terms & Conditions sheet (attached) governs the relationship and supersedes any verbal agreements.",
    ),
    heading("6. Assumptions & Exclusions"),
    slot("ASSUMPTIONS_AND_EXCLUSIONS"),
    body(
      "Any work outside the defined scope (e.g., demolition, concrete pouring, electrical installation) will be quoted separately.",
    ),
    body(
      "7. Acceptance\nThis proposal is valid for 30 days from the date of issuance (until {{PROPOSAL_DEADLINE}}). To authorize the work, please sign below and return a scanned copy by the acceptance deadline.",
    ),
    body("Accepted By (Client):\nTitle:\nSignature:\nDate:"),
    body(
      "8. Contact\nEngineering Project Manager: Shaimon Motin, RCE\nEmail: shaimon@epangengr.com\nFor any questions, clarifications, or additional information, please contact Shaimon directly. We look forward to partnering with you on this project.\n\nSincerely,\nRodger Enters PE\nPresident\nEpang Engineering Inc",
    ),
  ];
}

function termsText(): string {
  const joined = PROPOSAL_TERMS.join("\n");
  const at = joined.indexOf("from and against");
  if (at < 0) return joined;
  return `${joined.slice(0, at + "from and".length)}${COLUMN_BREAK}${joined.slice(at + "from and ".length)}`;
}

function termsPage(): EditorPage {
  const title = textBlock("GENERAL TERMS AND CONDITIONS", { xPx: LEFT, yPx: TOP, sizePt: 12, bold: true });
  const columns = columnsBlock(LEFT, Math.round(TOP + blockHeight(title) + GAP));
  columns.text = termsText();
  columns.sizePt = 7.5;
  columns.lineSpacing = 1;
  columns.widthPx = 700;
  return { id: crypto.randomUUID(), blocks: [title, columns] };
}

export function placeProposalTerms(template: EditorTemplate): EditorTemplate {
  if (template.id !== "proposal") return template;
  const placed = template.pages.some((page) =>
    page.blocks.some((block) => block.type === "columns" && block.text.includes("FORMATION OF CONTRACTUAL AGREEMENT")),
  );
  if (placed) {
    return {
      ...template,
      pages: template.pages.map((page) => ({
        ...page,
        blocks: page.blocks.map((block) =>
          block.type === "columns" &&
          block.text.includes("FORMATION OF CONTRACTUAL AGREEMENT") &&
          (block.sizePt === 7 || block.sizePt === 8)
            ? { ...block, sizePt: 7.5 }
            : block,
        ),
      })),
    };
  }
  const index = template.pages.findIndex((page) =>
    page.blocks.some(
      (block) =>
        block.type === "text" &&
        (block.text.startsWith("GENERAL TERMS AND CONDITIONS") || block.text.includes("FORMATION OF CONTRACTUAL AGREEMENT")),
    ),
  );
  if (index < 0) return template;
  return { ...template, pages: [...template.pages.slice(0, index), termsPage()] };
}

export function createProposalTemplate(): EditorTemplate {
  return {
    id: "proposal",
    name: "Proposal template",
    header: [],
    footer: [],
    pages: [letterPage(), ...stackedPages(detailBlocks()), termsPage()],
  };
}

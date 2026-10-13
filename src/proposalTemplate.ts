import { PAGE_WIDTH, COLUMN_BREAK } from "../shared/template";
import { epangLogo } from "./epangLogo";
import {
  columnsBlock,
  imageBlock,
  lineBlock,
  textBlock,
  variableBlock,
  type EditorBlock,
  type EditorPage,
  type EditorTemplate,
  type EditorText,
} from "./model";
import { PROPOSAL_TERMS } from "./proposalTerms";

const LEFT = 48;
const CONTENT_WIDTH = 700;
const LOGO_WIDTH = 68;
const FIELD_LINE = 12 * (96 / 72) * 1.15;

function textHeight(text: string, sizePt: number, lineSpacing = 1.15, widthPx = CONTENT_WIDTH): number {
  const fontPx = sizePt * (96 / 72);
  const charsPerLine = Math.max(8, Math.floor(widthPx / (fontPx * 0.5)));
  const lines = text.split("\n").reduce((count, line) => count + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
  return Math.ceil(lines * fontPx * lineSpacing);
}

function para(
  text: string,
  xPx: number,
  yPx: number,
  options: {
    sizePt?: number;
    bold?: boolean;
    align?: EditorText["align"];
    list?: EditorText["list"];
    widthPx?: number;
    lineSpacing?: EditorText["lineSpacing"];
  } = {},
): EditorText {
  return {
    ...textBlock(text, { xPx, yPx, sizePt: options.sizePt ?? 12, bold: options.bold ?? false }),
    align: options.align ?? "left",
    list: options.list ?? "none",
    widthPx: options.widthPx ?? CONTENT_WIDTH,
    lineSpacing: options.lineSpacing ?? 1.15,
  };
}

function grid(xPx: number, yPx: number, rows: string[][]): EditorBlock {
  return { id: crypto.randomUUID(), type: "table", widthPx: CONTENT_WIDTH, rows, xPx, yPx };
}

function fields(labels: string[], keys: string[], yPx: number): EditorBlock[] {
  return [
    para(labels.map((label) => `${label}:`).join("\n"), LEFT, yPx, { list: "bullet", widthPx: 280, lineSpacing: 1.15 }),
    ...keys.map((key, index) => variableBlock(key, LEFT + 250, Math.round(yPx + index * FIELD_LINE))),
  ];
}

function letterPage(): EditorPage {
  const clientLabels = [
    "Company Name",
    "Company Address",
    "Project Manager Name",
    "Project Manager Email",
    "Project Manager Phone",
    "Invoice Name",
    "Invoice Email",
    "Invoice Phone",
  ];
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
  const projectLabels = ["Epang Project Number", "Client Job PO", "Project Name", "Project Address"];
  const projectKeys = ["PROJECT_NUMBER", "CLIENT_PO", "PROJECT_NAME", "PROJECT_ADDRESS"];
  const summary =
    "Epang Engineering proposes a complete structural design package for {{PROJECT_NAME}} at {{PROJECT_ADDRESS}}. The package will deliver:";
  let y = 140;
  const blocks: EditorBlock[] = [
    para("Epang Engineering Inc.\nPO Box 22, Kohler, WI 53044", LEFT, 18, { sizePt: 10, widthPx: 240 }),
    para("Phone: (920) 249-4016\nEmail: info@epangengr.com", PAGE_WIDTH - LEFT - 230, 18, {
      sizePt: 10,
      widthPx: 230,
      align: "right",
    }),
    para("Structural Engineering Proposal", LEFT, 100, { sizePt: 16, bold: true, align: "center" }),
    para("Date:", LEFT, y, { widthPx: 70 }),
    variableBlock("PROPOSAL_DATE", LEFT + 70, y),
  ];
  y += textHeight("Date:", 12) + 16;
  blocks.push(para("Client Information:", LEFT, y, { sizePt: 13, bold: true }));
  y += textHeight("Client Information:", 13) + 6;
  blocks.push(...fields(clientLabels, clientKeys, y));
  y += clientLabels.length * FIELD_LINE + 16;
  blocks.push(para("Project Information:", LEFT, y, { sizePt: 13, bold: true }));
  y += textHeight("Project Information:", 13) + 6;
  blocks.push(...fields(projectLabels, projectKeys, y));
  y += projectLabels.length * FIELD_LINE + 16;
  blocks.push(para("Proposal Details:", LEFT, y, { sizePt: 13, bold: true }));
  y += textHeight("Proposal Details:", 13) + 8;
  blocks.push(para("1. Executive Summary", LEFT, y, { bold: true }));
  y += textHeight("1. Executive Summary", 12) + 6;
  blocks.push(para(summary, LEFT, y));
  y += textHeight(summary, 12) + 6;
  blocks.push(variableBlock("EXECUTIVE_SUMMARY", LEFT, y));
  y += 28;
  blocks.push(
    para(
      "Our licensed professional, Rodger Enters, P.E., will lead the effort and will serve as the single point of contact throughout the project.",
      LEFT,
      y,
    ),
  );
  return { id: crypto.randomUUID(), blocks };
}

function scopePage(): EditorPage {
  let y = 96;
  const blocks: EditorBlock[] = [para("2. Scope of Work", LEFT, y, { sizePt: 13, bold: true })];
  y += 28;
  blocks.push(
    grid(LEFT, y, [
      ["#", "Task", "Deliverable"],
      ["1", "SCOPE_OF_WORK", ""],
      ["2", "", ""],
      ["3", "", ""],
      ["4", "", ""],
      ["5", "", ""],
    ]),
  );
  y += 36 + 6 * 32;
  blocks.push(para("All deliverables will be provided electronically unless hard copies are specifically requested.", LEFT, y));
  y += textHeight("All deliverables will be provided electronically unless hard copies are specifically requested.", 12) + 18;
  blocks.push(para("3. Project Schedule", LEFT, y, { sizePt: 13, bold: true }));
  y += 28;
  blocks.push(
    grid(LEFT, y, [
      ["Phase", "Duration", "Target Completion"],
      ["PROJECT_SCHEDULE", "", ""],
      ["", "", ""],
      ["", "", ""],
      ["", "", ""],
    ]),
  );
  y += 36 + 5 * 32;
  blocks.push(para("The schedule assumes timely receipt of any additional information requested from the Owner.", LEFT, y));
  y += textHeight("The schedule assumes timely receipt of any additional information requested from the Owner.", 12) + 18;
  blocks.push(para("4. Fee Structure", LEFT, y, { sizePt: 13, bold: true }));
  y += 28;
  blocks.push(
    grid(LEFT, y, [
      ["Description", "Qty", "Unit", "Price"],
      ["FEE_STRUCTURE", "", "", ""],
      ["", "", "", ""],
    ]),
  );
  y += 36 + 3 * 32;
  blocks.push(
    para(
      "All fees are fixed-price and include all labor, software, and documentation required to complete the scope outlined above.",
      LEFT,
      y,
    ),
  );
  return { id: crypto.randomUUID(), blocks };
}

function closingPage(): EditorPage {
  const payment = [
    "Invoice Delivery: The invoice will be emailed to the Owner's designated address ({{OWNER_EMAIL}}) upon delivery of the final engineering report.",
    "Due Date: Payment is due within {{COMPANY_TERMS}} day/s upon receipt of the invoice (net {{COMPANY_TERMS}}).",
    "Our standard Terms & Conditions sheet (attached) governs the relationship and supersedes any verbal agreements.",
  ].join("\n");
  const acceptance =
    "This proposal is valid for 30 days from the date of issuance (until {{PROPOSAL_DEADLINE}}). To authorize the work, please sign below and return a scanned copy by the acceptance deadline.";
  const contact = [
    "Engineering Project Manager: Shaimon Motin, RCE",
    "Email: shaimon@epangengr.com",
    "For any questions, clarifications, or additional information, please contact Shaimon directly. We look forward to partnering with you on this project.",
    "",
    "Sincerely,",
    "Rodger Enters PE",
    "President",
    "Epang Engineering Inc",
  ].join("\n");
  let y = 96;
  const blocks: EditorBlock[] = [para("5. Payment Terms", LEFT, y, { sizePt: 13, bold: true })];
  y += 28;
  blocks.push(para(payment, LEFT, y));
  y += textHeight(payment, 12) + 18;
  blocks.push(para("6. Assumptions & Exclusions", LEFT, y, { sizePt: 13, bold: true }));
  y += 28;
  blocks.push(
    grid(LEFT, y, [
      ["Assumption", "Reason"],
      ["ASSUMPTIONS_AND_EXCLUSIONS", ""],
      ["", ""],
      ["", ""],
      ["", ""],
      ["", ""],
    ]),
  );
  y += 36 + 6 * 32;
  blocks.push(
    para(
      "Any work outside the defined scope (e.g., demolition, concrete pouring, electrical installation) will be quoted separately.",
      LEFT,
      y,
    ),
  );
  y += textHeight("Any work outside the defined scope (e.g., demolition, concrete pouring, electrical installation) will be quoted separately.", 12) + 18;
  blocks.push(para("7. Acceptance", LEFT, y, { sizePt: 13, bold: true }));
  y += 28;
  blocks.push(para(acceptance, LEFT, y));
  y += textHeight(acceptance, 12) + 12;
  blocks.push(para("Accepted By (Client):\nTitle:\nSignature:\nDate:", LEFT, y, { widthPx: 420 }));
  y += textHeight("Accepted By (Client):\nTitle:\nSignature:\nDate:", 12) + 18;
  blocks.push(para("8. Contact", LEFT, y, { sizePt: 13, bold: true }));
  y += 28;
  blocks.push(para(contact, LEFT, y));
  return { id: crypto.randomUUID(), blocks };
}

function termsText(): string {
  const joined = PROPOSAL_TERMS.join("\n");
  const at = joined.indexOf("from and against");
  if (at < 0) return joined;
  return `${joined.slice(0, at + "from and".length)}${COLUMN_BREAK}${joined.slice(at + "from and ".length)}`;
}

function termsPage(): EditorPage {
  const title = para("GENERAL TERMS AND CONDITIONS", LEFT, 92, { bold: true, align: "center" });
  const columns = columnsBlock(LEFT, 120);
  columns.text = termsText();
  columns.sizePt = 7.5;
  columns.lineSpacing = 1;
  columns.widthPx = CONTENT_WIDTH;
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
  const logo = imageBlock(epangLogo, Math.round((PAGE_WIDTH - LOGO_WIDTH) / 2), 8, LOGO_WIDTH);
  return {
    id: "proposal",
    name: "Proposal template",
    header: [logo, lineBlock(LEFT, logo.yPx + logo.heightPx + 6, CONTENT_WIDTH)],
    footer: [],
    pages: [letterPage(), scopePage(), closingPage(), termsPage()],
  };
}

export function upgradeProposal(template: EditorTemplate): EditorTemplate {
  if (template.id !== "proposal") return template;
  const blocks = [...(template.header ?? []), ...template.pages.flatMap((page) => page.blocks)];
  const laidOut = blocks.some((block) => block.type === "table") && blocks.some((block) => block.type === "image");
  const title = blocks.find((block) => block.type === "text" && block.text === "Structural Engineering Proposal");
  const overlappingTitle = title?.type === "text" && title.yPx === 92;
  if (!laidOut || overlappingTitle) return createProposalTemplate();
  return placeProposalTerms(template);
}

import { COLUMN_BREAK } from "../shared/template";
import { columnsBlock, textBlock, type EditorPage, type EditorTemplate, type EditorText } from "./model";
import { PROPOSAL_TERMS } from "./proposalTerms";
import braveProposal from "./braveProposal.json";

const LEFT = 48;
const CONTENT_WIDTH = 700;

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
  return structuredClone(braveProposal) as EditorTemplate;
}

function savedInBrave(template: EditorTemplate): boolean {
  return template.pages.some((page) =>
    page.blocks.some((block) => block.type === "text" && block.text.includes("Company Name: ____________________")),
  );
}

export function upgradeProposal(template: EditorTemplate): EditorTemplate {
  if (template.id !== "proposal" || !savedInBrave(template)) return template.id === "proposal" ? createProposalTemplate() : template;
  return placeProposalTerms(template);
}

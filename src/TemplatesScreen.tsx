import { pagePixels, resolvePageSetup } from "../shared/pageSetup";
import type { EditorTemplate } from "./model";

export function TemplatesScreen({
  templates,
  onOpen,
}: {
  templates: EditorTemplate[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="flex h-dvh items-center justify-center bg-slate-200 p-6 text-slate-900">
      <section className="flex min-h-[28rem] w-full max-w-5xl flex-col rounded-[2rem] border-2 border-slate-400 bg-slate-50 px-10 py-8">
        <h1 className="text-center text-lg font-medium">Templates</h1>
        <p className="mt-1 text-center text-xs text-slate-500">Saved on this computer. They are still here after you close it.</p>
        <div className="flex flex-1 items-center justify-center gap-16">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => onOpen(template.id)}
              className="flex w-40 flex-col items-center gap-4"
            >
              <span
                className="flex h-40 w-32 items-center justify-center rounded-3xl border-2 border-slate-400 shadow-sm"
                style={{ backgroundColor: `#${resolvePageSetup(template.pageSetup).color}` }}
              >
                <PageMarks template={template} />
              </span>
              <span className="text-sm">{template.name}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function PageMarks({ template }: { template: EditorTemplate }) {
  const setup = resolvePageSetup(template.pageSetup);
  const page = pagePixels(setup);
  const blocks = template.pages[0]?.blocks ?? [];
  const landscape = page.width > page.height;
  return (
    <span
      className={`relative rounded-md border border-slate-200 ${landscape ? "h-16 w-24" : "h-24 w-16"}`}
      style={{ backgroundColor: `#${setup.color}` }}
    >
      {blocks.slice(0, 6).map((block) => (
        <span
          key={block.id}
          className={`absolute h-1.5 w-3 rounded-full ${block.type === "image" ? "bg-slate-300" : "bg-slate-400"}`}
          style={{
            left: `${(block.xPx / page.width) * 100}%`,
            top: `${(block.yPx / page.height) * 100}%`,
          }}
        />
      ))}
    </span>
  );
}

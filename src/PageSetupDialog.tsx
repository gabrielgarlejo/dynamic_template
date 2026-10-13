import { useState } from "react";
import { PAPER_SIZES, pageSetupError, type PageOrientation, type PageSetup, type PaperSize } from "../shared/pageSetup";

const PAGE_COLORS = ["FFFFFF", "F8F1E7", "E7F0FE", "FDE2E4", "D3F8DF", "1F2937"] as const;

export function PageSetupDialog({
  setup,
  onCancel,
  onOk,
  onSetDefault,
}: {
  setup: PageSetup;
  onCancel: () => void;
  onOk: (setup: PageSetup) => void;
  onSetDefault: (setup: PageSetup) => void;
}) {
  const [draft, setDraft] = useState(setup);
  const [margins, setMargins] = useState({
    top: String(setup.marginTopIn),
    bottom: String(setup.marginBottomIn),
    left: String(setup.marginLeftIn),
    right: String(setup.marginRightIn),
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function readSetup(): PageSetup | null {
    const next: PageSetup = {
      ...draft,
      marginTopIn: readInches(margins.top),
      marginBottomIn: readInches(margins.bottom),
      marginLeftIn: readInches(margins.left),
      marginRightIn: readInches(margins.right),
    };
    if ([next.marginTopIn, next.marginBottomIn, next.marginLeftIn, next.marginRightIn].some((value) => Number.isNaN(value))) {
      setError("Margins must be numbers, such as 1 or 0.75.");
      setNotice(null);
      return null;
    }
    const problem = pageSetupError(next);
    if (problem) {
      setError(problem);
      setNotice(null);
      return null;
    }
    setError(null);
    return next;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="page-setup-title"
        className="w-full max-w-xl rounded-3xl border border-slate-300 bg-white p-6 text-slate-900 shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="page-setup-title" className="text-lg font-medium">
          Page setup
        </h2>
        <div className="mt-4 flex gap-6 border-b border-slate-200">
          <TabButton active={draft.mode === "pages"} onClick={() => setDraft({ ...draft, mode: "pages" })}>
            Pages
          </TabButton>
          <TabButton active={draft.mode === "pageless"} onClick={() => setDraft({ ...draft, mode: "pageless" })}>
            Pageless
          </TabButton>
        </div>

        {draft.mode === "pages" ? (
          <div className="mt-5 flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm">
              Apply to
              <select
                value="document"
                onChange={() => undefined}
                className="rounded-xl border border-slate-300 px-3 py-2"
              >
                <option value="document">Whole document</option>
                <option value="section" disabled>
                  Selected section
                </option>
              </select>
            </label>
            <fieldset>
              <legend className="text-sm">Orientation</legend>
              <div className="mt-1 flex gap-3">
                <OrientationChoice
                  label="Portrait"
                  checked={draft.orientation === "portrait"}
                  onChange={() => setDraft({ ...draft, orientation: "portrait" })}
                />
                <OrientationChoice
                  label="Landscape"
                  checked={draft.orientation === "landscape"}
                  onChange={() => setDraft({ ...draft, orientation: "landscape" })}
                />
              </div>
            </fieldset>
            <label className="flex flex-col gap-1 text-sm">
              Paper size
              <select
                value={draft.paper}
                onChange={(event) => setDraft({ ...draft, paper: event.target.value as PaperSize })}
                className="rounded-xl border border-slate-300 px-3 py-2"
              >
                {PAPER_SIZES.map((paper) => (
                  <option key={paper.id} value={paper.id}>
                    {paper.name} ({paper.widthIn} × {paper.heightIn} in)
                  </option>
                ))}
              </select>
            </label>
            <PageColor color={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
            <fieldset>
              <legend className="text-sm">Margins (inches)</legend>
              <div className="mt-1 grid grid-cols-4 gap-2">
                <MarginField label="Top" value={margins.top} onChange={(top) => setMargins({ ...margins, top })} />
                <MarginField label="Bottom" value={margins.bottom} onChange={(bottom) => setMargins({ ...margins, bottom })} />
                <MarginField label="Left" value={margins.left} onChange={(left) => setMargins({ ...margins, left })} />
                <MarginField label="Right" value={margins.right} onChange={(right) => setMargins({ ...margins, right })} />
              </div>
            </fieldset>
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-4">
            <p className="text-sm text-slate-600">
              The pages join into one continuous sheet. Paper size, orientation, and margins stay saved and return when you switch back to Pages.
            </p>
            <PageColor color={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
          </div>
        )}

        {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
        {notice ? <p className="mt-4 text-sm text-emerald-700">{notice}</p> : null}

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            className="text-sm font-medium text-slate-700"
            onClick={() => {
              const next = readSetup();
              if (!next) return;
              onSetDefault(next);
              setNotice("Saved as the default for new documents.");
            }}
          >
            Set as default
          </button>
          <div className="flex gap-2">
            <button type="button" className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-medium" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="rounded-full bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white"
              onClick={() => {
                const next = readSetup();
                if (next) onOk(next);
              }}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 pb-2 text-sm font-medium ${active ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500"}`}
    >
      {children}
    </button>
  );
}

function OrientationChoice({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  const orientation: PageOrientation = label === "Landscape" ? "landscape" : "portrait";
  return (
    <label className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${checked ? "border-slate-900" : "border-slate-300"}`}>
      <input type="radio" name="orientation" checked={checked} onChange={onChange} />
      <span className={`border border-slate-400 ${orientation === "portrait" ? "h-5 w-4" : "h-4 w-5"}`} />
      {label}
    </label>
  );
}

function PageColor({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      Page color
      <div className="flex items-center gap-2">
        {PAGE_COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-label={swatch === "FFFFFF" ? "White" : swatch}
            onClick={() => onChange(swatch)}
            className={`h-7 w-7 rounded-full border ${color === swatch ? "border-slate-900 ring-2 ring-slate-900" : "border-slate-300"}`}
            style={{ backgroundColor: `#${swatch}` }}
          />
        ))}
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-600">
          Custom
          <input
            type="color"
            aria-label="Custom page color"
            value={`#${color}`}
            onChange={(event) => onChange(event.target.value.slice(1).toUpperCase())}
            className="h-7 w-10 cursor-pointer bg-transparent"
          />
        </label>
      </div>
    </div>
  );
}

function MarginField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-600">
      {label}
      <input
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-slate-300 px-2 py-2 text-sm text-slate-900"
      />
    </label>
  );
}

function readInches(value: string): number {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return Number.NaN;
  return Number(trimmed);
}

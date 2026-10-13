import { useEffect, useRef, useState } from "react";
import { Editor } from "./Editor";
import { createStarterTemplates, toRequest, type EditorTemplate } from "./model";
import { upgradeProposal } from "./proposalTemplate";
import { TemplatesScreen } from "./TemplatesScreen";

const STORAGE_KEY = "template-maker.templates";

export function App() {
  const [templates, setTemplates] = useState(() => loadSavedTemplates() ?? createStarterTemplates());
  const [openId, setOpenId] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = templates.find((template) => template.id === openId) ?? null;
  const latest = useRef(templates);
  latest.current = templates;

  useEffect(() => {
    const timer = window.setTimeout(() => storeTemplates(templates, setError), 400);
    return () => window.clearTimeout(timer);
  }, [templates]);

  useEffect(() => {
    function flush() {
      storeTemplates(latest.current, setError);
    }
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  function updateTemplate(next: EditorTemplate) {
    setTemplates((current) => current.map((template) => (template.id === next.id ? next : template)));
  }

  function saveNow() {
    const stored = storeTemplates(templates, setError);
    if (stored) {
      setError(null);
      setMessage("Saved on this computer.");
    }
  }

  async function renderDocument(template: EditorTemplate) {
    setRendering(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toRequest(template)),
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const detail =
          body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : "Could not render the document.";
        throw new Error(detail);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName(template.name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(`Downloaded ${fileName(template.name)}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not render the document.");
    } finally {
      setRendering(false);
    }
  }

  if (!open) {
    return (
      <TemplatesScreen
        templates={templates}
        onOpen={(id) => {
          setMessage(null);
          setError(null);
          setOpenId(id);
        }}
      />
    );
  }

  return (
    <Editor
      template={open}
      message={message}
      error={error}
      rendering={rendering}
      onChange={updateTemplate}
      onBack={() => {
        setMessage(null);
        setError(null);
        setOpenId(null);
      }}
      onSave={saveNow}
      onRender={() => void renderDocument(open)}
    />
  );
}

function loadSavedTemplates(): EditorTemplate[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isTemplate)) return null;
    return parsed.map(upgradeProposal);
  } catch {
    return null;
  }
}

function storeTemplates(templates: EditorTemplate[], onError: (message: string) => void): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    return true;
  } catch {
    onError("Could not save. This browser ran out of room for the template.");
    return false;
  }
}

function fileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "template"}.docx`;
}

function isTemplate(value: unknown): value is EditorTemplate {
  if (!value || typeof value !== "object") return false;
  const template = value as EditorTemplate;
  return (
    typeof template.id === "string" &&
    typeof template.name === "string" &&
    Array.isArray(template.header) &&
    Array.isArray(template.footer) &&
    Array.isArray(template.pages) &&
    template.pages.every((page) => page && typeof page.id === "string" && Array.isArray(page.blocks))
  );
}

"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { Drawer, Button, Input, Textarea } from "@/components/ui";
import { VARIABLES } from "@/lib/whatsapp/variables";
import { renderTemplate } from "@/lib/whatsapp/render";
import { createTemplate, updateTemplate } from "@/app/_actions/whatsapp-templates";
import type { WhatsappTemplate } from "@/types/database";

interface TemplateDrawerProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  template: WhatsappTemplate | null;
}

const SAMPLE_VARS: Map<string, string | null> = new Map(VARIABLES.map((v) => [v.key, v.example]));

export function TemplateDrawer({ open, onClose, onSaved, template }: TemplateDrawerProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [isActive, setIsActive] = useState(true);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setName(template?.name ?? "");
      setBody(template?.body ?? "");
      setIsActive(template?.is_active ?? true);
    }
  }, [open, template]);

  function insertVariable(key: string) {
    const ta = bodyRef.current;
    if (!ta) {
      setBody((prev) => `${prev}{{${key}}}`);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = body.slice(0, start);
    const after = body.slice(end);
    const token = `{{${key}}}`;
    const next = `${before}${token}${after}`;
    setBody(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + token.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  function handleSubmit() {
    setError(null);
    if (!name.trim()) { setError("Name is required"); return; }
    if (!body.trim()) { setError("Body is required"); return; }

    startTransition(async () => {
      const res = template
        ? await updateTemplate(template.id, { name: name.trim(), body, is_active: isActive })
        : await createTemplate({ name: name.trim(), body, is_active: isActive });
      if ("error" in res) { setError(res.error); return; }
      onSaved();
    });
  }

  const preview = renderTemplate(body, SAMPLE_VARS);

  return (
    <Drawer open={open} onClose={onClose} title={template ? "Edit Template" : "New Template"} width="max-w-2xl">
      <div className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>
        )}

        <div>
          <label className="text-xs font-medium text-slate-500 mb-1 block">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Renewal reminder" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr,180px] gap-3">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Body</label>
            <Textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hi {{first_name}}, you have {{sessions_remaining}} sessions left."
              rows={8}
              className="font-mono text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Variables</label>
            <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
              {VARIABLES.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => insertVariable(v.key)}
                  className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-primary-50 text-slate-700 hover:text-primary border border-transparent hover:border-primary-200 transition-colors"
                  title={v.description}
                >
                  <span className="font-mono text-[11px] text-primary">{`{{${v.key}}}`}</span>
                  <span className="text-slate-400 ml-1 text-[10px]">{v.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          <span>Active (visible in send picker)</span>
        </label>

        <div>
          <label className="text-xs font-medium text-slate-500 mb-1 block">Live preview (sample values)</label>
          <div className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 whitespace-pre-wrap min-h-[60px]">
            {body ? preview : <span className="text-slate-400">Write a body to see the preview…</span>}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Saving…" : (template ? "Save" : "Create")}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

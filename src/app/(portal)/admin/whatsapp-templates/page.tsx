"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { Card, Button, Toast, Skeleton } from "@/components/ui";
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, MessageSquare } from "lucide-react";
import { listTemplates, deleteTemplate, reorderTemplates, updateTemplate } from "@/app/_actions/whatsapp-templates";
import type { WhatsappTemplate } from "@/types/database";
import { TemplateDrawer } from "./_components/template-drawer";

export default function WhatsappTemplatesPage() {
  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<WhatsappTemplate | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const handleToastClose = useCallback(() => setToast(null), []);

  const refresh = useCallback(async () => {
    const data = await listTemplates();
    setTemplates(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function move(idx: number, direction: -1 | 1) {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= templates.length) return;
    const next = [...templates];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setTemplates(next);
    startTransition(async () => {
      const res = await reorderTemplates(next.map((t) => t.id));
      if ("error" in res) {
        setToast({ message: res.error, variant: "error" });
        refresh();
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deleteTemplate(id);
      setConfirmDeleteId(null);
      if ("error" in res) {
        setToast({ message: res.error, variant: "error" });
      } else {
        setToast({ message: "Template deleted", variant: "success" });
        refresh();
      }
    });
  }

  function handleToggleActive(t: WhatsappTemplate) {
    const next = !t.is_active;
    setTemplates((prev) => prev.map((x) => x.id === t.id ? { ...x, is_active: next } : x));
    startTransition(async () => {
      const res = await updateTemplate(t.id, { is_active: next });
      if ("error" in res) {
        setToast({ message: res.error, variant: "error" });
        refresh();
      }
    });
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <Toast message={toast?.message ?? null} variant={toast?.variant} onClose={handleToastClose} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">WhatsApp Templates</h1>
          <p className="text-slate-500 text-sm">{templates.length} template{templates.length !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <span className="flex items-center gap-1.5"><Plus className="w-4 h-4" /> New Template</span>
        </Button>
      </div>

      {loading ? (
        <Card><div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div></Card>
      ) : templates.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No templates yet — create your first one to start sending.</p>
          </div>
        </Card>
      ) : (
        <Card className="p-0">
          <div className="divide-y divide-slate-100">
            {templates.map((t, idx) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0 || isPending}
                    className="text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed p-0.5"
                    title="Move up"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => move(idx, 1)}
                    disabled={idx === templates.length - 1 || isPending}
                    className="text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed p-0.5"
                    title="Move down"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{t.name}</p>
                  <p className="text-xs text-slate-400 truncate">{t.body.slice(0, 80)}{t.body.length > 80 ? "…" : ""}</p>
                </div>
                <button
                  onClick={() => handleToggleActive(t)}
                  className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                    t.is_active
                      ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {t.is_active ? "Active" : "Inactive"}
                </button>
                <button
                  onClick={() => setEditing(t)}
                  className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                  title="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                {confirmDeleteId === t.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDelete(t.id)}
                      disabled={isPending}
                      className="text-xs font-medium px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                    >Delete</button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-xs font-medium px-2 py-1 rounded text-slate-500 hover:text-slate-700"
                    >Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(t.id)}
                    className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <TemplateDrawer
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={() => { setShowCreate(false); refresh(); setToast({ message: "Template created", variant: "success" }); }}
        template={null}
      />
      <TemplateDrawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); refresh(); setToast({ message: "Template updated", variant: "success" }); }}
        template={editing}
      />
    </div>
  );
}

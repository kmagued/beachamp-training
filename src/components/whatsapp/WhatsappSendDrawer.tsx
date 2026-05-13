"use client";

import { useState, useEffect } from "react";
import { Drawer, Button, Textarea } from "@/components/ui";
import { ExternalLink } from "lucide-react";
import { listTemplates } from "@/app/_actions/whatsapp-templates";
import { resolvePlayerVariables } from "@/lib/whatsapp/resolver";
import { renderTemplate } from "@/lib/whatsapp/render";
import { buildWhatsAppUrl } from "@/lib/whatsapp/url";
import type { WhatsappTemplate } from "@/types/database";

interface WhatsappSendDrawerProps {
  open: boolean;
  onClose: () => void;
  playerId: string;
  playerName: string;
  playerPhone: string | null;
}

export function WhatsappSendDrawer({ open, onClose, playerId, playerName, playerPhone }: WhatsappSendDrawerProps) {
  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [vars, setVars] = useState<Map<string, string | null>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedId(null);
    setText("");
    setLoading(true);
    (async () => {
      const [tpl, v] = await Promise.all([
        listTemplates({ activeOnly: true }),
        resolvePlayerVariables(playerId),
      ]);
      setTemplates(tpl);
      setVars(v);
      setLoading(false);
    })();
  }, [open, playerId]);

  function handlePickTemplate(t: WhatsappTemplate) {
    setSelectedId(t.id);
    setText(renderTemplate(t.body, vars));
  }

  function handleOpenInWhatsApp() {
    if (!playerPhone) return;
    if (!text.trim()) return;
    const url = buildWhatsAppUrl(playerPhone, text);
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  }

  function handleRawOpen() {
    if (!playerPhone) return;
    window.open(buildWhatsAppUrl(playerPhone), "_blank", "noopener,noreferrer");
    onClose();
  }

  const noPhone = !playerPhone;

  return (
    <Drawer open={open} onClose={onClose} title="Send WhatsApp" width="max-w-lg">
      <div className="space-y-4">
        <div className="text-sm">
          <p className="text-xs text-slate-400 mb-0.5">To</p>
          <p className="text-slate-900 font-medium">{playerName}</p>
          <p className="text-slate-500 text-xs">{playerPhone ?? "(no phone on file)"}</p>
        </div>

        {noPhone ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-3 py-2">
            This player has no phone number on file. Add one in the profile to send WhatsApp.
          </div>
        ) : loading ? (
          <p className="text-sm text-slate-400 text-center py-6">Loading templates…</p>
        ) : (
          <>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Template</label>
              {templates.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No active templates. Create one on the WhatsApp Templates page.</p>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handlePickTemplate(t)}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                        selectedId === t.id
                          ? "border-primary bg-primary-50 text-primary"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Preview & edit</label>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Pick a template above to see the preview here. Edit freely before sending."
                rows={8}
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Unresolved variables stay as <code>{`{{name}}`}</code> — edit them inline before sending.
              </p>
            </div>

            <Button onClick={handleOpenInWhatsApp} disabled={!text.trim()} fullWidth>
              <span className="flex items-center gap-1.5">
                <ExternalLink className="w-4 h-4" />
                Open in WhatsApp
              </span>
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={handleRawOpen}
                className="text-xs text-slate-500 hover:text-slate-700 underline-offset-2 hover:underline"
              >
                Or, send raw WhatsApp (no template) →
              </button>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}

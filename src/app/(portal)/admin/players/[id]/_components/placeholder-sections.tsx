import { Card } from "@/components/ui";
import { ClipboardList, MessageSquare } from "lucide-react";

export function PlaceholderSections() {
  return (
    <Card>
      <div className="grid sm:grid-cols-2 gap-6">
        <div className="text-center py-6">
          <div className="text-slate-300 mb-2 flex justify-center"><ClipboardList className="w-7 h-7" /></div>
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Sessions</h3>
          <p className="text-xs text-slate-400">Session tracking coming in a future update.</p>
        </div>
        <div className="text-center py-6 sm:border-l sm:border-slate-100">
          <div className="text-slate-300 mb-2 flex justify-center"><MessageSquare className="w-7 h-7" /></div>
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Coach Feedback</h3>
          <p className="text-xs text-slate-400">Coach feedback coming in a future update.</p>
        </div>
      </div>
    </Card>
  );
}

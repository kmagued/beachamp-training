"use client";

import { useState, useTransition } from "react";
import { Button, Input, Select, Drawer } from "@/components/ui";
import { createGroup, updateGroup } from "@/app/_actions/training";
import type { GroupData } from "./types";

interface GroupModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingGroup?: GroupData | null;
}

export function GroupModal({ open, onClose, onSuccess, editingGroup }: GroupModalProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = editingGroup
        ? await updateGroup(editingGroup.id, formData)
        : await createGroup(formData);

      if ("error" in result) {
        setError((result as { error: string }).error);
      } else {
        onSuccess();
        onClose();
      }
    });
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editingGroup ? "Edit Group" : "New Group"}
    >
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">
          {error}
        </div>
      )}

      <form action={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-slate-500 mb-1 block">Name</label>
          <Input name="name" required defaultValue={editingGroup?.name || ""} placeholder="e.g. Group A" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Level</label>
            <Select name="level" defaultValue={editingGroup?.level || "mixed"}>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
              <option value="mixed">Mixed</option>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Max Players</label>
            <Input name="max_players" type="number" required min="1" defaultValue={editingGroup?.max_players || 20} />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 mb-1 block">Description</label>
          <Input name="description" placeholder="Optional description" defaultValue={editingGroup?.description || ""} />
        </div>
        <Button type="submit" fullWidth disabled={isPending}>
          {isPending ? "Saving..." : editingGroup ? "Save Changes" : "Create Group"}
        </Button>
      </form>
    </Drawer>
  );
}

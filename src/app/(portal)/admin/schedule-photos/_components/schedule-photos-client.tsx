"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Card, Button, EmptyState, Label, Select, Input, Toast } from "@/components/ui";
import { Upload, ImageIcon, Trash2, Loader2, Check, X } from "lucide-react";
import { uploadSchedulePhoto, deleteSchedulePhoto, updateSchedulePhotoCaption } from "../actions";

interface GroupOption {
  id: string;
  name: string;
  level: string | null;
}

interface PhotoItem {
  id: string;
  group_id: string;
  caption: string | null;
  created_at: string;
  url: string;
}

export function SchedulePhotosClient({
  groups,
  photos,
}: {
  groups: GroupOption[];
  photos: PhotoItem[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(groups[0]?.id || "");
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCaption, setEditCaption] = useState("");
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  const photosByGroup = groups.map((g) => ({
    group: g,
    items: photos.filter((p) => p.group_id === g.id),
  }));

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  }

  function handleUpload() {
    if (!selectedGroupId) {
      setToast({ message: "Please select a group", variant: "error" });
      return;
    }
    if (!file) {
      setToast({ message: "Please choose a photo", variant: "error" });
      return;
    }
    const fd = new FormData();
    fd.append("group_id", selectedGroupId);
    fd.append("caption", caption);
    fd.append("file", file);
    startTransition(async () => {
      const res = await uploadSchedulePhoto(fd);
      if (res.error) {
        setToast({ message: res.error, variant: "error" });
      } else {
        setToast({ message: "Photo uploaded", variant: "success" });
        setFile(null);
        setCaption("");
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        router.refresh();
      }
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this photo? This cannot be undone.")) return;
    setDeletingId(id);
    startTransition(async () => {
      const res = await deleteSchedulePhoto(id);
      setDeletingId(null);
      if (res.error) {
        setToast({ message: res.error, variant: "error" });
      } else {
        setToast({ message: "Photo deleted", variant: "success" });
        router.refresh();
      }
    });
  }

  function handleSaveCaption(id: string) {
    startTransition(async () => {
      const res = await updateSchedulePhotoCaption(id, editCaption);
      if (res.error) {
        setToast({ message: res.error, variant: "error" });
      } else {
        setEditingId(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <Toast message={toast?.message ?? null} variant={toast?.variant} onClose={() => setToast(null)} />

      <div className="mb-6">
        <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">Schedule Photos</h1>
        <p className="text-slate-500 text-sm">Photos shown on the landing page for each training group</p>
      </div>

      {groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ImageIcon className="w-10 h-10" />}
            title="No groups with a training schedule"
            description="Add a schedule session to a group first, then come back to upload photos."
          />
        </Card>
      ) : (
        <>
          <Card className="mb-6">
            <h2 className="font-semibold text-slate-900 mb-4">Upload a photo</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label required>Group</Label>
                <Select value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)}>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                      {g.level ? ` · ${g.level}` : ""}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Caption (optional)</Label>
                <Input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="e.g. Tuesday practice"
                />
              </div>
            </div>
            <div className="mt-4">
              <Label required>Photo</Label>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-6 cursor-pointer hover:border-primary/50 transition-colors">
                {previewUrl ? (
                  <div className="flex flex-col items-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewUrl} alt="Preview" className="max-h-40 rounded-lg object-contain mb-2" />
                    <p className="text-sm text-slate-600 font-medium">{file?.name}</p>
                    <p className="text-xs text-slate-400 mt-1">Click to change</p>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-slate-300 mb-2" />
                    <p className="text-sm text-slate-500 mb-1">Click to upload photo</p>
                    <p className="text-xs text-slate-400">PNG, JPG up to 5MB</p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={handleUpload} disabled={isPending || !file}>
                {isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Uploading...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Upload className="w-4 h-4" /> Upload photo
                  </span>
                )}
              </Button>
            </div>
          </Card>

          <div className="space-y-6">
            {photosByGroup.map(({ group, items }) => (
              <Card key={group.id}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-slate-900">
                    {group.name}
                    {group.level && <span className="text-xs text-slate-400 ml-2">{group.level}</span>}
                  </h3>
                  <span className="text-xs text-slate-400">{items.length} photo{items.length === 1 ? "" : "s"}</span>
                </div>
                {items.length === 0 ? (
                  <p className="text-sm text-slate-400">No photos yet for this group.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {items.map((p) => (
                      <div key={p.id} className="group relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                        <div className="relative aspect-[4/3]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <Image
                            src={p.url}
                            alt={p.caption || group.name}
                            fill
                            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                            className="object-cover"
                          />
                          <button
                            onClick={() => handleDelete(p.id)}
                            disabled={isPending && deletingId === p.id}
                            className="absolute top-2 right-2 p-1.5 rounded-md bg-white/90 text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50 shadow-sm"
                            title="Delete"
                          >
                            {deletingId === p.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                        <div className="p-2">
                          {editingId === p.id ? (
                            <div className="flex items-center gap-1.5">
                              <Input
                                value={editCaption}
                                onChange={(e) => setEditCaption(e.target.value)}
                                placeholder="Caption"
                                className="text-xs"
                              />
                              <button
                                onClick={() => handleSaveCaption(p.id)}
                                className="p-1 rounded text-green-600 hover:bg-green-50"
                                title="Save"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="p-1 rounded text-slate-400 hover:bg-slate-100"
                                title="Cancel"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingId(p.id);
                                setEditCaption(p.caption || "");
                              }}
                              className="w-full text-left text-xs text-slate-500 hover:text-slate-900 truncate"
                            >
                              {p.caption || "Add caption..."}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

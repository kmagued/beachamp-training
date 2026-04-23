import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { SchedulePhotosClient } from "./_components/schedule-photos-client";

export default async function AdminSchedulePhotosPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { data: groupRows } = await supabase
    .from("groups")
    .select("id, name, level")
    .eq("is_active", true)
    .order("name");

  const { data: scheduleRows } = await supabase
    .from("schedule_sessions")
    .select("group_id")
    .eq("is_active", true);

  const groupsWithSchedule = new Set<string>((scheduleRows || []).map((r: { group_id: string }) => r.group_id));
  const groups = (groupRows || []).filter((g: { id: string }) => groupsWithSchedule.has(g.id));

  const { data: photoRows } = await supabase
    .from("schedule_photos")
    .select("id, group_id, storage_path, caption, sort_order, created_at")
    .order("sort_order", { ascending: true });

  const publicUrl = (path: string) =>
    supabase.storage.from("schedule-photos").getPublicUrl(path).data.publicUrl as string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const photos = (photoRows || []).map((p: any) => ({
    id: p.id as string,
    group_id: p.group_id as string,
    caption: (p.caption ?? null) as string | null,
    created_at: p.created_at as string,
    url: publicUrl(p.storage_path),
  }));

  return <SchedulePhotosClient groups={groups} photos={photos} />;
}

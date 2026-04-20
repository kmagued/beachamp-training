"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createNotification } from "@/app/_actions/notifications";

export async function createFeedback(input: {
  player_id: string;
  comment: string;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!me || !["admin", "coach"].includes(me.role)) {
    return { error: "Not authorized" };
  }

  const comment = input.comment.trim();
  if (!comment) return { error: "Please enter feedback" };
  if (!input.player_id) return { error: "Please select a player" };

  const { data: created, error } = await supabase
    .from("feedback")
    .insert({
      player_id: input.player_id,
      coach_id: user.id,
      comment,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await createNotification({
    user_id: input.player_id,
    type: "system",
    title: "New feedback",
    body: comment.length > 120 ? comment.slice(0, 117) + "..." : comment,
    link: "/player/feedback",
  });

  revalidatePath("/admin/feedback");
  revalidatePath("/player/feedback");
  return { success: true, id: created?.id };
}

export async function deleteFeedback(id: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!me || me.role !== "admin") return { error: "Not authorized" };

  const { error } = await supabase.from("feedback").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/feedback");
  revalidatePath("/player/feedback");
  return { success: true };
}

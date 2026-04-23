"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createNotification } from "@/app/_actions/notifications";

export async function createCoachFeedback(input: {
  coach_id: string;
  comment: string;
  rating?: number | null;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: me } = await supabase
    .from("profiles")
    .select("id, role, first_name, last_name")
    .eq("id", user.id)
    .single();
  if (!me || me.role !== "player") return { error: "Not authorized" };

  const comment = input.comment.trim();
  if (!comment) return { error: "Please enter feedback" };
  if (!input.coach_id) return { error: "Please select a coach" };
  if (input.rating != null && (input.rating < 1 || input.rating > 5)) {
    return { error: "Rating must be between 1 and 5" };
  }

  const { data: created, error } = await supabase
    .from("coach_feedback")
    .insert({
      player_id: user.id,
      coach_id: input.coach_id,
      comment,
      rating: input.rating ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await createNotification({
    user_id: input.coach_id,
    type: "system",
    title: `New feedback from ${me.first_name} ${me.last_name}`,
    body: comment.length > 120 ? comment.slice(0, 117) + "..." : comment,
    link: "/coach/feedback",
  });

  revalidatePath("/player/feedback");
  revalidatePath("/coach/feedback");
  revalidatePath("/admin/feedback");
  return { success: true, id: created?.id };
}

"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { revalidatePath } from "next/cache";
import { findConflictsForBlock, type Conflict, type CreateBlockInput } from "@/lib/scheduling/coach-availability";

type CreateResult =
  | { success: true; id: string; conflicts: Conflict[] }
  | { error: string };

type DeleteResult = { success: true } | { error: string };

export async function createCoachBlock(input: CreateBlockInput): Promise<CreateResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  if (user.profile.role !== 'admin' && input.coach_id !== user.id) {
    return { error: "You can only block your own time" };
  }

  if (input.kind === 'one_time') {
    if (!input.start_date) return { error: "Start date is required for one-time blocks" };
    if (input.day_of_week !== null && input.day_of_week !== undefined) {
      return { error: "day_of_week must be null for one-time blocks" };
    }
    if (input.end_date && input.end_date < input.start_date) {
      return { error: "End date must be on or after start date" };
    }
  } else {
    if (input.day_of_week === null || input.day_of_week === undefined) {
      return { error: "Day of week is required for weekly blocks" };
    }
    if (input.day_of_week < 0 || input.day_of_week > 6) {
      return { error: "Day of week must be 0-6" };
    }
    if (!input.start_time || !input.end_time) {
      return { error: "Start and end time are required for weekly blocks" };
    }
  }

  if (input.start_time && input.end_time && input.start_time >= input.end_time) {
    return { error: "End time must be after start time" };
  }

  const conflicts = await findConflictsForBlock(input);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from("coach_blocks")
    .insert({
      coach_id: input.coach_id,
      kind: input.kind,
      start_date: input.start_date ?? null,
      end_date: input.end_date ?? null,
      day_of_week: input.day_of_week ?? null,
      effective_from: input.effective_from ?? null,
      effective_until: input.effective_until ?? null,
      start_time: input.start_time ?? null,
      end_time: input.end_time ?? null,
      reason: input.reason ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/coach/schedule");
  revalidatePath("/admin/schedule");

  return { success: true, id: data.id, conflicts };
}

export async function deleteCoachBlock(id: string): Promise<DeleteResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: block } = await admin
    .from("coach_blocks")
    .select("coach_id")
    .eq("id", id)
    .maybeSingle();

  if (!block) return { error: "Block not found" };

  if (user.profile.role !== 'admin' && block.coach_id !== user.id) {
    return { error: "You can only delete your own blocks" };
  }

  const { error } = await admin.from("coach_blocks").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/coach/schedule");
  revalidatePath("/admin/schedule");

  return { success: true };
}

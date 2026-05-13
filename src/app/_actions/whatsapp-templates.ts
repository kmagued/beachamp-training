"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { revalidatePath } from "next/cache";
import type { WhatsappTemplate } from "@/types/database";

type Result<T> = (T & { success: true }) | { error: string };

type AdminAuth = { ok: true; user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>> } | { ok: false; error: string };

async function requireAdmin(): Promise<AdminAuth> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authenticated" };
  if (user.profile.role !== "admin") return { ok: false, error: "Not authorized" };
  return { ok: true, user };
}

export async function listTemplates(opts?: { activeOnly?: boolean }): Promise<WhatsappTemplate[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  let query = admin
    .from("whatsapp_templates")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (opts?.activeOnly) query = query.eq("is_active", true);
  const { data } = await query;
  return (data || []) as WhatsappTemplate[];
}

export async function createTemplate(input: { name: string; body: string; is_active: boolean }): Promise<Result<{ id: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  if (!input.name?.trim()) return { error: "Name is required" };
  if (!input.body?.trim()) return { error: "Body is required" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: maxRow } = await admin
    .from("whatsapp_templates")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((maxRow?.sort_order as number | undefined) ?? -1) + 1;

  const { data, error } = await admin
    .from("whatsapp_templates")
    .insert({
      name: input.name.trim(),
      body: input.body,
      is_active: input.is_active,
      sort_order: nextOrder,
      created_by: auth.user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/admin/whatsapp-templates");
  return { success: true, id: data.id };
}

export async function updateTemplate(
  id: string,
  input: { name?: string; body?: string; is_active?: boolean }
): Promise<Result<{}>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  if (input.name !== undefined && !input.name.trim()) return { error: "Name cannot be empty" };
  if (input.body !== undefined && !input.body.trim()) return { error: "Body cannot be empty" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: any = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.body !== undefined) patch.body = input.body;
  if (input.is_active !== undefined) patch.is_active = input.is_active;

  const { error } = await admin.from("whatsapp_templates").update(patch).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/whatsapp-templates");
  return { success: true };
}

export async function deleteTemplate(id: string): Promise<Result<{}>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { error } = await admin.from("whatsapp_templates").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/whatsapp-templates");
  return { success: true };
}

export async function reorderTemplates(orderedIds: string[]): Promise<Result<{}>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const results = await Promise.all(
    orderedIds.map((id, idx) =>
      admin.from("whatsapp_templates").update({ sort_order: idx }).eq("id", id)
    )
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const failures = results.filter((r: any) => r.error);
  if (failures.length > 0) return { error: `Failed to reorder ${failures.length} rows` };

  revalidatePath("/admin/whatsapp-templates");
  return { success: true };
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function submitRenewal(formData: FormData) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const packageId = formData.get("package_id") as string;
  const method = formData.get("method") as string;

  if (!packageId || !method) return { error: "Please select a package and payment method" };

  // Fetch the package to get details
  const { data: pkg } = await supabase
    .from("packages")
    .select("*")
    .eq("id", packageId)
    .single();

  if (!pkg) return { error: "Package not found" };

  // Create subscription (pending)
  const { data: subscription, error: subError } = await supabase
    .from("subscriptions")
    .insert({
      player_id: user.id,
      package_id: packageId,
      sessions_remaining: pkg.session_count,
      sessions_total: pkg.session_count,
      status: "pending",
    })
    .select()
    .single();

  if (subError) return { error: subError.message };

  // Handle screenshot upload
  let screenshotUrl: string | null = null;
  const screenshot = formData.get("screenshot") as File | null;
  if (screenshot && screenshot.size > 0) {
    const ext = screenshot.name.split(".").pop();
    const path = `${user.id}/${Date.now()}_${screenshot.name}`;
    const { error: uploadError } = await supabase.storage
      .from("payment-screenshots")
      .upload(path, screenshot, { contentType: screenshot.type });

    if (!uploadError) {
      screenshotUrl = path;
    }
  }

  // Create payment (pending)
  const { error: payError } = await supabase.from("payments").insert({
    player_id: user.id,
    subscription_id: subscription.id,
    amount: pkg.price,
    method,
    screenshot_url: screenshotUrl,
    status: "pending",
  });

  if (payError) return { error: payError.message };

  revalidatePath("/player/dashboard");
  revalidatePath("/player/renew");
  return { success: true };
}

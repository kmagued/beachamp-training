import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { RequestFormPage } from "./_components/request-form-page";

export default async function RequestPrivateSessionPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { data: coaches } = await supabase
    .from("profiles")
    .select("id, first_name, last_name")
    .in("role", ["coach", "admin"])
    .eq("is_active", true)
    .order("first_name");

  return <RequestFormPage coaches={coaches || []} />;
}

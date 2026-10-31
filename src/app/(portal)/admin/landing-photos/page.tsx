import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { LANDING_PHOTOS_BUCKET, landingPhotosFrom } from "@/lib/config/landing-photos";
import { LandingPhotosClient } from "./_components/landing-photos-client";

export default async function AdminLandingPhotosPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { data: rows } = await supabase.from("landing_photos").select("slot, storage_path");

  const photos = landingPhotosFrom(
    rows || [],
    (path) => supabase.storage.from(LANDING_PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl as string,
  );

  return <LandingPhotosClient photos={photos} />;
}

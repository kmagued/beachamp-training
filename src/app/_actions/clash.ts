"use server";

import { getCurrentUser } from "@/lib/auth/user";
import {
  isClashConfigured,
  listClashCourts,
  ClashApiError,
  type ClashCourt,
} from "@/lib/clash/client";

export interface ClashCourtOption {
  id: string;
  name: string;
}

/** Returns the Clash courts the academy can reserve, for admin UI dropdowns. */
export async function getClashCourts(): Promise<{
  enabled: boolean;
  courts: ClashCourtOption[];
  error?: string;
}> {
  const user = await getCurrentUser();
  if (!user || user.profile.role !== "admin") {
    return { enabled: false, courts: [], error: "Not authorized" };
  }

  if (!isClashConfigured()) {
    return { enabled: false, courts: [] };
  }

  try {
    const courts: ClashCourt[] = await listClashCourts();
    return {
      enabled: true,
      courts: courts
        .filter((c) => c.isActive)
        .map((c) => ({ id: c.id, name: c.name })),
    };
  } catch (err) {
    const message = err instanceof ClashApiError ? err.message : "Failed to load courts";
    return { enabled: true, courts: [], error: message };
  }
}

// Client for The Clash — Public Partner API.
// See PUBLIC_PARTNER_API.md at the repo root for the full reference.
//
// Configuration:
//   CLASH_API_KEY      — partner API key (pk_live_… / pk_test_…)
//   CLASH_API_BASE_URL — defaults to https://api.theclasheg.com/api/public/v1
//
// When CLASH_API_KEY is unset, isClashConfigured() returns false and callers
// should skip the integration. This lets the app run pre-key (e.g. while
// the key is still being provisioned by the Clash admin team).

export interface ClashCourt {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  reservationCount: number;
}

export interface ClashReservationCategory {
  id: string;
  name: string;
  pricePerHour: number;
  isActive: boolean;
  reservationCount: number;
  createdAt: string;
  updatedAt: string;
}

export type ClashReservationStatus = 1 | 2 | 3 | 4; // Pending | Confirmed | Cancelled | Completed

export interface ClashReservation {
  id: string;
  courtId: string;
  courtName: string;
  startTime: string;
  endTime: string;
  status: ClashReservationStatus;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  reservationCategoryId: string | null;
  reservationCategoryName: string | null;
  needBall: boolean;
  cost: number;
  notes: string | null;
  externalPaymentReference: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClashBusySlot {
  id: string;
  courtId: string;
  startTime: string;
  endTime: string;
  status: ClashReservationStatus;
}

interface ClashEnvelope<T> {
  data: T;
  success: boolean;
  message?: string;
  errors?: string[];
}

export interface CreateReservationInput {
  courtId: string;
  startTime: string; // ISO 8601 with timezone offset
  endTime: string;   // ISO 8601 with timezone offset
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  needBall?: boolean;
  reservationCategoryId?: string;
  notes?: string;
  externalPaymentReference: string;
}

const DEFAULT_BASE_URL = "https://api.theclasheg.com/api/public/v1";
const DEFAULT_TIMEOUT_MS = 15_000;

export class ClashApiError extends Error {
  status: number;
  fieldErrors: string[];
  constructor(message: string, status: number, fieldErrors: string[] = []) {
    super(message);
    this.name = "ClashApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

export function isClashConfigured(): boolean {
  return Boolean(process.env.CLASH_API_KEY);
}

function getConfig() {
  const apiKey = process.env.CLASH_API_KEY;
  const baseUrl = process.env.CLASH_API_BASE_URL || DEFAULT_BASE_URL;
  if (!apiKey) {
    throw new ClashApiError("CLASH_API_KEY is not configured", 0);
  }
  return { apiKey, baseUrl };
}

async function request<T>(
  path: string,
  init: RequestInit & { query?: Record<string, string | undefined> } = {}
): Promise<T> {
  const { apiKey, baseUrl } = getConfig();

  let url = `${baseUrl}${path}`;
  if (init.query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(init.query)) {
      if (v !== undefined && v !== null && v !== "") params.set(k, v);
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers || {}),
      },
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);
    throw new ClashApiError(`Network error contacting Clash API: ${msg}`, 0);
  }
  clearTimeout(timeout);

  let body: ClashEnvelope<T> | null = null;
  try {
    body = (await res.json()) as ClashEnvelope<T>;
  } catch {
    // fall through — non-JSON body
  }

  if (!res.ok || !body || body.success === false) {
    const message = body?.message || `Clash API request failed (${res.status})`;
    throw new ClashApiError(message, res.status, body?.errors || []);
  }

  return body.data;
}

export async function listClashCourts(): Promise<ClashCourt[]> {
  return request<ClashCourt[]>("/courts", { method: "GET" });
}

export async function listClashReservationCategories(): Promise<ClashReservationCategory[]> {
  return request<ClashReservationCategory[]>("/reservation-categories", { method: "GET" });
}

export async function checkClashAvailability(params: {
  courtId: string;
  startTime: string;
  endTime: string;
}): Promise<boolean> {
  return request<boolean>("/availability", {
    method: "GET",
    query: {
      courtId: params.courtId,
      startTime: params.startTime,
      endTime: params.endTime,
    },
  });
}

export async function listClashBusySlots(params: {
  courtId: string;
  from: string;
  to: string;
}): Promise<ClashBusySlot[]> {
  return request<ClashBusySlot[]>("/busy-slots", {
    method: "GET",
    query: { courtId: params.courtId, from: params.from, to: params.to },
  });
}

export async function createClashReservation(input: CreateReservationInput): Promise<ClashReservation> {
  return request<ClashReservation>("/reservations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getClashReservation(id: string): Promise<ClashReservation> {
  return request<ClashReservation>(`/reservations/${id}`, { method: "GET" });
}

export async function listClashReservations(): Promise<ClashReservation[]> {
  return request<ClashReservation[]>("/reservations", { method: "GET" });
}

export async function cancelClashReservation(id: string): Promise<boolean> {
  return request<boolean>(`/reservations/${id}`, { method: "DELETE" });
}

// Format a (yyyy-mm-dd, HH:mm) pair as ISO 8601 with the Africa/Cairo offset
// the Clash API expects. Cairo is UTC+02:00 year-round (no DST since 2014).
export function toCairoIso(date: string, time: string): string {
  const hhmm = time.length >= 5 ? time.slice(0, 5) : time;
  return `${date}T${hhmm}:00+02:00`;
}

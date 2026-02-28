/** Format a date string (YYYY-MM-DD) or Date as "Wed 22/02/2026" */
export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date + (date.includes("T") ? "" : "T00:00:00")) : date;
  const day = d.toLocaleDateString("en-GB", { weekday: "short" });
  const rest = d.toLocaleDateString("en-GB");
  return `${day} ${rest}`;
}

/** Format a datetime string as "Wed 22/02/2026, 14:30" */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const day = d.toLocaleDateString("en-GB", { weekday: "short" });
  const rest = d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day} ${rest}`;
}

// Fold-away sidebar sections: which sections exist, which one holds the current page,
// and which ones the admin has left open (remembered in the browser).

export interface SectionedItem {
  key: string;
  section?: string;
}

/** Consecutive links under the same heading; links without a heading form their own group */
export function groupBySection<T extends SectionedItem>(items: T[]): { section: string | null; items: T[] }[] {
  const groups: { section: string | null; items: T[] }[] = [];
  for (const item of items) {
    const section = item.section ?? null;
    const last = groups[groups.length - 1];
    if (last && last.section === section) last.items.push(item);
    else groups.push({ section, items: [item] });
  }
  return groups;
}

export function sectionOfKey(items: SectionedItem[], key: string): string | null {
  return items.find((i) => i.key === key)?.section ?? null;
}

/** Opens the section of the page being visited, keeping whatever else is open */
export function withSection(open: string[], section: string | null): string[] {
  return section && !open.includes(section) ? [...open, section] : open;
}

export function toggleSection(open: string[], section: string): string[] {
  return open.includes(section) ? open.filter((s) => s !== section) : [...open, section];
}

/** Open sections saved in the browser; null when nothing usable was saved */
export function parseOpenSections(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((s): s is string => typeof s === "string") : null;
  } catch {
    return null;
  }
}

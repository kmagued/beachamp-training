// The phone tab bar: what goes under More. A portal whose pages all fit on the bar gets
// no More tab at all.

/** The menu items that aren't tabs, in menu order */
export function pagesUnderMore<T extends { key: string }>(tabs: { key: string }[], items: T[]): T[] {
  return items.filter((item) => !tabs.some((t) => t.key === item.key));
}

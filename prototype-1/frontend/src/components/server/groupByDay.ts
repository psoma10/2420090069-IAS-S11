import { dayKey, formatDayLabel } from "./format";
import type { ActivityItem } from "../../types/api";

export interface DayGroup {
  key: string;
  label: string;
  items: ActivityItem[];
}

/** Buckets a newest-first list into contiguous day groups, preserving order. */
export function groupByDay(items: ActivityItem[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const item of items) {
    const key = dayKey(item.at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(item);
    } else {
      groups.push({ key, label: formatDayLabel(item.at), items: [item] });
    }
  }
  return groups;
}


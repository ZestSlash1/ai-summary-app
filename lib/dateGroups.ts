import type { Conversation } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Buckets conversations into day-based groups for the sidebar list.
 * Expects `conversations` already sorted newest-first. */
export function groupConversationsByDay(
  conversations: Conversation[]
): { label: string; items: Conversation[] }[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - DAY_MS;
  const startOfWeek = startOfToday - 7 * DAY_MS;

  const groups: { label: string; items: Conversation[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 days", items: [] },
    { label: "Earlier", items: [] },
  ];

  for (const c of conversations) {
    if (c.createdAt >= startOfToday) groups[0].items.push(c);
    else if (c.createdAt >= startOfYesterday) groups[1].items.push(c);
    else if (c.createdAt >= startOfWeek) groups[2].items.push(c);
    else groups[3].items.push(c);
  }

  return groups.filter((g) => g.items.length > 0);
}

/** Short relative-time label ("2h ago", "3d ago") for status pills. */
export function relativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

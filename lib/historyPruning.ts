/**
 * Drops oldest turns from conversation history when context limit is approached.
 * Ensures that pruning never cuts in the middle of a turn or tool call exchange,
 * and preserves at least the latest user prompt.
 */
export function pruneOldTurns<T extends { role: string }>(
  messages: T[],
  count = 2
): T[] {
  if (!Array.isArray(messages) || messages.length <= 1) {
    return messages;
  }

  // Find the index of the last user message so we never prune the active prompt
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') {
      lastUserIndex = i;
      break;
    }
  }

  if (lastUserIndex <= 0) {
    return messages;
  }

  // Target drop count, capped before the last user message
  const target = Math.min(Math.max(1, count), lastUserIndex);

  // Advance cut point until we find a clean user message boundary
  let cutIndex = target;
  while (cutIndex < lastUserIndex && messages[cutIndex]?.role !== 'user') {
    cutIndex++;
  }

  // If scanning reached beyond lastUserIndex or did not land on a user message,
  // fall back to lastUserIndex
  if (messages[cutIndex]?.role !== 'user') {
    cutIndex = lastUserIndex;
  }

  return messages.slice(cutIndex);
}

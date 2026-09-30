import type { UIMessage } from "ai";

/**
 * A continued chat opens with a hand-off summary stored as a system-role message so the user
 * can read it. AI SDK v7 refuses system messages inside `messages` ("Use the instructions
 * option instead"), and strict chat templates (Bonsai's) reject a second system message, so
 * they are lifted out here and sent as part of the system prompt instead.
 */
export function splitSystemMessages(messages: UIMessage[]): { system: string; rest: UIMessage[] } {
  const system: string[] = [];
  const rest: UIMessage[] = [];
  for (const message of messages) {
    if (message.role !== "system") {
      rest.push(message);
      continue;
    }
    const text = message.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join("\n\n")
      .trim();
    if (text) system.push(text);
  }
  return { system: system.join("\n\n"), rest };
}

/** The sentence that introduces hand-off context in a system prompt, with a size cap. */
export function handoffPrompt(system: string, maxChars = 12_000): string {
  if (!system) return "";
  return `\n\nThis chat continues an earlier one that ran out of room. Context carried over from it:\n\n${system.slice(0, maxChars)}`;
}

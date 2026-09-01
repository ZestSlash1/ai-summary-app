import { generateObject } from "ai";
import { z } from "zod";
import { supabase } from "./supabase";
import { BUILTIN_SKILLS, matchSkills, type Skill } from "./skills";

const DISCOVERY_MODEL = "minimax/minimax-m3-free";
const STOPWORDS = new Set([
  "this", "that", "with", "from", "have", "what", "when", "where", "which",
  "your", "about", "into", "just", "like", "make", "need", "want", "help",
  "please", "could", "would", "should", "also", "then", "than", "they",
  "them", "there", "here", "does", "doing", "will", "code",
]);

type SkillRow = {
  id: string;
  name: string;
  description: string;
  usage_tip: string;
  keywords: string[];
  status: "proposed" | "approved" | "rejected";
  evidence: string | null;
};

function toSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    usageTip: row.usage_tip,
    keywords: row.keywords ?? [],
    status: row.status,
    evidence: row.evidence ?? undefined,
  };
}

export async function getUserSkills(
  userId: string
): Promise<{ approved: Skill[]; proposed: Skill[] }> {
  const { data } = await supabase
    .from("skills")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["approved", "proposed"])
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as SkillRow[];
  return {
    approved: rows.filter((r) => r.status === "approved").map(toSkill),
    proposed: rows.filter((r) => r.status === "proposed").map(toSkill),
  };
}

function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

/**
 * Logs a one-line signal for a user message that didn't match any known
 * skill, then checks whether recent signals cluster on a shared keyword. If
 * ≥3 do, synthesizes a candidate skill via one cheap model call and inserts
 * it as `status: 'proposed'` — genuinely autonomous (nothing prompts this
 * check, it runs on every unmatched message), but a simple, inspectable
 * heuristic rather than a black-box pipeline. Never throws: this is a
 * best-effort background pass and must not break the chat response.
 */
export async function logSignalAndMaybePropose(
  userId: string,
  userMessage: string
) {
  try {
    const summary = userMessage.trim().slice(0, 200);
    if (!summary) return;

    await supabase.from("skill_signals").insert({ user_id: userId, summary });

    const { data: recent } = await supabase
      .from("skill_signals")
      .select("id, summary")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!recent || recent.length < 3) return;

    const wordSignals = new Map<string, Set<string>>();
    for (const row of recent) {
      for (const w of new Set(significantWords(row.summary))) {
        if (!wordSignals.has(w)) wordSignals.set(w, new Set());
        wordSignals.get(w)!.add(row.id);
      }
    }

    let clusterWord: string | null = null;
    let clusterIds: string[] = [];
    for (const [w, ids] of wordSignals) {
      if (ids.size >= 3 && ids.size > clusterIds.length) {
        clusterWord = w;
        clusterIds = [...ids];
      }
    }
    if (!clusterWord) return;

    const { data: existingSkills } = await supabase
      .from("skills")
      .select("keywords")
      .eq("user_id", userId);
    const alreadyCovered = (existingSkills ?? []).some((s) =>
      (s.keywords ?? []).includes(clusterWord)
    );
    if (alreadyCovered) return;

    const evidence = recent
      .filter((r) => clusterIds.includes(r.id))
      .map((r) => r.summary);

    const { object } = await generateObject({
      model: DISCOVERY_MODEL,
      schema: z.object({
        name: z.string().describe("Short skill name, 2-4 words"),
        description: z.string().describe("One sentence, what this skill does"),
        usageTip: z
          .string()
          .describe("One sentence of advice to the user, written as a tip"),
        keywords: z
          .array(z.string())
          .min(2)
          .max(6)
          .describe("Lowercase words/phrases likely to appear in a triggering message"),
      }),
      prompt: `A user has repeatedly asked things like:\n${evidence.map((s) => `- ${s}`).join("\n")}\n\nPropose a short, reusable skill that captures this recurring need.`,
    });

    await supabase.from("skills").insert({
      user_id: userId,
      name: object.name,
      description: object.description,
      usage_tip: object.usageTip,
      keywords: object.keywords,
      status: "proposed",
      evidence: evidence.join(" | "),
    });

    // Consume the signals that contributed so they don't immediately
    // re-trigger a duplicate proposal.
    await supabase.from("skill_signals").delete().in("id", clusterIds);
  } catch {
    // Best-effort background pass — never let this break the chat response.
  }
}

export function messageMatchesKnownSkill(
  message: string,
  approved: Skill[]
): boolean {
  return matchSkills(message, [...BUILTIN_SKILLS, ...approved]).length > 0;
}

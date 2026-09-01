export type Skill = {
  id: string;
  name: string;
  description: string;
  usageTip: string;
  keywords: string[];
  status?: "proposed" | "approved" | "rejected";
  evidence?: string;
};

export const BUILTIN_SKILLS: Skill[] = [
  {
    id: "github-push",
    name: "GitHub Push",
    description:
      "Commits AI-generated code straight to a GitHub repo as you go.",
    usageTip:
      'Try: "push this to my repo" — I\'ll commit any tagged code blocks to the connected repo.',
    keywords: [
      "push",
      "commit",
      "github",
      "repo",
      "repository",
      "deploy this code",
    ],
  },
];

/** Keyword-matches a message against a skill list. Client-safe, no network
 * or DB access — callers supply whichever skills (built-in, approved,
 * both) should be considered. */
export function matchSkills(message: string, skills: Skill[]): Skill[] {
  const lower = message.toLowerCase();
  return skills.filter((skill) =>
    skill.keywords.some((kw) => lower.includes(kw))
  );
}

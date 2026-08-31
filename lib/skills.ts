export type Skill = {
  id: string;
  name: string;
  description: string;
  usageTip: string;
  keywords: string[];
};

export const SKILLS: Skill[] = [
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

/** Keyword-matches the latest user message against the skill registry. */
export function detectSkills(message: string): Skill[] {
  const lower = message.toLowerCase();
  return SKILLS.filter((skill) =>
    skill.keywords.some((kw) => lower.includes(kw))
  );
}

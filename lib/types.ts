import type { UIMessage } from "ai";

export type ModelOption = {
  id: string;
  name: string;
  free: boolean;
};

export type GithubRepoLink = {
  owner: string;
  name: string;
  branch: string;
};

export type AgentEffort = "low" | "medium" | "high";
export type AgentPermission = "ask" | "auto" | "readonly";

export interface AgentToolToggles {
  repo?: boolean;
  web?: boolean;
  calculate?: boolean;
  imageEdit?: boolean;
}

export interface AgentOptions {
  effort?: AgentEffort;
  permission?: AgentPermission;
  tools?: AgentToolToggles;
  maxSteps?: number;
  customInstructions?: string;
}

export type Conversation = {
  id: string;
  title: string;
  messages: UIMessage[];
  model: string;
  createdAt: number;
  githubRepo?: GithubRepoLink;
  mode?: "chat" | "code";
  continuedFrom?: { id: string; title: string };
  continuedIn?: { id: string; title: string };
  agentOptions?: AgentOptions;
};

// Absolute last-resort fallback, used only when /api/models itself is
// unreachable -- new conversations otherwise get a live source-aware default
// from fetchDefaultModelForSource() in lib/models.ts.
export const FALLBACK_MODEL = "minimax/minimax-m3";

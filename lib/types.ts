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

export type Conversation = {
  id: string;
  title: string;
  messages: UIMessage[];
  model: string;
  createdAt: number;
  githubRepo?: GithubRepoLink;
};

export const DEFAULT_MODEL = "minimax/minimax-m3";

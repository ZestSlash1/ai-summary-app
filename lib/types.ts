import type { UIMessage } from "ai";

export type ModelOption = {
  id: string;
  name: string;
  free: boolean;
};

export type Conversation = {
  id: string;
  title: string;
  messages: UIMessage[];
  model: string;
  createdAt: number;
};

export const DEFAULT_MODEL = "minimax/minimax-m3";

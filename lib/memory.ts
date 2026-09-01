import { embedMany, embed } from "ai";
import { supabase } from "./supabase";

const EMBEDDING_MODEL = "voyage/voyage-code-3";
const MAX_CHARS_PER_FILE = 8000; // keeps each chunk well within the model's context

export type MemoryFile = { path: string; content: string };

/** Embeds and upserts a repo's files into memory_chunks, keyed on
 * (user, repo, path) — re-ingesting a path replaces its old chunk instead
 * of duplicating it. Large files are truncated rather than split into
 * multiple chunks, keeping the schema and retrieval simple. */
export async function ingestFiles(
  userId: string,
  repo: string,
  files: MemoryFile[]
): Promise<number> {
  if (files.length === 0) return 0;

  const trimmed = files.map((f) => ({
    ...f,
    content: f.content.slice(0, MAX_CHARS_PER_FILE),
  }));

  const { embeddings } = await embedMany({
    model: EMBEDDING_MODEL,
    values: trimmed.map((f) => `File: ${f.path}\n\n${f.content}`),
  });

  const rows = trimmed.map((f, i) => ({
    user_id: userId,
    repo,
    path: f.path,
    content: f.content,
    embedding: embeddings[i],
  }));

  const { error } = await supabase
    .from("memory_chunks")
    .upsert(rows, { onConflict: "user_id,repo,path" });

  if (error) throw new Error(error.message);
  return rows.length;
}

export type MemoryMatch = { path: string; content: string; similarity: number };

/** Semantic search over a user's memory for one repo. */
export async function retrieveMemory(
  userId: string,
  repo: string,
  query: string,
  matchCount = 5
): Promise<MemoryMatch[]> {
  const { embedding } = await embed({ model: EMBEDDING_MODEL, value: query });

  const { data, error } = await supabase.rpc("match_memory_chunks", {
    query_embedding: embedding,
    match_user: userId,
    match_repo: repo,
    match_count: matchCount,
  });

  if (error) throw new Error(error.message);
  return (data ?? []) as MemoryMatch[];
}

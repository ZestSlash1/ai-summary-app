import type { ModelSource } from "./storage";

/**
 * A chat's model is stored as "source::id" (for example "bonsai::bonsai-2-27b"), so the
 * source travels with the choice. Before this, the source was one app-wide setting and
 * each chat kept only an id, so switching the source left chats showing and sending a
 * model from the old one.
 *
 * Plain ids from older chats have no source; they take the old app-wide one.
 */
export type ModelRef = { source: ModelSource; id: string };

const SEP = "::";
const SOURCES: readonly ModelSource[] = ["gateway", "omniroute", "bonsai", "hermes"];

export function isModelSource(value: string): value is ModelSource {
  return (SOURCES as readonly string[]).includes(value);
}

export function parseModelRef(value: string, legacySource: ModelSource = "gateway"): ModelRef {
  const at = value.indexOf(SEP);
  if (at > 0) {
    const source = value.slice(0, at);
    if (isModelSource(source)) return { source, id: value.slice(at + SEP.length) };
  }
  return { source: legacySource, id: value };
}

export function toModelRef(source: ModelSource, id: string): string {
  return `${source}${SEP}${id}`;
}

export function isQualifiedRef(value: string): boolean {
  const at = value.indexOf(SEP);
  return at > 0 && isModelSource(value.slice(0, at));
}

/** Where a source runs, in words for labels and the model's own system prompt. */
export const SOURCE_INFO: Record<ModelSource, { name: string; runs: string; local: boolean }> = {
  gateway: { name: "AI Gateway", runs: "Vercel AI Gateway", local: false },
  omniroute: { name: "OmniRoute", runs: "OmniRoute", local: false },
  bonsai: { name: "Bonsai", runs: "the owner's home PC (local)", local: true },
  hermes: { name: "Hermes", runs: "the owner's home PC (Hermes agent)", local: true },
};

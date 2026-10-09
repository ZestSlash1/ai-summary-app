/**
 * Mods: small visual switches for the chat, in the spirit of Claude Code's mods. Each one is
 * either on/off or one pick from a short list, kept per device in localStorage.
 *
 * A mod works in one of two ways. Most are pure CSS: the choice becomes a `data-mod-<id>`
 * attribute on <html>, and app/globals.css restyles from it, so a mod costs no JavaScript at
 * render time. A few swap a component in or out (the particle field, the reply glow), and
 * those components read the state through useMods.
 *
 * Kept free of React and the DOM globals so the rules can be unit tested.
 */

export type ModGroup = "Atmosphere" | "Motion and reading" | "Color";

type ModBase = { id: string; name: string; description: string; group: ModGroup };
export type ToggleMod = ModBase & { kind: "toggle"; default: boolean };
export type ChoiceMod = ModBase & {
  kind: "choice";
  default: string;
  options: readonly { value: string; label: string; /** A color to draw beside the label. */ swatch?: string }[];
};
export type Mod = ToggleMod | ChoiceMod;

export const MODS = [
  {
    id: "field",
    kind: "toggle",
    group: "Atmosphere",
    name: "Particle field",
    description: "Drifting light behind the welcome screen.",
    default: true,
  },
  {
    id: "aurora",
    kind: "toggle",
    group: "Atmosphere",
    name: "Aurora",
    description: "The colored glow under the welcome screen.",
    default: true,
  },
  {
    id: "glow",
    kind: "toggle",
    group: "Atmosphere",
    name: "Reply glow",
    description: "Light behind the thread while a reply is on its way.",
    default: true,
  },
  {
    id: "spotlight",
    kind: "toggle",
    group: "Atmosphere",
    name: "Spotlight",
    description: "A soft light that follows your pointer.",
    default: false,
  },
  {
    id: "rise",
    kind: "toggle",
    group: "Motion and reading",
    name: "Rise in",
    description: "New messages fade up into place.",
    default: false,
  },
  {
    id: "beam",
    kind: "toggle",
    group: "Motion and reading",
    name: "Composer beam",
    description: "The lights that run the composer's edge while ARO replies.",
    default: true,
  },
  {
    id: "focus",
    kind: "toggle",
    group: "Motion and reading",
    name: "Focus mode",
    description: "Dims older messages so the latest reply stands out. Hover one to bring it back.",
    default: false,
  },
  {
    id: "size",
    kind: "choice",
    group: "Motion and reading",
    name: "Reading size",
    description: "The size of ARO's replies.",
    default: "default",
    options: [
      { value: "small", label: "Small" },
      { value: "default", label: "Default" },
      { value: "large", label: "Large" },
    ],
  },
  {
    id: "code",
    kind: "choice",
    group: "Color",
    name: "Code colors",
    description: "The palette inside code blocks.",
    default: "default",
    options: [
      { value: "default", label: "Default" },
      { value: "midnight", label: "Midnight", swatch: "#7aa2ff" },
      { value: "paper", label: "Paper", swatch: "#b0652d" },
      { value: "terminal", label: "Terminal", swatch: "#4ade80" },
    ],
  },
  {
    id: "accent",
    kind: "choice",
    group: "Color",
    name: "Accent",
    description: "The color of buttons, links, and highlights.",
    default: "blue",
    options: [
      { value: "blue", label: "Blue", swatch: "#135feb" },
      { value: "violet", label: "Violet", swatch: "#6a3de8" },
      { value: "ember", label: "Ember", swatch: "#c2410c" },
      { value: "mint", label: "Mint", swatch: "#0f7a57" },
      { value: "rose", label: "Rose", swatch: "#c8235f" },
    ],
  },
] as const satisfies readonly Mod[];

export type ModId = (typeof MODS)[number]["id"];
export type ModValue = boolean | string;
export type ModState = Record<ModId, ModValue>;

export const MODS_KEY = "aro-mods";

const BY_ID: ReadonlyMap<string, Mod> = new Map(MODS.map((m) => [m.id, m]));

export const DEFAULT_MODS = Object.freeze(
  Object.fromEntries(MODS.map((m) => [m.id, m.default])) as ModState,
);

/** Whether a stored value is acceptable for a mod: a boolean for a switch, a listed option for a pick. */
function valid(mod: Mod, value: unknown): value is ModValue {
  if (mod.kind === "toggle") return typeof value === "boolean";
  return typeof value === "string" && mod.options.some((o) => o.value === value);
}

/** Turns whatever came out of storage into a complete, valid state. Unknown mods and bad values fall back to defaults. */
export function normalizeMods(raw: unknown): ModState {
  const state: ModState = { ...DEFAULT_MODS };
  if (!raw || typeof raw !== "object") return state;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const mod = BY_ID.get(id);
    if (mod && valid(mod, value)) state[mod.id as ModId] = value;
  }
  return state;
}

export function parseStoredMods(json: string | null): ModState {
  if (!json) return { ...DEFAULT_MODS };
  try {
    return normalizeMods(JSON.parse(json));
  } catch {
    return { ...DEFAULT_MODS };
  }
}

/** Sets one mod, ignoring a value the mod does not accept. */
export function setMod(state: ModState, id: ModId, value: ModValue): ModState {
  const mod = BY_ID.get(id);
  if (!mod || !valid(mod, value)) return state;
  return { ...state, [id]: value };
}

/** How many mods differ from their defaults, for the badge on the Mods button. */
export function changedCount(state: ModState): number {
  return MODS.filter((m) => state[m.id] !== m.default).length;
}

/** The attribute each mod becomes on <html>: "on"/"off" for a switch, the picked value for a choice. */
export function modAttributes(state: ModState): Record<string, string> {
  const out: Record<string, string> = {};
  for (const mod of MODS) {
    const value = state[mod.id];
    out[`data-mod-${mod.id}`] = mod.kind === "toggle" ? (value ? "on" : "off") : String(value);
  }
  return out;
}

/** Runs before first paint (see app/layout.tsx), so a saved accent never flashes the default. Mirrors modAttributes. */
export const MODS_INIT_SCRIPT = `(function(){try{
var d=${JSON.stringify(
  Object.fromEntries(MODS.map((m) => [m.id, m.kind === "toggle" ? m.default : { default: m.default, options: m.options.map((o) => o.value) }])),
)};
var s=JSON.parse(localStorage.getItem(${JSON.stringify(MODS_KEY)})||"{}"),r=document.documentElement;
for(var id in d){var m=d[id],v=s[id];
if(typeof m==="boolean"){r.setAttribute("data-mod-"+id,(typeof v==="boolean"?v:m)?"on":"off")}
else{r.setAttribute("data-mod-"+id,typeof v==="string"&&m.options.indexOf(v)>-1?v:m.default)}}
}catch(e){}})();`;

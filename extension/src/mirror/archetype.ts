// AI Collaboration Mirror — pure archetype engine (no editor/runtime deps).
//
// Turns locally-computed, privacy-safe aggregates into an *identity* ("what
// kind of AI collaborator are you?") rather than a productivity score. Runs
// fully offline; the inputs are counts/sizes only, never code or prompts.
//
// Product-mode caveat: without the research hooks we cannot *precisely*
// attribute AI-authored code, so AI reliance is ESTIMATED from edit_insert
// (large atomic insertions characteristic of completions/agent writes/pastes)
// versus edit_burst (incremental human typing). Precise attribution is a
// research-mode (enrolled) perk.

// Raw aggregates over a window (e.g. the trailing 7 days). All optional-safe.
export interface MirrorInput {
  aiInsertChars: number; // sum of edit_insert added_chars (estimated AI)
  humanTypedChars: number; // sum of edit_burst added_chars
  humanRemovedChars: number; // sum of edit_burst removed_chars
  focusSwitches: number; // editor/tab switches
  activeMinutes: number; // active-coding minutes in window
  commits: number;
  topLanguage: string | null;
  daysObserved: number; // distinct days with any activity
}

export type ArchetypeKey = "conductor" | "sprinter" | "artisan" | "explorer" | "warming_up";

export interface MirrorResult {
  key: ArchetypeKey;
  name: string;
  tagline: string;
  blurb: string;
  // 0..1 continuous dimensions (for subtitles / future visualizations).
  aiReliance: number;
  focusContinuity: number;
  // Human-readable "signature stats" for the shareable card.
  signature: Array<{ label: string; value: string }>;
  // True once there is enough signal to show a real archetype.
  ready: boolean;
}

// Thresholds are intentionally simple and tunable. They define the 2x2 split.
const HIGH_AI_RELIANCE = 0.5; // >=50% of authored chars estimated AI-assisted
const FRAGMENTED_SWITCHES_PER_HOUR = 12; // >= this = fragmented, else deep focus
// Minimum signal before we commit to an identity (avoids labeling from noise).
const MIN_ACTIVE_MINUTES = 60;
const MIN_AUTHORED_CHARS = 2000;

const ARCHETYPES: Record<
  Exclude<ArchetypeKey, "warming_up">,
  { name: string; tagline: string; blurb: string }
> = {
  conductor: {
    name: "The Conductor",
    tagline: "You direct the AI and stay in the flow.",
    blurb:
      "Most of your code is AI-assisted, and you work in long, uninterrupted stretches — orchestrating the model rather than typing every line.",
  },
  sprinter: {
    name: "The Sprinter",
    tagline: "Fast, AI-heavy, always moving.",
    blurb:
      "You lean hard on AI and move quickly across files and contexts — high velocity with lots of switching between threads of work.",
  },
  artisan: {
    name: "The Artisan",
    tagline: "You hand-craft in deep focus.",
    blurb:
      "You write most code yourself and stay heads-down for long stretches — AI is a side tool, not the main author.",
  },
  explorer: {
    name: "The Explorer",
    tagline: "Hands-on and wide-ranging.",
    blurb:
      "You mostly write code yourself while ranging across many files and contexts — exploratory, manual, and curious.",
  },
};

function fmtPct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
function fmtChars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

export function computeMirror(input: MirrorInput): MirrorResult {
  const authored = input.aiInsertChars + input.humanTypedChars;
  const aiReliance = authored > 0 ? input.aiInsertChars / authored : 0;
  const switchesPerHour =
    input.activeMinutes > 0 ? input.focusSwitches / (input.activeMinutes / 60) : 0;
  // Focus continuity: 1 at zero switches, decaying toward 0 as switching rises.
  const focusContinuity = Math.max(
    0,
    Math.min(1, 1 - switchesPerHour / (FRAGMENTED_SWITCHES_PER_HOUR * 2)),
  );

  const signature: Array<{ label: string; value: string }> = [
    { label: "AI-assisted (est.)", value: fmtPct(aiReliance) },
    { label: "Active coding", value: `${Math.round(input.activeMinutes)} min` },
    { label: "Code written", value: `${fmtChars(authored)} chars` },
  ];
  if (input.topLanguage) signature.push({ label: "Top language", value: input.topLanguage });
  if (input.commits > 0) signature.push({ label: "Commits", value: String(input.commits) });

  const ready = input.activeMinutes >= MIN_ACTIVE_MINUTES && authored >= MIN_AUTHORED_CHARS;
  if (!ready) {
    return {
      key: "warming_up",
      name: "Warming up",
      tagline: "Keep coding — your AI collaboration style is taking shape.",
      blurb:
        `Need ~${MIN_ACTIVE_MINUTES} min of active coding and ~${fmtChars(MIN_AUTHORED_CHARS)} chars written (last 7 days). ` +
        `So far: ${Math.round(input.activeMinutes)} min, ${fmtChars(authored)} chars. ` +
        `All computed on your machine — nothing is uploaded.`,
      aiReliance,
      focusContinuity,
      signature,
      ready: false,
    };
  }

  const highAi = aiReliance >= HIGH_AI_RELIANCE;
  const fragmented = switchesPerHour >= FRAGMENTED_SWITCHES_PER_HOUR;
  const key: Exclude<ArchetypeKey, "warming_up"> = highAi
    ? fragmented
      ? "sprinter"
      : "conductor"
    : fragmented
      ? "explorer"
      : "artisan";

  return { key, ...ARCHETYPES[key], aiReliance, focusContinuity, signature, ready: true };
}

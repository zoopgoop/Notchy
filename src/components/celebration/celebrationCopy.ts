import { CelebrationType } from "../../types";
import { theme } from "../../theme";

export type CelebrationTier = "toast" | "full";

export const CELEBRATION_COPY: Record<
  CelebrationType,
  { emoji: string; title: string; tier: CelebrationTier; color: string; sectionLabel: string }
> = {
  daily_hit: { emoji: "🎯", title: "Target hit", tier: "toast", color: theme.primary, sectionLabel: "Target Hits" },
  personal_best: {
    emoji: "🏆",
    title: "Personal best",
    tier: "toast",
    color: theme.primary,
    sectionLabel: "Personal Bests",
  },
  comeback: { emoji: "💪", title: "Back at it", tier: "toast", color: "#26C6DA", sectionLabel: "Comebacks" },
  streak_milestone: {
    emoji: "🔥",
    title: "Streak milestone",
    tier: "full",
    color: "#E0A23C",
    sectionLabel: "Streak Milestones",
  },
  goal_achieved: {
    emoji: "🎉",
    title: "Goal achieved",
    tier: "full",
    color: "#FFD54F",
    sectionLabel: "Goals Achieved",
  },
};

/**
 * Display order for the Trophy Case, most prestigious first. `daily_hit` is
 * deliberately excluded — it fires on every routine hit, so including it would bury
 * the genuinely notable achievements under hundreds of entries.
 */
export const TROPHY_CASE_SECTION_ORDER: CelebrationType[] = [
  "goal_achieved",
  "streak_milestone",
  "personal_best",
  "comeback",
];

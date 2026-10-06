// The ways to learn. Learners pick which ones they want during onboarding
// (and can change it any time); Home and Practice only show the ones chosen.
// Each says what it is and why it works, so the choice is an informed one.

export const GAMES = [
  {
    id: "lessons",
    title: "Guided lessons",
    icon: "book",
    tagline: "Short interactive steps: see an idea, then use it.",
    science: "Worked examples followed by practice with instant feedback.",
    required: true
  },
  {
    id: "review",
    title: "Daily review",
    icon: "retry",
    tagline: "Spaced recall of everything you've learned.",
    science: "Spaced retrieval is the most reliable way to make memories last."
  },
  {
    id: "lab",
    title: "Design Lab",
    icon: "layers",
    tagline: "Design real systems end to end, graded as you go.",
    science: "Transfer: apply every skill together on a realistic problem."
  },
  {
    id: "lightning",
    title: "Lightning round",
    icon: "zap",
    tagline: "60 seconds of rapid-fire questions. Build a combo.",
    science: "Fluency practice, only on cards you already get right."
  },
  {
    id: "arcade",
    title: "Sort & Match",
    icon: "shuffle",
    tagline: "Drag, sort, match, and sequence puzzles.",
    science: "Interleaving topics teaches you to tell similar ideas apart."
  },
  {
    id: "estimation",
    title: "Estimation dojo",
    icon: "target",
    tagline: "Back-of-the-envelope numbers, scored by how close you get.",
    science: "Deliberate practice on the skill interviews probe hardest."
  },
  {
    id: "boss",
    title: "Boss battles",
    icon: "trophy",
    tagline: "Beat each unit with three lives.",
    science: "Mixed, cumulative questions check what actually stuck."
  }
];

export const GOALS = [
  { id: "interview", title: "Ace system design interviews", detail: "Requirements to deep dives under a clock.", games: ["lessons", "review", "lab", "estimation", "boss"] },
  { id: "understand", title: "Understand how big systems work", detail: "Build intuition one idea at a time.", games: ["lessons", "review", "arcade", "lab"] },
  { id: "refresh", title: "Keep my skills sharp", detail: "Quick daily practice on what I know.", games: ["lessons", "review", "lightning", "arcade", "estimation"] }
];

export const DAILY_GOALS = [
  { xp: 30, label: "Casual", detail: "≈ 5 min a day" },
  { xp: 60, label: "Regular", detail: "≈ 10 min a day" },
  { xp: 100, label: "Serious", detail: "≈ 15 min a day" },
  { xp: 160, label: "Intense", detail: "≈ 25 min a day" }
];

export function gameById(id) {
  return GAMES.find((game) => game.id === id) ?? null;
}

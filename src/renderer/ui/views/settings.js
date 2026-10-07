// Settings: the learner owns their goal, their games, and how much
// scaffolding they get. Each option says what it does and why.

import { h } from "../../lib/dom.js";
import { button, card, pageHead, segmented } from "../components.js";
import { settings, persist, progress, resetProgress, progressFilePath, DEFAULT_SETTINGS } from "../../state/progress.js";
import { setThemePreference, themePreference } from "../theme.js";
import { setSoundEnabled, play as sound } from "../../lib/sound.js";
import { DAILY_GOALS } from "../../domain/games.js";
import { openContentFolder } from "../../io/io.js";
import { libraryFilePath } from "../../state/library.js";
import { navigate, refresh } from "../router.js";
import { toast } from "../toast.js";

export function renderSettings(root) {
  const page = h("div", { class: "page page-narrow" });
  root.append(page);
  const current = settings();

  const update = (key) => (value) => {
    current[key] = value;
    persist();
  };
  const row = (label, help, control) =>
    h("div", { class: "setting" }, h("div", { class: "setting-text" }, h("strong", { text: label }), h("p", { class: "muted small", text: help })), h("div", { class: "setting-control" }, control));

  const pathLine = h("p", { class: "muted small mono" });
  Promise.all([progressFilePath(), libraryFilePath()]).then(([progressPath, libraryPath]) => {
    pathLine.textContent = progressPath ? `Progress: ${progressPath} · Your subjects and courses: ${libraryPath}` : "Progress, subjects, and courses are saved in this browser's storage.";
  });

  page.append(
    pageHead({ eyebrow: "Preferences", title: "Settings" }),
    card(
      { title: "Your pace" },
      row("Daily goal", "XP per day. Your streak counts the days you reach it.", segmented(DAILY_GOALS.map((goal) => ({ value: goal.xp, label: `${goal.label} · ${goal.xp}` })), current.dailyXp, update("dailyXp"), { label: "Daily goal" })),
      row("Games", "Choose which ways of learning appear on Home.", button("Choose games", { size: "sm", onClick: () => navigate("practice") })),
      row("Redo setup", "Walk through the first-run questions again.", button("Restart setup", { size: "sm", variant: "ghost", onClick: () => { progress().profile.onboarded = false; persist(); navigate("welcome"); } }))
    ),
    card(
      { title: "Learning" },
      row(
        "Confidence in lessons",
        "Rate how sure you are before each answer in lessons too, not just in reviews. Builds calibration and flags confident mistakes.",
        segmented([{ value: false, label: "Reviews only" }, { value: true, label: "Everywhere" }], current.confidenceInLessons, update("confidenceInLessons"), { label: "Confidence ratings" })
      ),
      row(
        "Recall before options",
        "In reviews, hide multiple-choice options until you've tried to recall the answer. Producing an answer builds stronger memory than recognizing one.",
        segmented([{ value: "off", label: "Off" }, { value: "seen", label: "After first look" }, { value: "always", label: "Always" }], current.recallFirst, update("recallFirst"), { label: "Recall before options" })
      ),
      row(
        "Explain-why prompts",
        "After some correct answers, explain why before seeing the explanation.",
        segmented([{ value: "off", label: "Off" }, { value: "sometimes", label: "Sometimes" }, { value: "always", label: "Always" }], current.selfExplain, update("selfExplain"), { label: "Explain-why prompts" })
      ),
      row("Target retention", "Reviews are scheduled for when your recall chance drops to this. Higher means more reviews, each easier.", segmented([{ value: 0.85, label: "85%" }, { value: 0.9, label: "90%" }, { value: 0.95, label: "95%" }], current.retention, update("retention"), { label: "Target retention" })),
      row("Review session length", "Cards per daily review.", segmented([6, 12, 20, 30].map((value) => ({ value, label: String(value) })), current.sessionSize, update("sessionSize"), { label: "Review length" })),
      row("Written answers in review", "Include explain-in-your-own-words cards in reviews. Slower, but the strongest retrieval.", segmented([{ value: true, label: "Include" }, { value: false, label: "Skip" }], current.includeLongForm, update("includeLongForm"), { label: "Written answers" }))
    ),
    card(
      { title: "Look and sound" },
      row("Theme", "Follows your system unless you pick one.", segmented([{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }], themePreference(), (value) => setThemePreference(value), { label: "Theme" })),
      row(
        "Sound effects",
        "Short cues for right and wrong answers.",
        segmented([{ value: true, label: "On" }, { value: false, label: "Off" }], current.sound, (value) => {
          update("sound")(value);
          setSoundEnabled(value);
          if (value) {
            sound("correct");
          }
        }, { label: "Sound effects" })
      )
    ),
    card(
      { title: "Subjects and data" },
      row("Your subjects", "Create subjects, write courses, and move courses between subjects.", button("Manage subjects", { size: "sm", onClick: () => navigate("subjects") })),
      row("Subjects folder", "Built-in subjects live here. A folder with a subject.json and course folders inside loads on every launch.", button("Open folder", { size: "sm", onClick: openContentFolder })),
      pathLine,
      h(
        "div",
        { class: "danger-row" },
        button("Restore default settings", {
          onClick: () => {
            Object.assign(current, { ...DEFAULT_SETTINGS, theme: current.theme });
            persist();
            toast("Settings restored.");
            refresh();
          }
        }),
        button("Reset learning progress…", {
          variant: "danger",
          onClick: () => {
            if (window.confirm("Erase all lesson progress, reviews, mistakes, streaks, and XP? Your subjects, courses, and settings stay. This can't be undone.")) {
              resetProgress();
              toast("Progress reset.");
              refresh();
            }
          }
        })
      )
    )
  );
}

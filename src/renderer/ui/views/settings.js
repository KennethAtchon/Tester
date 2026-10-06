// Settings: the learner owns their goal, pace, and how much scaffolding they
// get. Each option says what it does and why, so choices are informed.

import { h } from "../../lib/dom.js";
import { button, card, pageHead, segmented } from "../components.js";
import { settings, persist, resetProgress, progressFilePath, DEFAULT_SETTINGS } from "../../state/progress.js";
import { setThemePreference, themePreference } from "../theme.js";
import { refresh } from "../router.js";
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

  const numberOptions = (values, suffix = "") => values.map((value) => ({ value, label: `${value}${suffix}` }));

  const pathLine = h("p", { class: "muted small mono" });
  progressFilePath().then((path) => {
    pathLine.textContent = path ? `Saved to ${path}` : "Saved in this browser's storage.";
  });

  page.append(
    pageHead({ eyebrow: "Preferences", title: "Settings" }),
    card(
      { title: "Your pace" },
      row("Daily goal", "Cards per day. Small and consistent beats big and occasional — your streak counts days you hit this.", segmented(numberOptions([5, 10, 15, 20, 30]), current.dailyGoal, update("dailyGoal"), { label: "Daily goal" })),
      row("Session length", "Cards per session. Shorter sessions with a clear end are easier to start.", segmented(numberOptions([6, 12, 20, 30]), current.sessionSize, update("sessionSize"), { label: "Session length" })),
      row("New items per day", "How much new material enters your reviews each day. Every new item becomes future reviews.", segmented(numberOptions([0, 5, 10, 15, 25]), current.newPerDay, update("newPerDay"), { label: "New items per day" })),
      row("Review cap", "Most reviews per day. After a break, the backlog spreads over several days instead of landing at once.", segmented(numberOptions([40, 80, 150, 300]), current.maxReviewsPerDay, update("maxReviewsPerDay"), { label: "Review cap" }))
    ),
    card(
      { title: "Learning" },
      row(
        "Target retention",
        "Reviews are scheduled for when your recall chance drops to this. Higher means more reviews, with each one easier.",
        segmented([{ value: 0.85, label: "85%" }, { value: 0.9, label: "90%" }, { value: 0.95, label: "95%" }], current.retention, update("retention"), { label: "Target retention" })
      ),
      row(
        "Recall before options",
        "Hide multiple-choice options until you've tried to recall the answer. Producing an answer builds stronger memory than recognizing one.",
        segmented([{ value: "off", label: "Off" }, { value: "seen", label: "After first look" }, { value: "always", label: "Always" }], current.recallFirst, update("recallFirst"), { label: "Recall before options" })
      ),
      row(
        "Explain-why prompts",
        "After a correct answer, ask you to explain why before showing the expert explanation. Only for items that have one.",
        segmented([{ value: "off", label: "Off" }, { value: "sometimes", label: "Sometimes" }, { value: "always", label: "Always" }], current.selfExplain, update("selfExplain"), { label: "Explain-why prompts" })
      ),
      row(
        "Long-form items in sessions",
        "Include essay and code questions in spaced practice. They take longer but are the strongest retrieval.",
        segmented([{ value: true, label: "Include" }, { value: false, label: "Skip" }], current.includeLongForm, update("includeLongForm"), { label: "Long-form items" })
      )
    ),
    card(
      { title: "Appearance" },
      row("Theme", "Follows your system unless you pick one.", segmented([{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }], themePreference(), (value) => setThemePreference(value), { label: "Theme" }))
    ),
    card(
      { title: "Your data" },
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
            if (window.confirm("Erase all reviews, mistakes, streaks, and points? Your libraries and settings stay. This can't be undone.")) {
              resetProgress({ keepLibraries: true });
              toast("Progress reset. Libraries kept.");
              refresh();
            }
          }
        })
      )
    )
  );
}

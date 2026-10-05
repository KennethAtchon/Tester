// Today: the home screen. Answers "where am I going, how am I doing, what
// next" — today's goal, what's due, a one-click start (or a single card when
// motivation is low), a guilt-free catch-up after a break, the learner's
// implementation intention, and why recent points were earned.

import { h } from "../../lib/dom.js";
import { icon } from "../icons.js";
import { button, card, ring, meter, pct, plural, chip, pageHead } from "../components.js";
import { catalog } from "../../state/catalog.js";
import { progress, persist } from "../../state/progress.js";
import { todayStats, skillStats, libraryStats, weekXp } from "../../state/learner.js";
import { buildSession, openMistakes } from "../../state/sessions.js";
import { recentAccuracy, forecast } from "../../domain/insights.js";
import { formatAgo } from "../../lib/time.js";
import { formatExampleName } from "../../lib/util.js";
import { startSession } from "./session.js";
import { refresh, href, navigate } from "../router.js";
import { importFromDisk, importSample, importExample, listExamples, enrolledFileNames } from "../../io/io.js";

export function renderToday(root) {
  const page = h("div", { class: "page" });
  root.append(page);

  if (catalog().libraries.length === 0) {
    page.append(onboarding());
    return;
  }

  const stats = todayStats();
  const now = new Date();

  page.append(
    pageHead({
      eyebrow: now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }),
      title: greeting(now.getHours())
    }),
    h(
      "div",
      { class: "today-grid" },
      h("div", { class: "today-main" }, heroCard(stats), skillsCard()),
      h("div", { class: "today-side" }, planCard(stats), focusCard(), rewardsCard())
    )
  );
}

function greeting(hour) {
  if (hour < 5) {
    return "Burning the midnight oil";
  }
  if (hour < 12) {
    return "Good morning";
  }
  if (hour < 18) {
    return "Good afternoon";
  }
  return "Good evening";
}

function heroCard(stats) {
  const preview = buildSession("daily");
  const reviews = preview.queue.filter((entry) => entry.mode === "review").length;
  const fresh = preview.queue.filter((entry) => entry.mode === "new").length;
  const minutes = Math.max(1, Math.round(reviews * 0.4 + fresh * 0.9));
  const tomorrow = forecast(Object.values(progress().items), 2)[1]?.count ?? 0;
  const lapsed = stats.lapsedDays != null && stats.lapsedDays >= 3 && stats.due > 0;

  let title;
  let body;
  const actions = [];

  if (lapsed) {
    title = "Welcome back";
    body = `No need to catch up on everything at once. Here's a three-minute catch-up — the other ${Math.max(0, stats.due - 5)} reviews will spread over the next few days.`;
    actions.push(
      button("Start catch-up", { variant: "primary", size: "lg", iconName: "play", onClick: () => startSession(buildSession("catchup")) }),
      button("Full session", { onClick: () => startSession(preview) })
    );
  } else if (stats.goalMet) {
    title = "Done for today";
    body = `You hit your goal of ${plural(stats.goal, "card")}. Tomorrow: ${plural(tomorrow, "review")}. Stopping here is the plan working — spacing beats cramming.`;
    actions.push(
      preview.queue.length > 0
        ? button("Keep going", { onClick: () => startSession(preview), iconName: "play" })
        : button("Practice ahead", { onClick: () => startSession(buildSession("extra")), iconName: "play" })
    );
  } else if (preview.queue.length > 0) {
    title = "Today's practice";
    body = [reviews > 0 && `${plural(reviews, "review")} due`, fresh > 0 && `${fresh} new`, `about ${plural(minutes, "minute")}`].filter(Boolean).join(" · ") + ".";
    actions.push(
      button("Start session", { variant: "primary", size: "lg", iconName: "play", onClick: () => startSession(preview) }),
      button("Just one card", { iconName: "zap", onClick: () => startSession(buildSession("one")), title: "Start tiny — one card, then decide" })
    );
  } else {
    title = "All caught up";
    body = "Nothing is due and today's new items are done. Practice your weakest items early, or add new material.";
    actions.push(
      button("Practice ahead", { variant: "primary", iconName: "play", onClick: () => startSession(buildSession("extra")) }),
      button("Skill map", { onClick: () => navigate("map") })
    );
  }

  const accuracy = recentAccuracy(progress().log, 25);
  const zone = accuracy == null
    ? null
    : accuracy > 0.85
      ? { text: `Recent accuracy ${pct(accuracy)} — adding more new material`, tone: "accent" }
      : accuracy >= 0.7
        ? { text: `Recent accuracy ${pct(accuracy)} — in the challenge zone`, tone: "good" }
        : { text: `Recent accuracy ${pct(accuracy)} — consolidating before adding more`, tone: "warn" };

  const skillsTouched = new Set(preview.queue.map((entry) => catalog().items.get(entry.itemKey)?.skillKey)).size;

  return card(
    { className: "hero-card" },
    h(
      "div",
      { class: "hero-layout" },
      ring(stats.goal ? stats.done / stats.goal : 0, {
        size: 132,
        stroke: 10,
        label: String(stats.done),
        sublabel: `of ${stats.goal} today`,
        tone: stats.goalMet ? "good" : "accent",
        ariaLabel: `${stats.done} of ${stats.goal} cards today`
      }),
      h(
        "div",
        { class: "hero-text" },
        h("h2", { class: "hero-title", text: title }),
        h("p", { class: "hero-body", text: body }),
        h("div", { class: "hero-actions" }, actions),
        h(
          "div",
          { class: "hero-notes" },
          preview.queue.length > 1 && skillsTouched > 1 && chip(`Interleaved across ${skillsTouched} skills`, { iconName: "layers" }),
          reviews > 0 && preview.queue[0]?.mode === "review" && chip("Opens with a quick win", { iconName: "zap" }),
          zone && chip(zone.text, { tone: zone.tone, iconName: "target" })
        )
      )
    )
  );
}

function skillsCard() {
  const skills = [];
  for (const library of catalog().libraries) {
    for (const skill of library.skills) {
      skills.push({ skill, stats: skillStats(skill.key) });
    }
  }
  const started = skills.filter((entry) => entry.stats.seen > 0);
  started.sort((a, b) => (b.stats.lastPracticed || 0) - (a.stats.lastPracticed || 0));
  const list = (started.length > 0 ? started : skills.filter((entry) => entry.stats.unlocked)).slice(0, 6);

  return card(
    {
      title: started.length > 0 ? "Skills in progress" : "Where to start",
      sub: started.length > 0 ? "Mastery = how much of the skill you could recall right now." : "Pick a skill, or take a placement check to skip what you already know.",
      actions: button("Skill map", { variant: "ghost", size: "sm", iconAfter: "arrowRight", onClick: () => navigate("map") })
    },
    h(
      "ul",
      { class: "skill-rows" },
      list.map(({ skill, stats }) =>
        h(
          "li",
          { class: "skill-row" },
          h(
            "a",
            { class: "skill-row-main", href: href("skill", skill.key) },
            h("span", { class: "skill-row-title", text: skill.title }),
            h("span", { class: "skill-row-sub", text: `${skill.libTitle} · ${stats.seen}/${stats.total} seen${stats.due ? ` · ${stats.due} due` : ""}` })
          ),
          h("div", { class: "skill-row-meter" }, meter(stats.mastery, { label: `${skill.title} mastery`, tone: stats.mastered ? "good" : "accent" }), h("span", { class: "num", text: pct(stats.mastery) })),
          button("", { variant: "ghost", size: "sm", iconName: "play", title: `Practice ${skill.title}`, onClick: () => startSession(buildSession("skill", { skillKey: skill.key })) })
        )
      )
    )
  );
}

let editingPlan = false;

// Implementation intention: "After ___, I will ___." (Gollwitzer)
function planCard(stats) {
  const plan = progress().plan;
  const hasPlan = Boolean(plan.after && plan.will) && !editingPlan;

  if (hasPlan) {
    return card(
      { title: "Your plan", className: "plan-card", actions: button("", { variant: "ghost", size: "sm", iconName: "pencil", title: "Edit plan", onClick: () => { editingPlan = true; refresh(); } }) },
      h("p", { class: "plan-sentence" }, "After ", h("strong", { text: plan.after }), ", I will ", h("strong", { text: plan.will }), ".")
    );
  }

  const after = h("input", { type: "text", class: "input", placeholder: "my morning coffee", value: plan.after || "", "aria-label": "After…" });
  const will = h("input", { type: "text", class: "input", placeholder: `review ${stats.goal} cards`, value: plan.will || `review ${stats.goal} cards`, "aria-label": "I will…" });
  const save = () => {
    if (!after.value.trim()) {
      after.focus();
      return;
    }
    plan.after = after.value.trim();
    plan.will = will.value.trim() || `review ${stats.goal} cards`;
    editingPlan = false;
    persist();
    refresh();
  };

  return card(
    { title: "Make a plan", sub: "Deciding when and where you'll practice makes you more likely to follow through.", className: "plan-card" },
    h(
      "form",
      {
        class: "plan-form",
        onSubmit: (event) => {
          event.preventDefault();
          save();
        }
      },
      h("label", { class: "plan-field" }, h("span", { text: "After" }), after),
      h("label", { class: "plan-field" }, h("span", { text: "I will" }), will),
      button("Save plan", { variant: "primary", size: "sm", type: "submit" })
    )
  );
}

// A small, specific quest tied to weak spots — never a generic chore.
function focusCard() {
  const mistakes = openMistakes();
  const suggestions = [];

  if (mistakes.length > 0) {
    const hyper = mistakes.filter((itemKey) => progress().mistakes[itemKey]?.hyper).length;
    suggestions.push({
      icon: "notebook",
      title: `Clear ${Math.min(3, mistakes.length)} from your mistake notebook`,
      body: hyper > 0 ? `${plural(hyper, "confident miss", "confident misses")} waiting — these stick best once corrected.` : `${plural(mistakes.length, "open mistake")}. Errors you fix on a later day stay fixed.`,
      action: () => startSession(buildSession("mistakes", { size: 3 }))
    });
  }

  let weakest = null;
  for (const library of catalog().libraries) {
    for (const skill of library.skills) {
      const stats = skillStats(skill.key);
      if (stats.seen >= 3 && stats.unlocked && (!weakest || stats.mastery < weakest.stats.mastery)) {
        weakest = { skill, stats };
      }
    }
  }
  if (weakest && weakest.stats.mastery < 0.8) {
    suggestions.push({
      icon: "target",
      title: `Strengthen “${weakest.skill.title}”`,
      body: `${pct(weakest.stats.mastery)} mastery. A focused drill on its weakest items.`,
      action: () => startSession(buildSession("weak", { skillKey: weakest.skill.key }))
    });
  }

  for (const library of catalog().libraries) {
    const stats = libraryStats(library.key);
    if (stats.seen === 0) {
      suggestions.push({
        icon: "compass",
        title: `Placement check: ${library.title}`,
        body: "A few questions so you can skip what you already know.",
        action: () => startSession(buildSession("placement", { libKey: library.key }))
      });
      break;
    }
    if (stats.capstoneReady && !(stats.capstoneBest >= 0.8)) {
      suggestions.push({
        icon: "trophy",
        title: `Capstone unlocked: ${library.title}`,
        body: "Mixed, timed, no hints — does it transfer?",
        action: () => startSession(buildSession("capstone", { libKey: library.key }))
      });
      break;
    }
  }

  if (suggestions.length === 0) {
    return null;
  }

  return card(
    { title: "Focus" },
    h(
      "ul",
      { class: "focus-list" },
      suggestions.slice(0, 3).map((suggestion) =>
        h(
          "li",
          null,
          h(
            "button",
            { type: "button", class: "focus-item", onClick: suggestion.action },
            h("span", { class: "focus-icon" }, icon(suggestion.icon)),
            h("span", { class: "focus-text" }, h("strong", { text: suggestion.title }), h("span", { text: suggestion.body })),
            icon("arrowRight", { size: 16, className: "focus-go" })
          )
        )
      )
    )
  );
}

// Every point cites its cause: points are feedback, not payment.
function rewardsCard() {
  const events = progress().rewards.slice(-6).reverse();
  if (events.length === 0) {
    return card(
      { title: "Points" },
      h("p", { class: "muted small", text: "You earn points for recalling from memory — more for longer gaps and harder items, less with hints. Never for time spent." })
    );
  }
  return card(
    { title: "Why you earned points", sub: `${weekXp()} this week` },
    h(
      "ul",
      { class: "reward-list" },
      events.map((event) =>
        h(
          "li",
          { class: "reward-row" },
          h("span", { class: ["reward-amount", event.kind !== "xp" && "is-info"], text: event.kind === "xp" ? `+${event.amount}` : event.kind === "freeze" ? "❄" : "✓" }),
          h("span", { class: "reward-reason", text: event.reason }),
          h("span", { class: "reward-when", text: formatAgo(event.ts) })
        )
      )
    )
  );
}

function onboarding() {
  const examplesList = h("div", { class: "example-grid" }, h("p", { class: "muted small", text: "Loading examples…" }));

  listExamples().then((files) => {
    const enrolled = enrolledFileNames();
    examplesList.replaceChildren(
      ...files.map((fileName) =>
        h(
          "button",
          {
            type: "button",
            class: "example-tile",
            disabled: enrolled.has(fileName),
            onClick: async () => {
              if (await importExample(fileName)) {
                refresh();
              }
            }
          },
          icon("book"),
          h("span", { class: "example-name", text: formatExampleName(fileName) }),
          h("span", { class: "example-add" }, icon("plus", { size: 16 }))
        )
      )
    );
    if (files.length === 0) {
      examplesList.replaceChildren(h("p", { class: "muted small", text: "No example files found." }));
    }
  });

  const step = (number, title, body) =>
    h("li", { class: "how-step" }, h("span", { class: "how-num", text: String(number) }), h("strong", { text: title }), h("span", { text: body }));

  return h(
    "div",
    { class: "onboarding" },
    h(
      "section",
      { class: "onboarding-hero" },
      h("p", { class: "eyebrow", text: "Welcome" }),
      h("h1", { class: "onboarding-title", text: "Remember what you study." }),
      h("p", { class: "onboarding-lede", text: "Recall turns your question banks into short, effortful practice that's spaced out over days, which is what makes learning stick. Rereading doesn't. Expect it to feel harder than flashcards. That's the point." }),
      h(
        "ol",
        { class: "how-steps" },
        step(1, "Retrieve", "Answer from memory before you see any options. Guessing counts."),
        step(2, "Check & explain", "Rate your confidence, then get feedback that says why — confident mistakes get flagged."),
        step(3, "Space it", "Each item returns just before you'd forget it. Misses come back a few cards later.")
      )
    ),
    card(
      { title: "Add something to learn", sub: "Load a test library JSON. Your progress is saved on this computer." },
      h(
        "div",
        { class: "onboarding-actions" },
        button("Open a JSON file…", {
          variant: "primary",
          iconName: "folder",
          onClick: async () => {
            if (await importFromDisk()) {
              refresh();
            }
          }
        }),
        button("Try the sample", {
          iconName: "sparkle",
          onClick: async () => {
            if (await importSample()) {
              refresh();
            }
          }
        })
      ),
      h("h3", { class: "subhead", text: "Examples" }),
      examplesList
    )
  );
}

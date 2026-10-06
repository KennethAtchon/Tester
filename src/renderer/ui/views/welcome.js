// First-run setup, four quick choices: your goal, your daily pace, which ways
// of learning you want, and where to start. Everything can be changed later
// in Settings or Practice. Framed as preferences, not "learning styles" —
// every game uses the same evidence-based engine underneath.

import { h } from "../../lib/dom.js";
import { icon } from "../icons.js";
import { button } from "../components.js";
import { progress, settings, persist } from "../../state/progress.js";
import { catalog } from "../../state/catalog.js";
import { GAMES, GOALS, DAILY_GOALS } from "../../domain/games.js";
import { lessonPlay, placementPlay } from "../../state/sessions.js";
import { nextLessonKey } from "../../state/learner.js";
import { startPlay } from "../player.js";
import { navigate } from "../router.js";
import { play as sound } from "../../lib/sound.js";

const state = { step: 0, goal: null, xp: 60, games: null, start: "beginning" };

export function renderWelcome(root) {
  const profile = progress().profile;
  if (state.games == null) {
    state.goal = profile.goal;
    state.xp = settings().dailyXp;
    state.games = new Set(profile.games?.length ? profile.games : GOALS[0].games);
  }
  const page = h("div", { class: "welcome" });
  root.append(page);

  const steps = [goalStep, paceStep, gamesStep, startStep];
  let shown = null;
  const paint = () => {
    // Animate only when the step changes, not on every selection.
    const entering = shown !== state.step;
    shown = state.step;
    page.replaceChildren(
      h("div", { class: "welcome-top" }, h("span", { class: "brand-mark" }, icon("brand", { size: 20 })), h("div", { class: "welcome-dots" }, steps.map((_, index) => h("span", { class: ["dot", index <= state.step && "is-on"] })))),
      h("div", { class: ["welcome-card", entering && "is-entering"] }, steps[state.step](paint))
    );
  };
  paint();
}

function nav(paint, { canNext = true, nextLabel = "Continue", onNext = null } = {}) {
  return h(
    "div",
    { class: "welcome-nav" },
    state.step > 0 ? button("Back", { variant: "ghost", onClick: () => { state.step -= 1; paint(); } }) : h("span"),
    button(nextLabel, {
      variant: "go",
      size: "lg",
      disabled: !canNext,
      onClick: () => {
        sound("tap");
        if (onNext) {
          onNext();
        } else {
          state.step += 1;
          paint();
        }
      }
    })
  );
}

function goalStep(paint) {
  const course = catalog().courses[0];
  return h(
    "div",
    null,
    h("p", { class: "eyebrow", text: "Welcome to Recall" }),
    h("h1", { class: "welcome-title", text: course ? `Let's set up ${course.title}.` : "Let's get you set up." }),
    h("p", { class: "welcome-lede", text: "You'll learn by doing: short interactive steps, real designs you build yourself, and reviews timed so it sticks. First — what are you here for?" }),
    h(
      "div",
      { class: "choice-cards" },
      GOALS.map((goal) =>
        h(
          "button",
          {
            type: "button",
            class: ["choice-card", state.goal === goal.id && "is-selected"],
            "aria-pressed": String(state.goal === goal.id),
            onClick: () => {
              state.goal = goal.id;
              state.games = new Set(goal.games);
              paint();
            }
          },
          h("strong", { text: goal.title }),
          h("span", { text: goal.detail })
        )
      )
    ),
    nav(paint, { canNext: Boolean(state.goal) })
  );
}

function paceStep(paint) {
  return h(
    "div",
    null,
    h("p", { class: "eyebrow", text: "Your pace" }),
    h("h1", { class: "welcome-title", text: "How much a day?" }),
    h("p", { class: "welcome-lede", text: "Small and steady beats big and occasional. Your streak counts the days you hit this — and a missed day can be covered by a streak freeze." }),
    h(
      "div",
      { class: "choice-cards is-row" },
      DAILY_GOALS.map((goal) =>
        h(
          "button",
          { type: "button", class: ["choice-card", "is-compact", state.xp === goal.xp && "is-selected"], "aria-pressed": String(state.xp === goal.xp), onClick: () => { state.xp = goal.xp; paint(); } },
          h("strong", { text: goal.label }),
          h("span", { text: `${goal.xp} XP · ${goal.detail}` })
        )
      )
    ),
    nav(paint)
  );
}

function gamesStep(paint) {
  return h(
    "div",
    null,
    h("p", { class: "eyebrow", text: "How you want to learn" }),
    h("h1", { class: "welcome-title", text: "Pick your games." }),
    h("p", { class: "welcome-lede", text: "Choose the ones that sound fun — they all run on the same learning engine, so there's no wrong pick. We've pre-selected a mix for your goal." }),
    h(
      "div",
      { class: "game-picks" },
      GAMES.map((game) => {
        const on = state.games.has(game.id);
        return h(
          "button",
          {
            type: "button",
            class: ["game-pick", on && "is-selected", game.required && "is-required"],
            "aria-pressed": String(on),
            disabled: game.required,
            onClick: () => {
              if (on) {
                state.games.delete(game.id);
              } else {
                state.games.add(game.id);
              }
              paint();
            }
          },
          h("span", { class: `game-icon game-${game.id}` }, icon(game.icon, { size: 20 })),
          h("span", { class: "game-pick-text" }, h("strong", { text: game.title }), h("span", { text: game.tagline }), h("em", { text: game.science })),
          h("span", { class: "game-pick-check" }, icon(on ? "check" : "plus", { size: 16 }))
        );
      })
    ),
    nav(paint)
  );
}

function startStep(paint) {
  const course = catalog().courses[0];
  const options = [
    { id: "beginning", title: "Start from the beginning", detail: "New to system design, or want the full path." },
    { id: "placement", title: "I know some of this — place me", detail: "A two-minute check unlocks the units you already know." }
  ];
  return h(
    "div",
    null,
    h("p", { class: "eyebrow", text: "Starting point" }),
    h("h1", { class: "welcome-title", text: "Where should we start?" }),
    h(
      "div",
      { class: "choice-cards" },
      options.map((option) =>
        h(
          "button",
          { type: "button", class: ["choice-card", state.start === option.id && "is-selected"], "aria-pressed": String(state.start === option.id), onClick: () => { state.start = option.id; paint(); } },
          h("strong", { text: option.title }),
          h("span", { text: option.detail })
        )
      )
    ),
    nav(paint, {
      nextLabel: state.start === "placement" ? "Start placement" : "Start learning",
      onNext: () => {
        const profile = progress().profile;
        profile.onboarded = true;
        profile.goal = state.goal;
        profile.games = [...state.games];
        profile.startedAt ??= Date.now();
        settings().dailyXp = state.xp;
        persist();
        if (!course) {
          navigate("library");
        } else if (state.start === "placement") {
          startPlay(placementPlay(course.id), { returnTo: `course/${course.id}` });
        } else {
          startPlay(lessonPlay(nextLessonKey(course.id)), { returnTo: "home" });
        }
      }
    })
  );
}

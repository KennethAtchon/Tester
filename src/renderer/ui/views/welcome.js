// First-run setup, five quick choices: the subject, your goal, your daily
// pace, which ways of learning you want, and where to start. Everything can
// be changed later in Subjects, Settings, or Practice. Framed as preferences,
// not "learning styles": every game uses the same evidence-based engine.

import { h } from "../../lib/dom.js";
import { icon } from "../icons.js";
import { button } from "../components.js";
import { progress, settings, persist } from "../../state/progress.js";
import { catalog, getSubject, coursesIn, currentSubjectId, setCurrentSubject } from "../../state/catalog.js";
import { GAMES, GOALS, DAILY_GOALS } from "../../domain/games.js";
import { lessonPlay, placementPlay } from "../../state/sessions.js";
import { subjectNextLesson } from "../../state/learner.js";
import { startPlay } from "../player.js";
import { navigate } from "../router.js";
import { play as sound } from "../../lib/sound.js";
import { subjectBadge, subjectDialog } from "./subjects.js";

const state = { step: 0, subject: null, goal: null, xp: 60, games: null, start: "beginning" };

export function renderWelcome(root) {
  const profile = progress().profile;
  if (state.games == null) {
    state.subject = profile.subject || currentSubjectId();
    state.goal = profile.goal;
    state.xp = settings().dailyXp;
    state.games = new Set(profile.games?.length ? profile.games : GOALS[0].games);
  }
  const page = h("div", { class: "welcome" });
  root.append(page);

  const steps = [subjectStep, goalStep, paceStep, gamesStep, startStep];
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

function subjectStep(paint) {
  return h(
    "div",
    null,
    h("p", { class: "eyebrow", text: "Welcome to Recall" }),
    h("h1", { class: "welcome-title", text: "What do you want to learn?" }),
    h("p", { class: "welcome-lede", text: "You'll learn by doing: short interactive steps, projects you build yourself, and reviews timed so it sticks. Pick a subject to start with. You can add more any time." }),
    h(
      "div",
      { class: "choice-cards subject-choices" },
      catalog().subjects.map((subject) =>
        h(
          "button",
          { type: "button", class: ["choice-card", "subject-choice", state.subject === subject.id && "is-selected"], "aria-pressed": String(state.subject === subject.id), onClick: () => { state.subject = subject.id; paint(); } },
          subjectBadge(subject, { size: 22 }),
          h("span", { class: "subject-choice-text" }, h("strong", { text: subject.title }), h("span", { text: subject.description || `${coursesIn(subject.id).length} courses` }))
        )
      ),
      h(
        "button",
        {
          type: "button",
          class: "choice-card subject-choice is-new",
          onClick: () =>
            subjectDialog(null, {
              onCreate: (id) => {
                state.subject = id;
                paint();
              }
            })
        },
        h("span", { class: "subject-badge is-plain" }, icon("plus", { size: 22 })),
        h("span", { class: "subject-choice-text" }, h("strong", { text: "Something else" }), h("span", { text: "Create your own subject — math, science, a language — and add courses to it." }))
      )
    ),
    nav(paint, { canNext: Boolean(state.subject && getSubject(state.subject)) })
  );
}

function goalStep(paint) {
  const subject = getSubject(state.subject);
  return h(
    "div",
    null,
    h("p", { class: "eyebrow", text: subject?.title || "Your goal" }),
    h("h1", { class: "welcome-title", text: "What are you here for?" }),
    h("p", { class: "welcome-lede", text: "This picks a starting mix of games for you. Change it any time." }),
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
  const subject = getSubject(state.subject);
  const course = coursesIn(subject.id).find((entry) => entry.lessonKeys.length > 0);
  const finish = () => {
    const profile = progress().profile;
    profile.onboarded = true;
    profile.goal = state.goal;
    profile.games = [...state.games];
    profile.startedAt ??= Date.now();
    settings().dailyXp = state.xp;
    setCurrentSubject(subject.id);
    persist();
  };

  if (!course) {
    return h(
      "div",
      null,
      h("p", { class: "eyebrow", text: subject.title }),
      h("h1", { class: "welcome-title", text: "Let's add your first course." }),
      h("p", { class: "welcome-lede", text: `${subject.title} is ready but empty. Next you'll write a course in plain text (it takes a minute and shows a live preview), or import one you already have.` }),
      nav(paint, { nextLabel: `Open ${subject.title}`, onNext: () => { finish(); navigate("subject", subject.id); } })
    );
  }

  const canPlace = placementPlay(course.id).steps.length >= 4;
  const options = [
    { id: "beginning", title: "Start from the beginning", detail: `New to ${subject.title.toLowerCase()}, or want the full path.` },
    canPlace && { id: "placement", title: "I know some of this — place me", detail: "A two-minute check unlocks the units you already know." }
  ].filter(Boolean);
  if (!canPlace) {
    state.start = "beginning";
  }
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
        finish();
        if (state.start === "placement") {
          startPlay(placementPlay(course.id), { returnTo: `course/${course.id}` });
        } else {
          startPlay(lessonPlay(subjectNextLesson(subject.id)?.lessonKey ?? course.lessonKeys[0]), { returnTo: "home" });
        }
      }
    })
  );
}

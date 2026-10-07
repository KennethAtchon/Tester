// The player: runs any "play" (lesson, review, Design Lab project, or game)
// one step at a time, Brilliant-style — the step on a card, a Check button at
// the bottom, and a feedback bar that says what happened and why.
//
// Options on a play change the rules:
//   requeue      missed steps come back (end of lesson / a few cards later)
//   confidence   rate confidence to submit; grade Again/Hard/Good/Easy after
//   hints        hint button (each hint costs XP and caps the grade)
//   hearts       lives (boss battles)
//   timerMs      countdown (Lightning, interview mode)
//   instant      auto-advance after each answer (Lightning)
//   combo        combo counter for consecutive correct answers
//   deferFeedback  record silently, reveal everything at the end (interviews)
//   game         XP is paid for the result at the end, not per answer

import { h, append, isTyping } from "../lib/dom.js";
import { rich, plain } from "../lib/markup.js";
import { icon } from "./icons.js";
import { button, chip, statTile, pct, plural } from "./components.js";
import { createExercise, TYPE_LABELS, stepPrompt, answerSummary } from "./exercises/index.js";
import { navigate } from "./router.js";
import { toast } from "./toast.js";
import { play as sound } from "../lib/sound.js";
import { confetti } from "../lib/confetti.js";
import { progress, settings } from "../state/progress.js";
import { getLesson, getUnit, getItem } from "../state/catalog.js";
import { recordAttempt, completeLesson, recordGame, recordProject, memoryOf, todayStats, placeOutOf, isLessonComplete } from "../state/learner.js";
import { questEvent } from "../state/quests.js";
import { previewIntervals, GRADES } from "../domain/fsrs.js";
import { CONFIDENCE_LEVELS } from "../domain/grading.js";
import { gradeLetter } from "../domain/rewards.js";
import { formatInterval } from "../lib/time.js";
import { saveMarkdownFile } from "../io/io.js";

let active = null;
let ui = null;
let exitTo = "home";

export function startPlay(play, { returnTo = null } = {}) {
  if (!play || play.steps.length === 0 || play.steps.length < (play.options.minSteps || 1)) {
    toast(emptyMessage(play), { tone: "info", timeout: 5000 });
    return;
  }
  exitTo = returnTo || location.hash.replace(/^#\/?/, "") || "home";
  active = {
    play,
    index: 0,
    card: null,
    results: [],
    events: [],
    hearts: play.options.hearts ?? null,
    combo: 0,
    maxCombo: 0,
    started: play.kind !== "project",
    done: false,
    lost: false,
    timerEnd: null,
    completion: null
  };
  if (active.started) {
    beginTimer();
  }
  navigate("play");
}

function emptyMessage(play) {
  const kind = play?.kind;
  if (kind === "review") {
    return "Nothing to review yet — finish a lesson and its cards join your reviews.";
  }
  if (kind === "lightning") {
    return "Lightning uses cards you've already answered. Finish a couple of lessons first.";
  }
  if (kind === "arcade") {
    return "Unlock a few lessons first — puzzles come from lessons you've reached.";
  }
  return "Nothing to play here yet.";
}

function beginTimer() {
  if (active.play.options.timerMs) {
    active.timerEnd = Date.now() + active.play.options.timerMs;
  }
}

export function renderPlayer(root) {
  if (!active) {
    queueMicrotask(() => navigate("home"));
    return null;
  }
  const top = h("header", { class: "player-top" });
  const stages = h("nav", { class: "player-stages", "aria-label": "Stages" });
  const main = h("main", { class: "player-main" });
  const bar = h("footer", { class: "player-bar" });
  const shell = h("div", { class: ["player", `kind-${active.play.kind}`], style: { "--course": active.play.color || "var(--brand)" } }, top, stages, main, bar);
  root.append(shell);
  ui = { shell, top, stages, main, bar };
  paint();

  const onKey = (event) => handleKey(event);
  document.addEventListener("keydown", onKey);
  const timer = setInterval(tick, 200);
  return () => {
    document.removeEventListener("keydown", onKey);
    clearInterval(timer);
    ui = null;
  };
}

// ── painting ────────────────────────────────────────────────────────────────

function paint() {
  if (!ui) {
    return;
  }
  paintTop();
  paintStages();
  if (active.done) {
    ui.main.replaceChildren(summaryView());
    ui.bar.replaceChildren();
    ui.bar.className = "player-bar is-hidden";
    return;
  }
  if (!active.started) {
    ui.main.replaceChildren(briefView());
    ui.bar.className = "player-bar";
    ui.bar.replaceChildren(h("div", { class: "bar-inner" }, h("span"), button("Start designing", { variant: "go", size: "lg", kbd: "Enter", onClick: startProject })));
    return;
  }
  if (!active.card) {
    active.card = newCard(active.play.steps[active.index]);
  }
  paintCard();
  paintBar();
}

function paintTop() {
  const { play } = active;
  const total = play.steps.length;
  const fraction = active.done ? 1 : Math.min(1, active.index / total);
  const xp = active.events.reduce((sum, event) => sum + (event.kind === "xp" ? event.amount : 0), 0);
  const parts = [
    h("button", { type: "button", class: "player-close", "aria-label": "Close", title: "Close (Esc)", onClick: () => (active.done ? exit() : confirmQuit()) }, icon("x", { size: 20 })),
    play.options.timerMs && play.kind === "lightning"
      ? h("div", { class: "player-progress is-timer" }, h("span", { class: "player-progress-fill", id: "timerFill", style: { "--v": "100%" } }))
      : h("div", { class: "player-progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(total), "aria-valuenow": String(active.index) }, h("span", { class: "player-progress-fill", style: { "--v": `${(fraction * 100).toFixed(1)}%` } })),
    h(
      "div",
      { class: "player-stats" },
      active.hearts != null && h("span", { class: "stat-hearts", "aria-label": `${active.hearts} lives left` }, Array.from({ length: play.options.hearts }, (_, index) => icon("heart", { size: 18, className: index < active.hearts ? "is-full" : "is-empty" }))),
      play.options.combo && h("span", { class: ["stat-combo", active.combo >= 3 && "is-hot"], title: "Combo" }, icon("zap", { size: 16 }), `×${comboMultiplier()}`, h("small", { text: ` ${active.combo}` })),
      play.options.timerMs && play.kind !== "lightning" && h("span", { class: "stat-timer", id: "timerText", text: clock(active.timerEnd ? active.timerEnd - Date.now() : play.options.timerMs) }),
      play.options.timerMs && play.kind === "lightning" && h("span", { class: "stat-timer", id: "timerText", text: clock(active.timerEnd ? active.timerEnd - Date.now() : play.options.timerMs) }),
      !play.options.game && h("span", { class: "stat-xp", title: "XP this session" }, icon("star", { size: 16 }), String(xp))
    )
  ];
  ui.top.replaceChildren(...parts.filter(Boolean));
}

function paintStages() {
  const stages = active.play.stages;
  if (!stages || !active.started) {
    ui.stages.replaceChildren();
    ui.stages.hidden = true;
    return;
  }
  ui.stages.hidden = false;
  const currentStage = active.done ? null : active.play.steps[active.index]?.stageId;
  const doneIds = new Set();
  let passed = false;
  for (const stage of stages) {
    if (stage.id === currentStage) {
      passed = true;
    } else if (!passed) {
      doneIds.add(stage.id);
    }
  }
  ui.stages.replaceChildren(
    ...stages.map((stage, index) =>
      h("span", { class: ["stage-chip", stage.id === currentStage && "is-current", (active.done || doneIds.has(stage.id)) && "is-done"] }, h("span", { class: "stage-num", text: String(index + 1) }), stage.title)
    )
  );
}

function newCard(entry) {
  const step = entry.step;
  const memory = entry.itemKey ? memoryOf(entry.itemKey) : null;
  const card = {
    entry,
    step,
    shownAt: Date.now(),
    phase: step.type === "concept" ? "concept" : "attempt",
    hints: [],
    hintsUsed: 0,
    result: null,
    confidence: null,
    revealed: false,
    selfGraded: null,
    graded: false,
    explainNode: null,
    selfExplain: null,
    isNew: !memory || memory.state === "new",
    memory
  };
  card.exercise = createExercise(step, {
    onChange: () => updateCheckButton(),
    submit: () => submit(),
    instant: Boolean(active.play.options.instant),
    recallFirst: entry.mode === "review" && step.type === "choice" && (settings().recallFirst === "always" || (settings().recallFirst === "seen" && !card.isNew)),
    regrade: (result) => {
      card.result = result;
      paintCard();
      paintBar();
    }
  });
  return card;
}

function paintCard() {
  const card = active.card;
  const { step, entry } = card;
  const kicker = [
    TYPE_LABELS[step.type],
    entry.stageTitle,
    entry.requeues > 0 && "Try again",
    entry.mode === "review" && (card.isNew ? "New" : "Review"),
    active.play.kind !== "lesson" && entry.lessonKey && getLesson(entry.lessonKey)?.kind === "lesson" && getLesson(entry.lessonKey).title
  ].filter(Boolean);

  const body = h(
    "article",
    { class: ["step-card", `type-${step.type}`, card.exercise.wide && "is-wide", card.result && `verdict-${card.result.verdict}`, !card.painted && "is-entering"] },
    h("div", { class: "step-kicker" }, kicker.join(" · ")),
    step.type === "concept"
      ? h("h1", { class: "step-title", text: plain(step.title || "") })
      : h("h1", { class: "step-prompt rich" }, rich(step.prompt || (step.type === "fill" ? "Complete the sentence." : ""))),
    step.context && h("div", { class: "step-context rich" }, rich(step.context)),
    card.exercise.el,
    card.hints.length > 0 && h("div", { class: "hint-box" }, card.hints.map((hint) => h("p", null, icon("bulb", { size: 16 }), h("span", null, rich(hint, { inline: true }))))),
    card.phase === "feedback" && feedbackDetails(card)
  );
  card.painted = true;
  ui.main.replaceChildren(body);
  card.exercise.mounted?.();
  if (card.phase === "attempt" && !card.focused) {
    card.focused = true;
    requestAnimationFrame(() => card.exercise.focus?.());
  }
}

// Detail under the step after checking: the exercise's own explanation, a
// self-explanation prompt (sometimes), and in review the confidence note.
function feedbackDetails(card) {
  const parts = [];
  if (card.result?.verdict === "wrong" && card.confidence >= 3 && !card.revealed) {
    parts.push(
      h(
        "div",
        { class: "callout callout-hyper" },
        icon("alert", { size: 18 }),
        h("div", null, h("strong", { text: `You were ${CONFIDENCE_LEVELS[card.confidence - 1].label.toLowerCase()} — and it was wrong. ` }), "Confident mistakes, once corrected, stick better than any other kind. It's in your notebook.")
      )
    );
  }
  if (card.selfExplain && !card.selfExplain.done) {
    parts.push(selfExplainBox(card));
  } else if (card.selfExplain?.text) {
    parts.push(h("div", { class: "compare-pair" }, h("div", null, h("div", { class: "explain-label", text: "Your explanation" }), h("p", { text: card.selfExplain.text })), h("div", null, h("div", { class: "explain-label", text: "Why" }), h("div", { class: "rich" }, rich(card.step.why || "")))));
  }
  card.explainNode ||= card.exercise.explain?.(card.result) || null;
  if (card.explainNode) {
    parts.push(card.explainNode);
  }
  return parts.length ? h("div", { class: "step-explain" }, parts) : null;
}

function selfExplainBox(card) {
  const area = h("textarea", { class: "input", rows: 2, placeholder: "In a sentence: why is that the answer?", value: card.selfExplain.text, "aria-label": "Explain why", onInput: (event) => (card.selfExplain.text = event.target.value) });
  requestAnimationFrame(() => area.focus());
  const finish = () => {
    card.selfExplain.done = true;
    paintCard();
    paintBar();
  };
  return h(
    "div",
    { class: "explain-box" },
    h("p", null, icon("pencil", { size: 16 }), h("strong", { text: "Before the explanation — " }), "why is that right? Explaining it to yourself turns a lucky pick into understanding."),
    area,
    h("div", { class: "row-gap" }, button("Compare", { variant: "primary", size: "sm", onClick: finish }), button("Skip", { variant: "ghost", size: "sm", onClick: () => { card.selfExplain.text = ""; finish(); } }))
  );
}

// ── the bottom bar ──────────────────────────────────────────────────────────

function paintBar() {
  const card = active.card;
  const options = active.play.options;
  ui.bar.className = "player-bar";

  if (card.phase === "concept") {
    ui.bar.replaceChildren(h("div", { class: "bar-inner" }, h("span"), button("Continue", { variant: "go", size: "lg", kbd: "Enter", onClick: advance, attrs: { id: "primaryAction" } })));
    return;
  }

  if (card.phase === "attempt") {
    const left = [];
    if (options.hints !== false && card.hintsUsed < 2 && (card.step.hint || card.exercise.autoHint)) {
      left.push(button(card.hintsUsed ? "Another hint" : "Hint", { variant: "ghost", iconName: "bulb", kbd: "H", title: "Costs XP and caps the grade", onClick: useHint }));
    }
    if (active.play.kind === "lesson" && card.isNew && card.entry.requeues === 0) {
      left.push(button("Not sure — show me", { variant: "ghost", onClick: () => submit({ reveal: true }) }));
    }
    const right = options.confidence
      ? h(
          "div",
          { class: "confidence", id: "confidenceRow" },
          h("span", { class: "confidence-label", text: "How sure are you?" }),
          h("div", { class: "confidence-buttons" }, CONFIDENCE_LEVELS.map((level) => button(level.label, { className: "conf", kbd: String(level.value), disabled: !card.exercise.ready(), onClick: () => submit({ confidence: level.value }) })))
        )
      : button("Check", { variant: "go", size: "lg", kbd: "Enter", disabled: !card.exercise.ready(), onClick: () => submit(), attrs: { id: "primaryAction" } });
    ui.bar.replaceChildren(h("div", { class: "bar-inner" }, h("div", { class: "bar-left" }, left), right));
    return;
  }

  // feedback
  const result = card.result;
  if (result.verdict === "self" && card.selfGraded == null) {
    ui.bar.className = "player-bar tone-neutral";
    ui.bar.replaceChildren(
      h(
        "div",
        { class: "bar-inner feedback-inner" },
        h("div", { class: "feedback-copy" }, h("strong", { class: "feedback-title", text: "How did you do?" }), h("p", { class: "feedback-why", text: "This one has no answer key. Compare with the model answer and be honest — your schedule depends on it." })),
        h(
          "div",
          { class: "bar-actions" },
          button("Missed it", { onClick: () => selfGrade("wrong"), kbd: "1" }),
          button("Partly", { onClick: () => selfGrade("partial"), kbd: "2" }),
          button("Got it", { variant: "go", onClick: () => selfGrade("correct"), kbd: "3" })
        )
      )
    );
    return;
  }

  const tone = { correct: "good", partial: "warn", wrong: "bad", self: "neutral" }[result.verdict] || "neutral";
  const title = result.revealed ? "Here's how it works" : { correct: pick(["Correct!", "Nice!", "Exactly.", "Spot on."]), partial: "Partly right", wrong: "Not quite" }[result.verdict] || "Recorded";
  const why = card.selfExplain && !card.selfExplain.done ? null : card.step.why;
  const actions = [];

  if (active.play.options.confidence && card.entry.itemKey) {
    actions.push(gradeButtons(card));
  } else {
    actions.push(button("Continue", { variant: tone === "bad" ? "danger" : "go", size: "lg", kbd: "Enter", onClick: () => finishCard(), disabled: Boolean(card.selfExplain && !card.selfExplain.done), attrs: { id: "primaryAction" } }));
  }

  ui.bar.className = `player-bar tone-${tone}`;
  ui.bar.replaceChildren(
    h(
      "div",
      { class: "bar-inner feedback-inner" },
      h("span", { class: "feedback-icon" }, icon(tone === "good" ? "check" : tone === "warn" ? "target" : tone === "bad" ? "x" : "eye", { size: 22 })),
      h(
        "div",
        { class: "feedback-copy" },
        h("strong", { class: "feedback-title" }, title, result.score != null && result.verdict !== "correct" && result.score > 0 && h("span", { class: "feedback-score", text: ` · ${Math.round(result.score * 100)}%` })),
        why && h("div", { class: "feedback-why rich" }, rich(why))
      ),
      h("div", { class: "bar-actions" }, actions)
    )
  );
}

function gradeButtons(card) {
  const result = card.result;
  const auto = result.verdict === "wrong" && result.correct === false && card.selfGraded == null;
  if (auto) {
    return button("Continue", { variant: "danger", size: "lg", kbd: "Enter", onClick: () => finishCard(1), attrs: { id: "primaryAction" } });
  }
  const suggested = suggestGrade(card);
  const previews = previewIntervals(card.memory || memoryOf(card.entry.itemKey), Date.now(), settings().retention);
  return h(
    "div",
    { class: "grade-buttons" },
    GRADES.map((grade) =>
      h(
        "button",
        {
          type: "button",
          class: ["grade", `grade-${grade.key}`, suggested === grade.value && "is-suggested"],
          disabled: card.hintsUsed > 0 && grade.value > 2,
          title: grade.hint,
          dataset: { grade: String(grade.value) },
          onClick: () => finishCard(grade.value)
        },
        h("span", { class: "grade-top" }, h("kbd", { text: String(grade.value) }), h("strong", { text: grade.label })),
        h("span", { class: "grade-interval", text: grade.value === 1 ? "soon" : formatInterval(previews[grade.value]) })
      )
    )
  );
}

function suggestGrade(card) {
  const verdict = card.result.verdict === "self" ? card.selfGraded : card.result.verdict;
  if (verdict === "wrong") {
    return 1;
  }
  if (verdict === "partial" || card.hintsUsed > 0 || card.confidence === 1) {
    return 2;
  }
  const latency = card.latencyMs || 0;
  return card.confidence === 4 && latency > 0 && latency < 8000 ? 4 : 3;
}

function updateCheckButton() {
  const card = active?.card;
  if (!card || card.phase !== "attempt" || !ui) {
    return;
  }
  const ready = card.exercise.ready();
  for (const element of ui.bar.querySelectorAll("#primaryAction, #confidenceRow button")) {
    element.disabled = !ready;
  }
}

// ── actions ─────────────────────────────────────────────────────────────────

function startProject() {
  active.started = true;
  beginTimer();
  paint();
}

function useHint() {
  const card = active.card;
  if (card.phase !== "attempt" || card.hintsUsed >= 2) {
    return;
  }
  let text = null;
  if (card.hintsUsed === 0 && card.step.hint) {
    text = card.step.hint;
  } else {
    text = card.exercise.autoHint?.() || (card.step.hint && card.hintsUsed === 0 ? card.step.hint : null);
  }
  if (!text) {
    toast("No more hints for this one.");
    return;
  }
  card.hintsUsed += 1;
  card.hints.push(text);
  paintCard();
  paintBar();
}

async function submit({ confidence = null, reveal = false } = {}) {
  const card = active?.card;
  if (!card || card.phase !== "attempt" || card.busy) {
    return;
  }
  if (!reveal && !card.exercise.ready()) {
    return;
  }
  card.busy = true;
  card.latencyMs = Date.now() - card.shownAt;
  card.confidence = confidence;
  let result = await card.exercise.check();
  if (reveal) {
    result = { ...result, correct: false, score: 0, verdict: "wrong", revealed: true };
    card.revealed = true;
  }
  card.result = result;
  card.busy = false;
  card.exercise.show(result);

  const options = active.play.options;

  if (options.deferFeedback) {
    finishCard();
    return;
  }

  if (options.instant) {
    sound(result.correct ? "correct" : "wrong");
    flash(result.correct);
    finishCard();
    return;
  }

  sound(result.verdict === "correct" ? "correct" : result.verdict === "partial" ? "partial" : result.verdict === "self" ? "tap" : "wrong");
  const explainMode = settings().selfExplain;
  if (
    result.verdict === "correct" && card.step.why && card.step.type === "choice" && !options.game && explainMode !== "off" &&
    (explainMode === "always" || card.confidence === 1 || card.confidence === 2 || Math.random() < 0.25)
  ) {
    card.selfExplain = { text: "", done: false };
  }
  card.phase = "feedback";
  paintCard();
  paintBar();
  if (!card.selfExplain) {
    ui.bar.querySelector("#primaryAction, .grade.is-suggested")?.focus({ preventScroll: true });
  }
  ui.main.querySelector(".step-explain")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function selfGrade(verdict) {
  const card = active.card;
  card.selfGraded = verdict;
  card.result = { ...card.result, verdict, correct: verdict === "correct", score: verdict === "correct" ? 1 : verdict === "partial" ? 0.5 : 0 };
  if (active.play.options.confidence) {
    paintBar();
  } else {
    finishCard();
  }
}

// Records the attempt, applies game rules, re-queues misses, moves on.
function finishCard(gradeOverride = null) {
  const card = active.card;
  if (!card || card.graded) {
    return;
  }
  card.graded = true;
  const { entry, result } = card;
  const options = active.play.options;

  if (entry.itemKey && result) {
    const correct = Boolean(result.correct);
    const grade = gradeOverride ?? (correct ? (card.hintsUsed > 0 || result.verdict === "partial" ? 2 : 3) : result.verdict === "partial" ? 2 : 1);
    const outcome = recordAttempt({
      itemKey: entry.itemKey,
      grade,
      correct,
      score: result.score,
      confidence: card.confidence,
      hints: card.hintsUsed,
      latencyMs: card.latencyMs,
      response: result.response,
      chosen: result.chosen,
      mode: entry.requeues > 0 ? "relearn" : entry.mode,
      explain: card.selfExplain?.text || null,
      revealed: card.revealed,
      retry: entry.requeues > 0,
      awardXp: !options.game && !options.deferFeedback,
      sessionId: active.play.id
    });
    if (outcome) {
      active.events.push(...outcome.events);
      announce(outcome.events);
    }

    active.results[active.index] = {
      itemKey: entry.itemKey,
      step: card.step,
      stageId: entry.stageId,
      correct,
      score: result.score ?? (correct ? 1 : 0),
      verdict: result.verdict,
      first: entry.requeues === 0,
      hints: card.hintsUsed,
      confidence: card.confidence,
      response: result.response,
      result,
      unitKey: entry.unitKey
    };

    if (options.combo) {
      active.combo = correct ? active.combo + 1 : 0;
      active.maxCombo = Math.max(active.maxCombo, active.combo);
    }
    if (options.hearts != null && !correct) {
      active.hearts -= 1;
      if (active.hearts <= 0) {
        active.lost = true;
      }
    }
    if (active.play.kind === "boss" && correct) {
      active.events.push(...questEvent("boss-hit", 1));
    }
    if (active.play.kind === "arcade" && correct) {
      active.events.push(...questEvent("arcade-clear", 1));
    }

    const missed = grade === 1 || !correct;
    if (missed && options.requeue && entry.requeues < (active.play.kind === "lesson" ? 1 : 2)) {
      const queue = active.play.steps;
      const copy = { ...entry, requeues: entry.requeues + 1 };
      if (active.play.kind === "lesson") {
        queue.push(copy);
      } else {
        queue.splice(Math.min(queue.length, active.index + 4 + Math.floor(Math.random() * 2)), 0, copy);
      }
    }
  }

  // Design Lab: a finished stage counts toward quests.
  const nextEntry = active.play.steps[active.index + 1];
  if (entry.stageId && (!nextEntry || nextEntry.stageId !== entry.stageId)) {
    active.events.push(...questEvent("lab-stage", 1));
  }

  advance();
}

function advance() {
  active.index += 1;
  active.card = null;
  const outOfTime = active.timerEnd && Date.now() >= active.timerEnd;
  if (active.lost || outOfTime || active.index >= active.play.steps.length) {
    finish();
    return;
  }
  paint();
  ui?.main.scrollTo?.(0, 0);
  document.querySelector("#main")?.scrollTo(0, 0);
}

function flash(correct) {
  ui?.shell.classList.remove("flash-good", "flash-bad");
  void ui?.shell.offsetWidth;
  ui?.shell.classList.add(correct ? "flash-good" : "flash-bad");
}

function announce(events) {
  for (const event of events) {
    if (event.kind === "level") {
      sound("levelup");
      confetti({ count: 90 });
      toast(`Level ${event.amount}!`, { tone: "success" });
    } else if (event.kind === "badge") {
      toast(`Badge earned: ${event.badge.title}`, { tone: "success", timeout: 5000 });
    } else if (event.kind === "streak") {
      toast(`Daily goal met — ${event.amount}-day streak`, { tone: "success" });
    } else if (event.kind === "xp" && event.reason.startsWith("Quest complete")) {
      toast(event.reason, { tone: "success" });
    }
  }
}

function confirmQuit() {
  const answered = active.results.filter(Boolean).length;
  if (answered === 0 || window.confirm("Leave now? Answers so far are saved, but you won't finish this one.")) {
    if (answered > 0 && ["lightning", "arcade", "estimation", "boss"].includes(active.play.kind)) {
      finish();
    } else {
      exit();
    }
  }
}

function exit() {
  active = null;
  navigate(...exitTo.split("/").map(decodeURIComponent));
}

function tick() {
  if (!active || !active.timerEnd || active.done || !active.started) {
    return;
  }
  const left = active.timerEnd - Date.now();
  const text = document.querySelector("#timerText");
  if (text) {
    text.textContent = clock(left);
    text.classList.toggle("is-low", left < 10000);
  }
  const fill = document.querySelector("#timerFill");
  if (fill) {
    fill.style.setProperty("--v", `${Math.max(0, (left / active.play.options.timerMs) * 100).toFixed(1)}%`);
  }
  if (left <= 0) {
    if (active.play.kind !== "lightning") {
      toast("Time's up.");
    }
    finish();
  }
}

// ── finishing ───────────────────────────────────────────────────────────────

function finish() {
  if (active.done) {
    return;
  }
  active.done = true;
  active.card = null;
  const announced = active.events.length;
  const { play } = active;
  const results = active.results.filter(Boolean);
  const firsts = results.filter((result) => result.first);
  const right = firsts.filter((result) => result.correct).length;
  let completion = { kind: play.kind, firsts: firsts.length, right };

  if (play.kind === "lesson") {
    const outcome = completeLesson(play.key, { right, total: firsts.length });
    completion = { ...completion, ...outcome };
    active.events.push(...outcome.events);
    sound("complete");
    if (outcome.firstTime || outcome.stars === 3) {
      confetti();
    }
  } else if (play.kind === "project") {
    const stages = stageScores(results);
    const score = results.length ? results.reduce((sum, result) => sum + (result.score || 0), 0) / results.length : 0;
    const outcome = recordProject(play.key, { score, stages, interview: play.options.interview });
    completion = { ...completion, score, stages, previousBest: outcome.previousBest };
    active.events.push(...outcome.events);
    sound("complete");
    if (score >= 0.8) {
      confetti();
    }
  } else if (play.kind === "lightning") {
    const xp = right * 3 + active.maxCombo;
    const outcome = recordGame("lightning", { score: right, xp, reason: `Lightning: ${right} correct, best combo ${active.maxCombo}` });
    progress().stats.bestCombo = Math.max(progress().stats.bestCombo || 0, active.maxCombo);
    active.events.push(...outcome.events, ...questEvent("lightning-score", right));
    completion = { ...completion, ...outcome, score: right };
    sound("complete");
  } else if (play.kind === "arcade" || play.kind === "estimation") {
    const points = results.reduce((sum, result) => sum + (result.score || 0), 0);
    const xp = Math.round(points * (play.kind === "estimation" ? 12 : 10));
    const label = play.kind === "arcade" ? "Sort & Match" : "Estimation dojo";
    const outcome = recordGame(play.kind, { score: right, xp, reason: `${label}: ${right} of ${firsts.length}` });
    active.events.push(...outcome.events);
    completion = { ...completion, ...outcome, score: right };
    sound("complete");
  } else if (play.kind === "boss") {
    const won = !active.lost && results.length >= play.steps.length;
    const outcome = recordGame(`boss:${play.key}`, { score: right, xp: won ? 60 : right * 3, reason: won ? `Defeated the ${getUnit(play.key)?.title} boss` : `Boss attempt: ${right} hits`, won });
    active.events.push(...outcome.events);
    completion = { ...completion, ...outcome, won };
    sound(won ? "complete" : "wrong");
    if (won) {
      confetti();
    }
  } else if (play.kind === "placement") {
    const byUnit = new Map();
    for (const result of results) {
      const unitKey = result.unitKey;
      const entry = byUnit.get(unitKey) || { right: 0, total: 0 };
      entry.total += 1;
      entry.right += result.correct ? 1 : 0;
      byUnit.set(unitKey, entry);
    }
    const passed = [...byUnit.entries()].filter(([, entry]) => entry.total > 0 && entry.right === entry.total).map(([unitKey]) => unitKey);
    passed.forEach(placeOutOf);
    completion = { ...completion, passed };
  }
  progress().profile.placementDone ||= play.kind === "placement";
  // Per-answer events were announced as they happened, and the summary lists
  // badges, so only a level-up earned by finishing gets a toast here.
  announce(active.events.slice(announced).filter((event) => event.kind === "level"));
  active.completion = completion;
  paint();
  document.querySelector("#main")?.scrollTo(0, 0);
}

function stageScores(results) {
  const stages = active.play.stages || [];
  return stages.map((stage) => {
    const inStage = results.filter((result) => result.stageId === stage.id);
    const score = inStage.length ? inStage.reduce((sum, result) => sum + (result.score || 0), 0) / inStage.length : null;
    return { id: stage.id, title: stage.title, score, count: inStage.length };
  });
}

// ── summary screens ─────────────────────────────────────────────────────────

function summaryView() {
  const { play, completion, events } = active;
  const xp = events.reduce((sum, event) => sum + (event.kind === "xp" ? event.amount : 0), 0);
  const today = todayStats();
  const badges = events.filter((event) => event.kind === "badge");
  const body = h("div", { class: ["summary", `summary-${play.kind}`] });

  if (play.kind === "lesson") {
    append(
      body,
      h("div", { class: "stars", "aria-label": `${completion.stars} of 3 stars` }, [1, 2, 3].map((index) => h("span", { class: ["star", index <= completion.stars && "is-lit"], style: { "--delay": `${index * 140}ms` } }, icon("star", { size: 44 })))),
      h("h1", { class: "summary-title", text: completion.firstTime ? "Lesson complete!" : "Lesson replayed" }),
      h("p", { class: "summary-lede", text: praise(completion.right, completion.firsts) })
    );
  } else if (play.kind === "project") {
    body.append(projectScorecard(completion));
  } else if (play.kind === "boss") {
    append(
      body,
      h("div", { class: ["boss-result", completion.won ? "is-won" : "is-lost"] }, icon(completion.won ? "crown" : "heart", { size: 56 })),
      h("h1", { class: "summary-title", text: completion.won ? "Boss defeated!" : "The boss wins this round" }),
      h("p", { class: "summary-lede", text: completion.won ? `${completion.right} of ${completion.firsts} with ${active.hearts} ${active.hearts === 1 ? "life" : "lives"} left.` : "Review the misses below, then come back — the questions change every time." })
    );
  } else if (play.kind === "placement") {
    append(
      body,
      h("h1", { class: "summary-title", text: "Placement complete" }),
      h("p", { class: "summary-lede", text: completion.passed.length ? `You tested out of ${plural(completion.passed.length, "unit")}: ${completion.passed.map((key) => getUnit(key).title).join(", ")}. Your path picks up after them, and those lessons stay open whenever you want a refresher.` : "Starting from the beginning is the right call — the first units will go quickly." })
    );
  } else {
    const outOfTime = active.timerEnd && Date.now() >= active.timerEnd;
    const title = { lightning: outOfTime ? "Time!" : "Deck cleared!", arcade: "Puzzles solved", estimation: "Dojo complete", review: "Review complete" }[play.kind] || "Done";
    append(
      body,
      h("h1", { class: "summary-title", text: title }),
      h("div", { class: "big-score" }, h("strong", { text: String(completion.right) }), h("span", { text: `of ${completion.firsts} ${play.kind === "estimation" ? "within 30%" : "correct"}` })),
      completion.isBest && completion.previousBest != null && chip("New personal best!", { tone: "good", iconName: "trophy" }),
      play.kind === "lightning" && h("p", { class: "summary-lede", text: `Best combo ×${active.maxCombo}. Speed comes after accuracy — every card here is one you've already learned.` })
    );
  }

  append(
    body,
    h(
      "div",
      { class: "stat-row" },
      statTile({ label: "XP earned", value: `+${xp}` }),
      play.kind !== "project" && statTile({ label: "Accuracy", value: completion.firsts ? pct(completion.right / completion.firsts) : "—", sub: `${completion.right} of ${completion.firsts} first try` }),
      statTile({ label: "Daily goal", value: `${Math.min(today.xpToday, today.goal)} / ${today.goal}`, sub: today.goalMet ? `Met · ${today.streak}-day streak` : `${today.goal - today.xpToday} XP to go` })
    ),
    badges.length > 0 && h("div", { class: "badge-earned" }, badges.map((event) => h("div", { class: "badge-pill" }, icon("star", { size: 18 }), h("div", null, h("strong", { text: event.badge.title }), h("span", { text: event.badge.description }))))),
    missesList(),
    h("div", { class: "summary-actions" }, summaryActions())
  );
  return body;
}

function projectScorecard(completion) {
  const letter = gradeLetter(completion.score);
  return h(
    "div",
    { class: "scorecard" },
    h("div", { class: ["grade-badge", `grade-${letter.toLowerCase()}`] }, h("strong", { text: letter }), h("span", { text: `${Math.round(completion.score * 100)}%` })),
    h("h1", { class: "summary-title", text: active.play.title }),
    h("p", { class: "summary-lede", text: completion.score >= 0.8 ? "A design you could defend in an interview." : completion.score >= 0.6 ? "Solid bones. The stages below show where to tighten it." : "A first pass. Work through the misses below, then try again." }),
    completion.previousBest != null && h("p", { class: "muted small", text: `Previous best: ${Math.round(completion.previousBest * 100)}%` }),
    h(
      "div",
      { class: "stage-scores" },
      completion.stages.map((stage) =>
        h(
          "div",
          { class: "stage-score" },
          h("span", { class: "stage-score-title", text: stage.title }),
          h("span", { class: "stage-score-bar" }, h("span", { style: { "--v": `${Math.round((stage.score ?? 0) * 100)}%` }, class: stage.score >= 0.75 ? "is-good" : stage.score >= 0.5 ? "is-ok" : "is-low" })),
          h("strong", { class: "stage-score-num", text: stage.score == null ? "—" : `${Math.round(stage.score * 100)}%` })
        )
      )
    )
  );
}

// What went wrong, with the right answer — the most useful part of a summary.
function missesList() {
  const misses = active.results.filter((result) => result && result.first && !result.correct);
  if (misses.length === 0) {
    return null;
  }
  const interview = active.play.options.deferFeedback;
  return h(
    "section",
    { class: "card misses" },
    h("h2", { class: "card-title", text: interview ? "Feedback on your answers" : "Worth another look" }),
    h(
      "ul",
      { class: "miss-list" },
      misses.slice(0, 12).map((result) =>
        h(
          "li",
          { class: "miss" },
          h("p", { class: "miss-prompt" }, h("strong", { text: TYPE_LABELS[result.step.type] }), ` · ${stepPrompt(result.step)}`),
          result.step.type === "build" && result.result?.detail
            ? h("ul", { class: "miss-checks" }, result.result.detail.checks.filter((check) => !check.ok).map((check) => h("li", null, h("strong", { text: check.text }), check.why ? ` — ${check.why}` : "")))
            : h("p", { class: "miss-answer" }, h("span", { class: "muted", text: "Answer: " }), answerSummary(result.step)),
          result.step.why && h("p", { class: "miss-why muted small" }, plain(result.step.why))
        )
      )
    )
  );
}

function summaryActions() {
  const { play, completion } = active;
  const actions = [];
  if (play.kind === "lesson" && completion.next && completion.next !== play.key) {
    actions.push(button(`Next: ${getLesson(completion.next).title}`, { variant: "go", size: "lg", iconAfter: "arrowRight", onClick: () => import("../state/sessions.js").then(({ lessonPlay }) => startPlay(lessonPlay(completion.next), { returnTo: exitTo })) }));
  }
  if (play.kind === "project") {
    actions.push(button("Export for AI review", { iconName: "download", onClick: exportProject }));
  }
  if (["lightning", "arcade", "estimation", "boss", "project"].includes(play.kind)) {
    actions.push(button(play.kind === "boss" && completion.won ? "Fight again" : "Play again", { variant: actions.length ? "default" : "go", iconName: "retry", onClick: replay }));
  }
  actions.push(button(play.kind === "lesson" ? "Back to the path" : "Done", { variant: actions.length ? "ghost" : "go", size: "lg", onClick: exit }));
  return actions;
}

function replay() {
  const { play } = active;
  import("../state/sessions.js").then((sessions) => {
    const builders = {
      lightning: () => sessions.lightningPlay({ scope: play.scope }),
      arcade: () => sessions.arcadePlay({ scope: play.scope }),
      estimation: () => sessions.estimationPlay({ scope: play.scope }),
      boss: () => sessions.bossPlay(play.key),
      project: () => sessions.projectPlay(play.key, { interview: play.options.interview })
    };
    startPlay(builders[play.kind](), { returnTo: exitTo });
  });
}

function exportProject() {
  const { play, completion } = active;
  const lines = [
    `# ${play.title} — design review request`,
    "",
    "Please review this system design. For each stage, say what is strong, what is missing or wrong, and what a senior engineer would add. Finish with an overall assessment.",
    "",
    `- Mode: ${play.options.interview ? "Interview (timed, no feedback during)" : "Guided"}`,
    `- Auto-graded score: ${Math.round(completion.score * 100)}% (${gradeLetter(completion.score)})`,
    `- Exported: ${new Date().toLocaleString()}`,
    "",
    "## Brief",
    "",
    plain(play.brief || ""),
    ""
  ];
  for (const stage of completion.stages) {
    lines.push(`## ${stage.title}${stage.score == null ? "" : ` — ${Math.round(stage.score * 100)}%`}`, "");
    for (const result of active.results.filter((entry) => entry && entry.first && entry.stageId === stage.id)) {
      lines.push(`### ${stepPrompt(result.step)}`, "", `**Type:** ${TYPE_LABELS[result.step.type]} · **Auto-grade:** ${Math.round((result.score || 0) * 100)}%`, "");
      if (result.step.type === "build" && result.result?.graph) {
        const graph = result.result.graph;
        const label = (id) => {
          const node = graph.nodes.find((entry) => entry.id === id);
          return node ? node.label || node.type : id;
        };
        lines.push("**My architecture:**", "", ...graph.edges.map((edge) => `- ${label(edge.from)} → ${label(edge.to)}`), "");
        lines.push("**Checks:**", "", ...result.result.detail.checks.map((check) => `- ${check.ok ? "✅" : "❌"} ${check.text}`), "");
      } else {
        lines.push("**My answer:**", "", String(result.response || "_(blank)_"), "", `**Reference:** ${answerSummary(result.step)}`, "");
      }
    }
  }
  const project = getLesson(play.key);
  saveMarkdownFile({ defaultName: `${play.key.split("::").pop()}-design.md`, tent: "design-lab", markdown: lines.join("\n") });
  return project;
}

function praise(right, total) {
  if (total === 0) {
    return "You read it through — the questions will come back in review.";
  }
  const share = right / total;
  if (share === 1) {
    return "Every question right on the first try.";
  }
  if (share >= 0.7) {
    return "Strong work. The misses below are already queued for review.";
  }
  return "Tough one — that's where the learning happens. The misses are queued for review so they come back before you forget.";
}

// ── project brief ───────────────────────────────────────────────────────────

function briefView() {
  const { play } = active;
  const project = getLesson(play.key);
  return h(
    "div",
    { class: "brief" },
    h("p", { class: "eyebrow", text: play.options.interview ? "Design Lab · Interview mode" : `Design Lab · ${project.difficulty}` }),
    h("h1", { class: "summary-title", text: play.title }),
    h("div", { class: "brief-card rich" }, rich(play.brief || project.summary || "")),
    h(
      "ol",
      { class: "brief-stages" },
      project.stages.map((stage) => h("li", null, h("strong", { text: stage.title }), h("span", { class: "muted", text: ` · ${plural(stage.count, "step")}` })))
    ),
    play.options.interview
      ? h("p", { class: "callout callout-accent" }, icon("clock", { size: 18 }), h("span", { text: "45 minutes. No hints and no feedback until the end — like the real thing. You'll get a full scorecard and can export it for an AI review." }))
      : h("p", { class: "muted", text: `About ${project.minutes} minutes. Every stage is graded as you go, with a scorecard at the end.` })
  );
}

// ── keyboard ────────────────────────────────────────────────────────────────

function handleKey(event) {
  if (!active || event.altKey || event.metaKey) {
    return;
  }
  const typing = isTyping();
  if (event.key === "Escape") {
    if (typing) {
      document.activeElement.blur();
    } else {
      active.done ? exit() : confirmQuit();
    }
    return;
  }
  if (active.done) {
    return;
  }
  if (!active.started) {
    if (event.key === "Enter") {
      event.preventDefault();
      startProject();
    }
    return;
  }
  const card = active.card;
  if (!card) {
    return;
  }
  const enter = event.key === "Enter" && (!typing || event.ctrlKey || document.activeElement?.tagName === "INPUT");
  if (event.ctrlKey && event.key !== "Enter") {
    return;
  }

  if (card.phase === "concept") {
    if (enter && !typing) {
      event.preventDefault();
      advance();
    }
    return;
  }

  if (card.phase === "attempt") {
    if (enter && card.exercise.ready()) {
      if (active.play.options.confidence) {
        if (typing) {
          document.activeElement.blur();
          ui.bar.querySelector("#confidenceRow button")?.focus();
        }
        return;
      }
      event.preventDefault();
      submit();
      return;
    }
    if (typing) {
      return;
    }
    if (active.play.options.confidence && /^[1-4]$/.test(event.key) && card.exercise.ready()) {
      event.preventDefault();
      submit({ confidence: Number(event.key) });
      return;
    }
    if (event.key.toLowerCase() === "h" && active.play.options.hints !== false) {
      event.preventDefault();
      useHint();
      return;
    }
    if (card.exercise.hotkey?.(event.key)) {
      event.preventDefault();
    }
    return;
  }

  // feedback
  if (typing) {
    return;
  }
  if (card.result?.verdict === "self" && card.selfGraded == null && /^[1-3]$/.test(event.key)) {
    event.preventDefault();
    selfGrade(["wrong", "partial", "correct"][Number(event.key) - 1]);
    return;
  }
  if (/^[1-4]$/.test(event.key)) {
    const target = ui.bar.querySelector(`[data-grade="${event.key}"]`);
    if (target && !target.disabled) {
      event.preventDefault();
      target.click();
    }
    return;
  }
  if (event.key === "Enter" && document.activeElement?.tagName !== "BUTTON") {
    const target = ui.bar.querySelector("#primaryAction:not(:disabled), .grade.is-suggested:not(:disabled)");
    if (target) {
      event.preventDefault();
      target.click();
    }
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

function comboMultiplier() {
  return 1 + Math.min(3, Math.floor(active.combo / 3));
}

function clock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function hasActivePlay() {
  return Boolean(active && !active.done);
}

export { isLessonComplete, getItem };

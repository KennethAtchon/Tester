// Focus-mode practice session — where the learning engine meets the learner.
//
// Each card runs: (recall first, for seen choice items) → attempt → commit by
// rating confidence → feedback that explains *why* → grade (Again/Hard/Good/
// Easy) → schedule. Along the way: pretesting for new items, a faded cloze
// after a miss, a hint ladder that costs points, misconception notes for wrong
// options, a hypercorrection callout for confident misses, an optional
// self-explanation before the expert "why", and in-session re-queueing of
// misses. The session ends with a feed-up / feed-back / feed-forward summary.

import { h, isTyping } from "../../lib/dom.js";
import { icon } from "../icons.js";
import { button, chip, statTile, meter, pct, plural, card } from "../components.js";
import { getItem, getSkill } from "../../state/catalog.js";
import { settings, progress } from "../../state/progress.js";
import {
  memoryOf,
  keyFor,
  scaffoldFor,
  recordAttempt,
  recordJol,
  recordCapstone,
  todayStats,
  masteryOf,
  setKeyOverride
} from "../../state/learner.js";
import { buildSession } from "../../state/sessions.js";
import { previewIntervals, GRADES } from "../../domain/fsrs.js";
import {
  CONFIDENCE_LEVELS,
  isChoice,
  gradeChoice,
  checkText,
  prefillRubric,
  rubricOutcome,
  suggestGrade,
  buildHintLadder,
  buildCloze,
  checkClozeWord,
  segmentModelAnswer,
  misconceptionFor
} from "../../domain/grading.js";
import { formatInterval, formatAgo } from "../../lib/time.js";
import { renderCodeControl } from "../runner.js";
import { mountCodeEditors } from "../codeEditor.js";
import { navigate } from "../router.js";
import { toast } from "../toast.js";

const LETTERS = "ABCDEFG";
const MAX_REQUEUES = 2;

let active = null;
let ui = null;

export function startSession(session) {
  if (!session || session.queue.length === 0) {
    toast("Nothing to practice there right now.", { tone: "info" });
    return;
  }
  active = {
    session,
    index: 0,
    card: null,
    results: [],
    events: [],
    badges: [],
    mastered: [],
    done: false,
    timerEnd: session.timerMs ? Date.now() + session.timerMs : null,
    jol: {}
  };
  navigate("session");
}

export function renderSession(root) {
  if (!active) {
    queueMicrotask(() => navigate("today"));
    return null;
  }

  const top = h("header", { class: "focus-top" });
  const stage = h("div", { class: "focus-stage" });
  const keys = h("footer", { class: "focus-keys", "aria-hidden": "true" });
  root.append(h("div", { class: "focus" }, top, stage, keys));
  ui = { top, stage, keys };

  paint();

  const onKey = (event) => handleKey(event);
  document.addEventListener("keydown", onKey);
  const timer = active.timerEnd ? setInterval(tick, 1000) : null;

  return () => {
    document.removeEventListener("keydown", onKey);
    if (timer) {
      clearInterval(timer);
    }
    ui = null;
  };
}

// ── painting ────────────────────────────────────────────────────────────────

function paint() {
  if (!ui) {
    return;
  }
  paintTop();
  if (active.done) {
    ui.stage.replaceChildren(summaryView());
    ui.keys.replaceChildren();
    return;
  }
  if (!active.card) {
    active.card = newCard(active.session.queue[active.index]);
    if (!active.card) {
      advance();
      return;
    }
  }
  const c = active.card;
  const fresh = !c.painted;
  const phaseChanged = c.scrolledPhase !== c.phase;
  ui.stage.replaceChildren(cardView(c));
  ui.keys.replaceChildren(...keyHints(c));
  mountCodeEditors(ui.stage, c.item.key);
  focusFirstField(c);
  // New card → back to the top; feedback → make sure the grade buttons show.
  if (fresh) {
    document.querySelector("#main")?.scrollTo(0, 0);
  } else if (phaseChanged && c.phase === "feedback") {
    ui.stage.querySelector(".grade-row, .explain")?.scrollIntoView({ block: "nearest" });
  }
  c.scrolledPhase = c.phase;
}

function paintTop() {
  const { session, results, index } = active;
  const segments = session.queue.map((entry, position) => {
    const result = results[position];
    const state = result ? (result.correct ? "is-right" : "is-wrong") : position === index && !active.done ? "is-current" : "";
    return h("span", { class: ["seg", state, entry.mode === "relearn" && "is-retry"] });
  });
  const xp = active.events.reduce((sum, event) => sum + (event.kind === "xp" ? event.amount : 0), 0);

  const parts = [
    button(active.done ? "Close" : "End", {
      variant: "ghost",
      size: "sm",
      iconName: "x",
      onClick: () => (active.done || results.length === 0 ? exit() : finish())
    }),
    h(
      "div",
      { class: "focus-progress" },
      h("div", { class: "focus-title" }, h("strong", { text: session.title }), session.subtitle && h("span", { text: session.subtitle })),
      h("div", { class: "segs", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(session.queue.length), "aria-valuenow": String(Math.min(index, session.queue.length)) }, segments)
    ),
    h("div", { class: "focus-count", text: `${Math.min(index + (active.done ? 0 : 1), session.queue.length)} / ${session.queue.length}` }),
    h("div", { class: "focus-xp", title: "Points earned this session" }, icon("star", { size: 15 }), `${xp}`),
    active.timerEnd && h("div", { class: "focus-timer", id: "focusTimer", text: formatClock(active.timerEnd - Date.now()) })
  ];
  ui.top.replaceChildren(...parts.filter(Boolean));
}

function newCard(entry) {
  const item = entry && getItem(entry.itemKey);
  if (!item) {
    return null;
  }
  const question = item.question;
  const key = keyFor(item);
  const memory = memoryOf(item.key);
  const kind = active.session.kind;
  const strict = kind === "placement" || kind === "capstone";
  const scaffold = strict ? 2 : scaffoldFor(item.key);
  const choice = isChoice(question);
  const textual = question.type === "short_answer" || (question.type === "long_answer" && question.answerMode === "text");
  const recallMode = settings().recallFirst;
  const recallFirst = choice && question.type !== "true_false" && kind !== "placement" &&
    (recallMode === "always" || (recallMode === "seen" && memory.state !== "new"));

  return {
    entry,
    item,
    key,
    memory,
    scaffold,
    phase: recallFirst ? "recall" : "attempt",
    shownAt: Date.now(),
    recallText: "",
    selected: [],
    optionOrder: choice && question.type !== "true_false" ? shuffle(question.options) : question.options,
    text: "",
    code: question.starterCode || "",
    cloze: !strict && scaffold === 1 && key.text && textual ? buildCloze(key.text) : null,
    clozeValues: [],
    ladder: active.session.allowHints ? buildHintLadder(question, key) : [],
    hintsUsed: 0,
    revealed: false,
    confidence: null,
    latencyMs: 0,
    outcome: null,
    runResult: null,
    busy: false,
    explain: { wanted: false, text: "", done: false },
    pretest: !strict && memory.state === "new" && scaffold === 0
  };
}

function cardView(c) {
  const question = c.item.question;
  const feedback = c.phase === "feedback";

  // Only a newly presented card animates in; repaints within a card don't.
  const entering = !c.painted;
  c.painted = true;

  return h(
    "article",
    { class: ["study-card", entering && "is-entering", feedback && "is-feedback", c.outcome && `verdict-${c.outcome.verdict}`] },
    metaRow(c),
    h("h1", { class: "prompt", text: question.prompt }),
    c.pretest && !feedback &&
      h(
        "div",
        { class: "callout callout-accent" },
        icon("sparkle", { size: 18 }),
        h("div", null, h("strong", { text: "New — have a go first. " }), "A wrong guess followed by feedback teaches more than reading the answer.")
      ),
    c.cloze && !feedback &&
      h("div", { class: "callout callout-muted" }, icon("pencil", { size: 18 }), h("div", null, h("strong", { text: "Faded example. " }), "The model answer with its key words removed — fill them in.")),
    contextView(question),
    answerView(c),
    hintsView(c),
    feedback ? feedbackView(c) : commitBar(c)
  );
}

function metaRow(c) {
  const { entry, item, memory } = c;
  const typeLabel = {
    single_choice: "Choose one",
    multiple_choice: "Select all that apply",
    true_false: "True or false",
    short_answer: "Type the answer",
    long_answer: item.question.answerMode === "code" ? "Write code" : item.question.answerMode === "both" ? "Explain + code" : "Explain in your own words",
    code_run: "Code · run the tests"
  }[item.question.type];

  let modeChip;
  if (entry.mode === "relearn") {
    modeChip = chip("Retry", { tone: "warn", iconName: "retry" });
  } else if (entry.mode === "placement") {
    modeChip = chip("Placement", { iconName: "compass" });
  } else if (entry.mode === "capstone") {
    modeChip = chip("Capstone", { iconName: "trophy" });
  } else if (memory.state === "new") {
    modeChip = chip("New", { tone: "accent", iconName: "sparkle" });
  } else {
    modeChip = chip(`Review · seen ${formatAgo(memory.lastReview)}`, { iconName: "clock" });
  }

  return h(
    "div",
    { class: "card-meta" },
    h("a", { class: "chip chip-link", href: `#/skill/${encodeURIComponent(item.skillKey)}`, text: item.skillTitle, title: item.libTitle }),
    modeChip,
    h("span", { class: "card-type", text: typeLabel })
  );
}

function contextView(question) {
  // Starter code is already in the editor; don't show it twice.
  const hasEditor = question.type === "code_run" || question.answerMode === "code" || question.answerMode === "both";
  const details = (question.details || []).filter((detail) => !(hasEditor && detail.label === "Starter code"));
  if (details.length === 0) {
    return null;
  }
  return h(
    "div",
    { class: "context" },
    details.map((detail) =>
      h(
        "details",
        { class: ["context-block", detail.kind === "code" && "is-code"], open: true },
        h("summary", { text: detail.label }),
        detail.kind === "list" && Array.isArray(detail.value)
          ? h("ul", null, detail.value.map((value) => h("li", { text: value })))
          : detail.kind === "code"
            ? h("pre", null, h("code", { text: Array.isArray(detail.value) ? detail.value.join("\n") : detail.value }))
            : h("p", { text: Array.isArray(detail.value) ? detail.value.join("\n") : detail.value })
      )
    )
  );
}

// ── answer surfaces ─────────────────────────────────────────────────────────

function answerView(c) {
  const question = c.item.question;
  if (isChoice(question)) {
    return choiceView(c);
  }
  if (c.cloze) {
    return clozeView(c);
  }
  if (question.type === "code_run") {
    return codeRunView(c);
  }
  if (c.phase === "feedback") {
    return comparisonView(c);
  }
  if (question.type === "short_answer") {
    return h("input", {
      type: "text",
      class: "input answer-input",
      placeholder: "Type your answer from memory",
      value: c.text,
      "aria-label": "Your answer",
      onInput: (event) => {
        c.text = event.target.value;
        syncCommit(c);
      },
      onKeydown: (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.target.blur();
          pulseConfidence();
        }
      }
    });
  }
  return longAnswerView(c);
}

function longAnswerView(c) {
  const question = c.item.question;
  const prose = () =>
    h("textarea", {
      class: "input answer-text",
      rows: 7,
      placeholder: question.placeholder || "Write your answer from memory — partial is fine",
      value: c.text,
      "aria-label": "Your answer",
      onInput: (event) => {
        c.text = event.target.value;
        syncCommit(c);
      }
    });
  const code = () => {
    const textarea = h("textarea", {
      class: "long-answer code-editor",
      spellcheck: "false",
      value: c.code,
      dataset: { questionId: "code", codeEditor: question.language || "javascript", run: "free" }
    });
    const wrap = h("div", { class: "code-answer" }, textarea);
    wrap.addEventListener("input", (event) => {
      if (event.target === textarea) {
        c.code = textarea.value;
        syncCommit(c);
      }
    });
    return wrap;
  };

  if (question.answerMode === "code") {
    return code();
  }
  if (question.answerMode === "both") {
    return h("div", { class: "answer-stack" }, h("label", { class: "field-label", text: "Explanation" }), prose(), h("label", { class: "field-label", text: "Code" }), code());
  }
  return prose();
}

function codeRunView(c) {
  const question = c.item.question;
  const control = renderCodeControl({
    answerId: "code",
    initialCode: c.code,
    language: question.language,
    tests: question.runnerTests,
    lastResult: c.runResult,
    onResult: (result) => {
      c.runResult = result;
    }
  });
  // Only the tagged source textarea carries the answer; CodeMirror's own hidden
  // input textarea fires "input" too and must be ignored.
  control.addEventListener("input", (event) => {
    if (event.target.dataset.questionId === "code") {
      c.code = event.target.value;
      syncCommit(c);
    }
  });
  c.runner = control;
  return control;
}

function choiceView(c) {
  const question = c.item.question;
  const feedback = c.phase === "feedback";

  if (c.phase === "recall") {
    const box = h("textarea", {
      class: "input recall-box",
      rows: 2,
      placeholder: "Type it, or just say it in your head — then show the options",
      value: c.recallText,
      "aria-label": "Recall the answer before seeing options",
      onInput: (event) => {
        c.recallText = event.target.value;
      },
      onKeydown: (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          showOptions(c);
        }
      }
    });
    return h(
      "div",
      { class: "recall" },
      h("div", { class: "recall-head" }, icon("eye", { size: 18 }), h("strong", { text: "Recall first." }), h("span", { text: "Producing the answer beats recognizing it." })),
      box,
      button("Show options", { variant: "primary", kbd: "Enter", onClick: () => showOptions(c) })
    );
  }

  const multi = question.type === "multiple_choice";
  const correct = new Set(c.key.choice || []);
  const eliminated = eliminatedOptions(c);

  const list = h("div", { class: "options", role: multi ? "group" : "radiogroup", "aria-label": "Options" });
  c.optionOrder.forEach((option, index) => {
    const chosen = c.selected.includes(option);
    const states = [];
    if (feedback && c.key.choice) {
      if (correct.has(option)) {
        states.push(chosen ? "is-correct" : "is-missed");
      } else if (chosen) {
        states.push("is-wrong");
      }
    }
    const note = feedback && chosen && c.key.choice && !correct.has(option) ? misconceptionFor(question, option) : null;
    list.append(
      h(
        "button",
        {
          type: "button",
          class: ["option", chosen && "is-chosen", eliminated.has(option) && "is-eliminated", ...states],
          role: multi ? "checkbox" : "radio",
          "aria-checked": String(chosen),
          disabled: feedback || eliminated.has(option),
          onClick: () => toggleOption(c, option)
        },
        h("span", { class: "option-key", text: index < LETTERS.length ? LETTERS[index] : "" }),
        h("span", { class: "option-text", text: option }),
        states.includes("is-correct") || states.includes("is-missed") ? icon("check", { size: 18, className: "option-mark" }) : null,
        states.includes("is-wrong") ? icon("x", { size: 18, className: "option-mark" }) : null,
        note && h("span", { class: "option-note" }, h("strong", { text: "Why not: " }), note)
      )
    );
  });

  return h(
    "div",
    { class: "choice-wrap" },
    c.recallText.trim() && h("p", { class: "recalled" }, h("span", { text: "You recalled: " }), h("em", { text: c.recallText.trim() })),
    list
  );
}

function clozeView(c) {
  const feedback = c.phase === "feedback";
  const marks = c.outcome?.cloze || [];
  let blankIndex = -1;
  const paragraph = h("p", { class: "cloze" });
  for (const part of c.cloze) {
    if (!part.blank) {
      paragraph.append(part.text);
      continue;
    }
    blankIndex += 1;
    const position = blankIndex;
    if (feedback) {
      const right = marks[position];
      paragraph.append(
        h(
          "span",
          { class: ["cloze-result", right ? "is-right" : "is-wrong"] },
          !right && c.clozeValues[position] ? h("s", { text: c.clozeValues[position] }) : null,
          h("strong", { text: part.answer })
        )
      );
    } else {
      paragraph.append(
        h("input", {
          type: "text",
          class: "cloze-input",
          size: Math.max(4, Math.min(16, part.answer.length + 1)),
          value: c.clozeValues[position] || "",
          "aria-label": `Blank ${position + 1}`,
          autocomplete: "off",
          spellcheck: "false",
          onInput: (event) => {
            c.clozeValues[position] = event.target.value;
            syncCommit(c);
          }
        })
      );
    }
  }
  return h("div", { class: "cloze-wrap" }, paragraph);
}

// After an open answer: learner's answer beside the model, key terms marked.
function comparisonView(c) {
  const response = responseText(c);
  const model = c.key.text;
  const question = c.item.question;
  const yours = h("div", { class: "compare-col" }, h("div", { class: "compare-label", text: "Your answer" }));
  if (question.answerMode === "code" || question.answerMode === "both") {
    if (c.text.trim()) {
      yours.append(h("p", { class: "compare-text", text: c.text }));
    }
    yours.append(h("pre", { class: "compare-code" }, h("code", { text: c.code || "// (no code)" })));
  } else {
    yours.append(h("p", { class: ["compare-text", !response.trim() && "is-empty"], text: response.trim() || "(left blank)" }));
  }

  if (!model) {
    return h("div", { class: "compare is-single" }, yours);
  }

  const modelText = h("p", { class: "compare-text" });
  for (const segment of segmentModelAnswer(model, response)) {
    modelText.append(segment.mark ? h("mark", { class: `term-${segment.mark}`, text: segment.text }) : segment.text);
  }
  const textResult = c.outcome.text;
  return h(
    "div",
    { class: "compare" },
    yours,
    h(
      "div",
      { class: "compare-col is-model" },
      h("div", { class: "compare-label" }, "Model answer", textResult && h("span", { class: "compare-score", text: ` · ${textResult.hit.length}/${textResult.hit.length + textResult.missed.length} key terms` })),
      modelText,
      h("div", { class: "compare-legend" }, h("mark", { class: "term-hit", text: "in your answer" }), h("mark", { class: "term-miss", text: "missing" }))
    )
  );
}

function hintsView(c) {
  if (c.hintsUsed === 0) {
    return null;
  }
  return h(
    "div",
    { class: "hints" },
    c.ladder.slice(0, c.hintsUsed).filter((hint) => hint.kind !== "reveal" && hint.kind !== "eliminate").map((hint) =>
      h(
        "div",
        { class: "hint" },
        icon("bulb", { size: 16 }),
        h(
          "div",
          null,
          h("strong", { text: `${hint.label}: ` }),
          hint.kind === "list" ? h("ul", null, hint.items.map((value) => h("li", { text: value }))) : hint.kind === "code" ? h("pre", null, h("code", { text: hint.text })) : hint.text
        )
      )
    )
  );
}

// ── attempt → commit ────────────────────────────────────────────────────────

function commitBar(c) {
  const nextHint = c.ladder[c.hintsUsed];
  const ready = answerReady(c);
  const hintButton = nextHint && c.phase === "attempt"
    ? button(nextHint.reveal ? "Show answer" : `Hint ${c.hintsUsed + 1}/${c.ladder.length}`, {
        variant: "ghost",
        iconName: "bulb",
        kbd: "H",
        title: nextHint.reveal ? "Ends the attempt as a miss" : "Costs 3 points and caps this card at Hard",
        onClick: () => useHint(c)
      })
    : null;

  return h(
    "div",
    { class: "commit" },
    h(
      "div",
      { class: "commit-left" },
      hintButton,
      hintButton && h("span", { class: "commit-note", text: nextHint.reveal ? "counts as a miss" : "−3 pts · caps at Hard" }),
      c.pretest && button("I don't know yet — show me", { variant: "ghost", onClick: () => reveal(c) })
    ),
    h(
      "div",
      { class: ["confidence", !ready && "is-waiting"], id: "confidenceRow" },
      h("span", { class: "confidence-label", text: c.phase === "recall" ? "Show the options to answer" : ready ? "How sure are you?" : "Answer, then rate your confidence" }),
      h(
        "div",
        { class: "confidence-buttons" },
        CONFIDENCE_LEVELS.map((level) =>
          button(level.label, {
            className: `conf conf-${level.value}`,
            kbd: String(level.value),
            disabled: !ready || c.busy,
            onClick: () => commit(c, level.value)
          })
        )
      )
    )
  );
}

function answerReady(c) {
  const question = c.item.question;
  if (c.phase === "recall") {
    return false;
  }
  if (isChoice(question)) {
    return c.selected.length > 0;
  }
  if (c.cloze) {
    return c.clozeValues.some((value) => value && value.trim());
  }
  if (question.type === "code_run" || question.answerMode === "code") {
    return c.code.trim().length > 0;
  }
  if (question.answerMode === "both") {
    return Boolean(c.text.trim() || c.code.trim());
  }
  return c.text.trim().length > 0;
}

// Enables the confidence buttons as soon as there's an answer, without a
// full repaint (which would steal focus from the field being typed in).
function syncCommit(c) {
  const row = ui?.stage.querySelector("#confidenceRow");
  if (!row) {
    return;
  }
  const ready = answerReady(c);
  row.classList.toggle("is-waiting", !ready);
  row.querySelector(".confidence-label").textContent = ready ? "How sure are you?" : "Answer, then rate your confidence";
  for (const confidenceButton of row.querySelectorAll("button")) {
    confidenceButton.disabled = !ready || c.busy;
  }
}

function pulseConfidence() {
  const row = ui?.stage.querySelector("#confidenceRow");
  if (row) {
    row.classList.remove("pulse");
    void row.offsetWidth;
    row.classList.add("pulse");
  }
}

function showOptions(c) {
  c.phase = "attempt";
  paint();
}

function toggleOption(c, option) {
  if (c.phase !== "attempt") {
    return;
  }
  if (c.item.question.type === "multiple_choice") {
    c.selected = c.selected.includes(option) ? c.selected.filter((value) => value !== option) : [...c.selected, option];
  } else {
    c.selected = [option];
  }
  paint();
}

function useHint(c) {
  const hint = c.ladder[c.hintsUsed];
  if (!hint || c.phase !== "attempt") {
    return;
  }
  if (hint.reveal) {
    reveal(c);
    return;
  }
  c.hintsUsed += 1;
  c.selected = c.selected.filter((option) => !eliminatedOptions(c).has(option));
  paint();
}

function eliminatedOptions(c) {
  const set = new Set();
  for (const hint of c.ladder.slice(0, c.hintsUsed)) {
    if (hint.kind === "eliminate") {
      hint.options.forEach((option) => set.add(option));
    }
  }
  return set;
}

function reveal(c) {
  c.revealed = true;
  commit(c, 1);
}

async function commit(c, confidence) {
  if (c.phase === "feedback" || c.busy) {
    return;
  }
  c.confidence = confidence;
  c.latencyMs = Date.now() - c.shownAt;

  const question = c.item.question;
  if (question.type === "code_run" && c.key.tests && !c.revealed) {
    c.busy = true;
    syncCommit(c);
    c.runResult = c.runner ? await c.runner.runTests() : null;
    c.busy = false;
  }

  c.outcome = evaluate(c);
  c.explain.wanted = shouldSelfExplain(c);
  c.phase = "feedback";
  paint();
}

function evaluate(c) {
  const question = c.item.question;
  const key = c.key;

  if (c.revealed) {
    return { verdict: "wrong", auto: true, revealed: true };
  }
  if (isChoice(question) && key.choice) {
    const result = gradeChoice(key, c.selected);
    return { verdict: result.correct ? "correct" : "wrong", auto: true, choice: result };
  }
  if (question.type === "code_run" && key.tests) {
    const run = c.runResult;
    const passed = Boolean(run && !run.compileError && run.results.length > 0 && run.results.every((result) => result.passed));
    return { verdict: passed ? "correct" : "wrong", auto: true };
  }
  if (c.cloze) {
    const blanks = c.cloze.filter((part) => part.blank);
    const marks = blanks.map((part, index) => checkClozeWord(c.clozeValues[index], part.answer));
    const share = marks.filter(Boolean).length / Math.max(1, marks.length);
    return { verdict: share >= 0.8 ? "correct" : share >= 0.5 ? "partial" : "wrong", auto: false, cloze: marks, share };
  }

  const response = responseText(c);
  if (key.rubric.length > 0 && !isChoice(question)) {
    const checked = prefillRubric(response, key.rubric);
    return { verdict: rubricOutcome(checked), auto: false, rubricChecked: checked, text: key.text ? checkText(response, key.text) : null };
  }
  if (key.text && !isChoice(question)) {
    const text = checkText(response, key.text);
    return { verdict: text.verdict === "match" ? "correct" : text.verdict === "partial" ? "partial" : "wrong", auto: false, text };
  }
  return { verdict: "unknown", auto: false };
}

function shouldSelfExplain(c) {
  const mode = settings().selfExplain;
  const kind = active.session.kind;
  if (mode === "off" || kind === "placement" || kind === "capstone") {
    return false;
  }
  if (c.outcome.verdict !== "correct" || !c.item.question.why) {
    return false;
  }
  return mode === "always" || c.confidence <= 2 || Math.random() < 0.34;
}

// ── feedback → grade ────────────────────────────────────────────────────────

function feedbackView(c) {
  const question = c.item.question;
  const o = c.outcome;
  const kind = active.session.kind;
  const parts = [];

  parts.push(verdictBanner(c));

  if (o.verdict === "wrong" && c.confidence >= 3 && !c.revealed) {
    parts.push(
      h(
        "div",
        { class: "callout callout-hyper" },
        icon("alert", { size: 18 }),
        h(
          "div",
          null,
          h("strong", { text: `You were ${CONFIDENCE_LEVELS[c.confidence - 1].label.toLowerCase()} — and it was wrong. ` }),
          "Confident errors, once corrected, are remembered better than any other kind. Read this one closely; it's in your mistake notebook."
        )
      )
    );
  }

  if (o.verdict === "correct" && (c.memory.lapses > 0 || progress().mistakes[c.item.key]?.resolvedAt === null)) {
    parts.push(h("p", { class: "praise", text: "You'd missed this one before. Getting it now is exactly the kind of retrieval that makes it stick." }));
  }

  if (isChoice(question) && !c.key.choice) {
    parts.push(answerKeyPicker(c));
  }

  if (o.rubricChecked) {
    parts.push(rubricView(c));
  }

  const why = question.why || (isChoice(question) && !c.key.choice && c.key.text ? c.key.text : null);
  if (why) {
    parts.push(c.explain.wanted && !c.explain.done ? explainBox(c) : whyBox(c, why));
  } else if (o.verdict === "wrong" && c.key.choice) {
    parts.push(h("p", { class: "muted small", text: "No written explanation for this item yet. Add a \"why\" field to it in the JSON and it will show here." }));
  }

  if (!(c.explain.wanted && !c.explain.done)) {
    // Objective items in a placement or capstone grade themselves; anything
    // that needs judgment still gets the self-grade buttons.
    parts.push((kind === "placement" || kind === "capstone") && o.auto ? nextRow(c) : gradeRow(c));
  }

  return h("section", { class: "feedback" }, parts);
}

function verdictBanner(c) {
  const o = c.outcome;
  const map = {
    correct: { iconName: "check", title: "Correct", tone: "good" },
    partial: { iconName: "target", title: "Partly there", tone: "warn" },
    wrong: { iconName: "x", title: o.revealed ? "Here's the answer" : "Not quite", tone: "bad" },
    unknown: { iconName: "eye", title: c.key.text ? "Compare with the model answer" : "Grade yourself", tone: "muted" }
  };
  const meta = map[o.verdict];
  let detail = "";
  if (o.verdict === "correct" && c.confidence === 1) {
    detail = "But you were guessing, so it'll come back sooner.";
  } else if (o.choice && !o.choice.correct && c.item.question.type === "multiple_choice") {
    detail = `${o.choice.missed.length ? `Missed ${plural(o.choice.missed.length, "option")}` : ""}${o.choice.missed.length && o.choice.wrong.length ? " · " : ""}${o.choice.wrong.length ? `${plural(o.choice.wrong.length, "extra pick")}` : ""}.`;
  } else if (o.cloze) {
    detail = `${o.cloze.filter(Boolean).length} of ${o.cloze.length} blanks.`;
  } else if (o.rubricChecked) {
    detail = "Auto-checked against the rubric — adjust it below, then grade.";
  } else if (o.text) {
    detail = "Auto-checked by key terms — you make the final call.";
  } else if (o.verdict === "unknown") {
    detail = c.key.text ? "" : "This item has no answer key. Be honest — the schedule depends on it.";
  } else if (o.verdict === "wrong" && o.auto && c.item.question.type === "code_run") {
    detail = "Some tests failed — see the results above.";
  }
  return h(
    "div",
    { class: ["verdict", `tone-${meta.tone}`] },
    h("span", { class: "verdict-icon" }, icon(meta.iconName, { size: 20 })),
    h("div", null, h("strong", { text: meta.title }), detail && h("span", { text: ` ${detail}` }))
  );
}

function answerKeyPicker(c) {
  const select = h(
    "select",
    { class: "input input-sm", "aria-label": "Correct answer" },
    h("option", { value: "", text: "Choose the correct option…" }),
    c.item.question.options.map((option) => h("option", { value: option, text: option }))
  );
  return h(
    "div",
    { class: "key-picker" },
    h("span", { class: "muted small", text: "No answer key in this file. If you know it, set it once and future reviews grade automatically:" }),
    select,
    button("Save key", {
      size: "sm",
      onClick: () => {
        if (!select.value) {
          return;
        }
        setKeyOverride(c.item.key, select.value);
        c.key = keyFor(c.item);
        c.outcome = evaluate(c);
        paint();
      }
    })
  );
}

function rubricView(c) {
  const rubric = c.key.rubric;
  const list = h("ul", { class: "rubric" });
  rubric.forEach((row, index) => {
    const id = `rubric-${index}`;
    list.append(
      h(
        "li",
        null,
        h("input", {
          type: "checkbox",
          id,
          checked: Boolean(c.outcome.rubricChecked[index]),
          onChange: (event) => {
            c.outcome.rubricChecked[index] = event.target.checked;
            c.outcome.verdict = rubricOutcome(c.outcome.rubricChecked);
            paint();
          }
        }),
        h("label", { for: id, text: row })
      )
    );
  });
  const covered = c.outcome.rubricChecked.filter(Boolean).length;
  return h(
    "div",
    { class: "rubric-wrap" },
    h("div", { class: "rubric-head" }, h("strong", { text: `Rubric · ${covered}/${rubric.length}` }), h("span", { class: "muted small", text: "Pre-filled from your key terms. Tick what your answer really covered." })),
    list
  );
}

// Self-explanation: say why before seeing the expert's why (Chi et al.).
function explainBox(c) {
  const box = h("textarea", {
    class: "input",
    rows: 2,
    placeholder: "In a sentence: why is this the answer?",
    value: c.explain.text,
    "aria-label": "Explain why",
    onInput: (event) => {
      c.explain.text = event.target.value;
    },
    onKeydown: (event) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        c.explain.done = true;
        paint();
      }
    }
  });
  return h(
    "div",
    { class: "explain" },
    h("div", { class: "explain-head" }, icon("pencil", { size: 16 }), h("strong", { text: "Before the explanation —" }), h("span", { text: " why is this right? Explaining it to yourself is what turns a lucky pick into understanding." })),
    box,
    h(
      "div",
      { class: "explain-actions" },
      button("Compare", { variant: "primary", size: "sm", kbd: "Ctrl+Enter", onClick: () => { c.explain.done = true; paint(); } }),
      button("Skip", { variant: "ghost", size: "sm", onClick: () => { c.explain.text = ""; c.explain.done = true; paint(); } })
    )
  );
}

function whyBox(c, why) {
  const mine = c.explain.done && c.explain.text.trim();
  return h(
    "div",
    { class: ["why", mine && "has-compare"] },
    mine && h("div", { class: "why-col" }, h("div", { class: "compare-label", text: "Your explanation" }), h("p", { text: c.explain.text.trim() })),
    h("div", { class: "why-col" }, h("div", { class: "compare-label", text: "Why" }), h("p", { text: why }))
  );
}

function suggestedGrade(c) {
  if (c.outcome.auto && c.outcome.verdict === "wrong") {
    return 1;
  }
  return suggestGrade({ outcome: c.outcome.verdict, confidence: c.confidence, hints: c.hintsUsed, latencyMs: c.latencyMs });
}

function gradeRow(c) {
  const o = c.outcome;
  const previews = previewIntervals(c.memory, Date.now(), settings().retention);
  const willRequeue = (c.entry.requeues || 0) < MAX_REQUEUES;

  if (o.auto && o.verdict === "wrong") {
    return h(
      "div",
      { class: "grade-row is-single" },
      h("span", { class: "grade-note", text: willRequeue ? "It'll come back in a few cards — that retry is where it starts to stick." : "It'll be back tomorrow." }),
      button("Continue", { variant: "primary", kbd: "Enter", iconAfter: "arrowRight", onClick: () => grade(c, 1), attrs: { "data-grade": "1" } })
    );
  }

  const suggested = suggestedGrade(c);
  const capped = c.hintsUsed > 0;
  return h(
    "div",
    { class: "grade-row" },
    h("span", { class: "grade-note", text: suggested ? "How did that feel? The suggestion is based on your answer, confidence, and hints." : "How well did you recall it?" }),
    h(
      "div",
      { class: "grade-buttons" },
      GRADES.map((gradeInfo) => {
        const disabled = capped && gradeInfo.value > 2;
        const interval = gradeInfo.value === 1 ? (willRequeue ? "in a few cards" : formatInterval(previews[1])) : formatInterval(previews[gradeInfo.value]);
        return h(
          "button",
          {
            type: "button",
            class: ["grade", `grade-${gradeInfo.key}`, suggested === gradeInfo.value && "is-suggested"],
            disabled,
            title: capped && gradeInfo.value > 2 ? "Hints cap this card at Hard" : gradeInfo.hint,
            "data-grade": String(gradeInfo.value),
            onClick: () => grade(c, gradeInfo.value)
          },
          h("span", { class: "grade-top" }, h("kbd", { text: String(gradeInfo.value) }), h("strong", { text: gradeInfo.label })),
          h("span", { class: "grade-interval", text: interval }),
          suggested === gradeInfo.value && h("span", { class: "grade-tag", text: "Suggested" })
        );
      })
    )
  );
}

// Placement and capstone grade objectively and move on.
function nextRow(c) {
  return h(
    "div",
    { class: "grade-row is-single" },
    h("span", { class: "grade-note", text: active.session.kind === "placement" ? "Placement answers set where each skill starts." : "On to the next one." }),
    button("Next", { variant: "primary", kbd: "Enter", iconAfter: "arrowRight", onClick: () => grade(c, autoGrade(c)), attrs: { "data-grade": "auto" } })
  );
}

function autoGrade(c) {
  const correct = c.outcome.verdict === "correct";
  if (!correct) {
    return 1;
  }
  return active.session.kind === "placement" && c.confidence >= 3 ? 4 : 3;
}

function grade(c, value) {
  if (c.graded) {
    return;
  }
  c.graded = true;
  const correct = c.outcome.auto ? c.outcome.verdict === "correct" : value >= 2;
  const question = c.item.question;
  const result = recordAttempt({
    itemKey: c.item.key,
    grade: value,
    correct,
    confidence: c.confidence,
    hints: c.hintsUsed,
    latencyMs: c.latencyMs,
    response: responseText(c),
    chosen: isChoice(question) ? c.selected : null,
    mode: c.entry.mode,
    explain: c.explain.text,
    revealed: c.revealed,
    retry: (c.entry.requeues || 0) > 0,
    sessionId: active.session.id
  });

  active.results[active.index] = {
    itemKey: c.item.key,
    grade: value,
    correct,
    confidence: c.confidence,
    hints: c.hintsUsed,
    first: (c.entry.requeues || 0) === 0,
    hyper: !correct && c.confidence >= 3 && !c.revealed
  };
  if (result) {
    active.events.push(...result.events);
    active.badges.push(...result.newBadges);
    if (result.masteredNow) {
      active.mastered.push(c.item.skillKey);
    }
    flashReward(result);
  }

  const strict = active.session.kind === "placement" || active.session.kind === "capstone";
  if (value === 1 && !strict && (c.entry.requeues || 0) < MAX_REQUEUES) {
    const queue = active.session.queue;
    const offset = 3 + Math.floor(Math.random() * 3);
    const position = Math.min(queue.length, active.index + 1 + offset);
    queue.splice(position, 0, { itemKey: c.item.key, mode: "relearn", requeues: (c.entry.requeues || 0) + 1 });
  }

  advance();
}

function flashReward(result) {
  const xp = result.xp;
  if (!ui || xp <= 0) {
    return;
  }
  const reason = result.events.find((event) => event.kind === "xp")?.reason || "";
  document.querySelector(".reward-flash")?.remove();
  const flash = h("div", { class: "reward-flash", role: "status" }, h("strong", { text: `+${xp}` }), h("span", { text: reason }));
  document.body.append(flash);
  setTimeout(() => flash.remove(), 2400);
}

function advance() {
  active.index += 1;
  active.card = null;
  if (active.index >= active.session.queue.length || (active.timerEnd && Date.now() >= active.timerEnd)) {
    finish();
    return;
  }
  paint();
}

function finish() {
  if (active.done) {
    return;
  }
  active.done = true;
  active.card = null;
  if (active.session.kind === "capstone" && active.session.libKey) {
    const firsts = active.results.filter(Boolean);
    active.capstone = { right: firsts.filter((result) => result.correct).length, total: active.session.queue.length };
    active.events.push(...recordCapstone(active.session.libKey, active.capstone.right, active.capstone.total));
  }
  paint();
  ui?.stage.parentElement?.scrollTo?.(0, 0);
  document.querySelector("#main")?.scrollTo(0, 0);
}

function exit() {
  active = null;
  navigate("today");
}

function tick() {
  const timer = document.querySelector("#focusTimer");
  if (!active || !active.timerEnd || active.done) {
    return;
  }
  const left = active.timerEnd - Date.now();
  if (timer) {
    timer.textContent = formatClock(left);
    timer.classList.toggle("is-low", left < 30000);
  }
  if (left <= 0) {
    toast("Time's up.", { tone: "info" });
    finish();
  }
}

// ── summary: feed up, feed back, feed forward ───────────────────────────────

function summaryView() {
  const { session, results, events } = active;
  const graded = results.filter(Boolean);
  const firsts = graded.filter((result) => result.first);
  const firstRight = firsts.filter((result) => result.correct).length;
  const fixedOnRetry = graded.filter((result) => !result.first && result.correct).length;
  const hyper = new Set(graded.filter((result) => result.hyper).map((result) => result.itemKey)).size;
  const xp = events.reduce((sum, event) => sum + (event.kind === "xp" ? event.amount : 0), 0);
  const stats = todayStats();

  const title = session.kind === "capstone" && active.capstone
    ? `Capstone · ${active.capstone.right}/${active.capstone.total}`
    : session.kind === "placement"
      ? "Placement complete"
      : graded.length === 0
        ? "Session ended"
        : "Session complete";

  const praise = praiseLine({ firsts: firsts.length, firstRight, fixedOnRetry, hyper, kind: session.kind });

  const skillKeys = Object.keys(session.masteryStart);
  const skillRows = skillKeys.map((skillKey) => {
    const skill = getSkill(skillKey);
    if (!skill) {
      return null;
    }
    const before = session.masteryStart[skillKey];
    const after = masteryOf(skillKey);
    const delta = after - before;
    return h(
      "li",
      { class: "delta-row" },
      h("a", { class: "delta-title", href: `#/skill/${encodeURIComponent(skillKey)}`, text: skill.title }),
      meter(after, { tone: after >= 0.8 ? "good" : "accent", label: `${skill.title} mastery` }),
      h("span", { class: "num", text: `${pct(before)} → ${pct(after)}` }),
      h("span", { class: ["delta", delta > 0.004 ? "is-up" : delta < -0.004 ? "is-down" : ""], text: delta > 0.004 ? `+${Math.round(delta * 100)}` : delta < -0.004 ? `${Math.round(delta * 100)}` : "±0" }),
      active.mastered.includes(skillKey) ? chip("Mastered", { tone: "good", iconName: "check" }) : null
    );
  });

  const attempts = graded.map((result) => {
    const item = getItem(result.itemKey);
    return h(
      "li",
      { class: ["attempt-row", result.correct ? "is-right" : "is-wrong"] },
      h("span", { class: "attempt-mark" }, icon(result.correct ? "check" : "x", { size: 15 })),
      h("span", { class: "attempt-prompt", text: item?.question.prompt || result.itemKey }),
      !result.first && chip("retry", { tone: "warn" }),
      result.hyper && chip("confident miss", { tone: "bad" }),
      result.hints > 0 && chip(`${result.hints} hint${result.hints > 1 ? "s" : ""}`)
    );
  });

  // Delayed judgment of learning: asked minutes after the item, not right away.
  const jolCandidates = graded.filter((result) => result.correct && result.first).slice(-3);
  const jolCard = jolCandidates.length > 0 && session.kind !== "placement"
    ? card(
        { title: "Will you still know these in a week?", sub: "Asked now, a few minutes later, because delayed predictions are more accurate. We'll check them against reality." },
        h(
          "ul",
          { class: "jol-list" },
          jolCandidates.map((result) => {
            const item = getItem(result.itemKey);
            const current = active.jol[result.itemKey];
            return h(
              "li",
              { class: "jol-row" },
              h("span", { class: "jol-prompt", text: item?.question.prompt || "" }),
              h(
                "div",
                { class: "jol-choices" },
                [["yes", "Yes"], ["maybe", "Not sure"], ["no", "No"]].map(([value, label]) =>
                  h("button", {
                    type: "button",
                    class: ["jol-choice", current === value && "is-selected"],
                    text: label,
                    onClick: () => {
                      active.jol[result.itemKey] = value;
                      recordJol(result.itemKey, value);
                      paint();
                    }
                  })
                )
              )
            );
          })
        )
      )
    : null;

  const xpReasons = events.filter((event) => event.kind === "xp" || event.kind === "streak" || event.kind === "freeze");
  const newMisses = graded.filter((result) => !result.correct).length;

  const next = stats.goalMet
    ? { title: "Done for today", body: "You've met your goal. Stopping now is part of the method — the gap before the next review is what builds memory." }
    : { title: `${plural(Math.max(0, stats.goal - stats.done), "card")} to today's goal`, body: "Another short round, or come back later — both work." };

  return h(
    "div",
    { class: "summary" },
    h("p", { class: "eyebrow", text: session.title }),
    h("h1", { class: "summary-title", text: title }),
    praise && h("p", { class: "summary-lede", text: praise }),
    h(
      "div",
      { class: "stat-row" },
      statTile({ label: "First-try recall", value: firsts.length ? `${firstRight}/${firsts.length}` : "—", sub: firsts.length ? pct(firstRight / firsts.length) : null }),
      statTile({ label: "Fixed on retry", value: String(fixedOnRetry), sub: "misses re-asked later" }),
      statTile({ label: "Confident misses", value: String(hyper), sub: hyper ? "in your notebook" : "none — nice calibration", tone: hyper ? "warn" : null }),
      statTile({ label: "Points", value: `+${xp}`, sub: "for effortful recall" })
    ),
    active.badges.length > 0 &&
      h(
        "div",
        { class: "badge-earned" },
        active.badges.map((badge) => h("div", { class: "badge-pill" }, icon("star", { size: 18 }), h("div", null, h("strong", { text: badge.title }), h("span", { text: badge.description }))))
      ),
    h(
      "div",
      { class: "summary-grid" },
      h(
        "div",
        { class: "summary-col" },
        skillRows.filter(Boolean).length > 0 && card({ title: "Where you're going", sub: "Mastery change in the skills you touched." }, h("ul", { class: "delta-list" }, skillRows)),
        attempts.length > 0 && card({ title: "How it went" }, h("ul", { class: "attempt-list" }, attempts))
      ),
      h(
        "div",
        { class: "summary-col" },
        card(
          { title: "What's next", className: "next-card" },
          h("p", { class: "next-title", text: next.title }),
          h("p", { class: "muted", text: next.body }),
          h(
            "div",
            { class: "next-actions" },
            button("Back to Today", { variant: stats.goalMet ? "primary" : "default", onClick: exit }),
            !stats.goalMet && button("Another round", { variant: "primary", iconName: "play", onClick: () => startSession(buildSession("daily")) }),
            newMisses > 0 && button("Review mistakes", { variant: "ghost", onClick: () => { active = null; navigate("mistakes"); } })
          )
        ),
        jolCard,
        xpReasons.length > 0 &&
          card(
            { title: "Why you earned points" },
            h(
              "ul",
              { class: "reward-list" },
              xpReasons.slice(-8).reverse().map((event) =>
                h("li", { class: "reward-row" }, h("span", { class: ["reward-amount", event.kind !== "xp" && "is-info"], text: event.kind === "xp" ? `+${event.amount}` : "✓" }), h("span", { class: "reward-reason", text: event.reason }))
              )
            )
          )
      )
    )
  );
}

// Praise the process, not the person.
function praiseLine({ firsts, firstRight, fixedOnRetry, hyper, kind }) {
  if (firsts === 0) {
    return "";
  }
  if (kind === "placement") {
    return "Skills you answered confidently and correctly now start further along, without the worked-example scaffolding.";
  }
  const share = firstRight / firsts;
  if (fixedOnRetry > 0 && hyper > 0) {
    return `You corrected ${plural(hyper, "confident mistake")} and fixed ${fixedOnRetry} on the retry. That struggle is the learning — it's supposed to feel hard.`;
  }
  if (fixedOnRetry > 0) {
    return `${plural(fixedOnRetry, "miss", "misses")} came back right on the retry. Getting it wrong first, then retrieving it, is how it sticks.`;
  }
  if (share >= 0.95) {
    return "Everything recalled on the first try. Your schedule will space these further apart, so the next ones get harder.";
  }
  if (share >= 0.7) {
    return "Right in the challenge zone — hard enough to strengthen memory, easy enough to keep going.";
  }
  return "A tough round. Effortful retrieval like this builds more memory than an easy one, even when it doesn't feel like it.";
}

// ── keyboard ────────────────────────────────────────────────────────────────

function handleKey(event) {
  if (!active || event.defaultPrevented || event.altKey || event.metaKey || (event.ctrlKey && event.key !== "Enter")) {
    return;
  }
  if (event.key === "Escape") {
    if (isTyping()) {
      document.activeElement.blur();
      pulseConfidence();
      event.preventDefault();
    }
    return;
  }
  if (event.ctrlKey && event.key === "Enter" && isTyping() && active.card?.phase === "attempt") {
    document.activeElement.blur();
    pulseConfidence();
    event.preventDefault();
    return;
  }
  if (isTyping() || active.done) {
    return;
  }
  const c = active.card;
  if (!c) {
    return;
  }
  const onButton = document.activeElement?.tagName === "BUTTON";

  if (c.phase === "recall" && (event.key === "Enter" || event.key === " ") && !onButton) {
    event.preventDefault();
    showOptions(c);
    return;
  }

  if (c.phase === "attempt") {
    if (/^[1-4]$/.test(event.key) && answerReady(c)) {
      event.preventDefault();
      commit(c, Number(event.key));
      return;
    }
    if (event.key.toLowerCase() === "h" && c.ladder[c.hintsUsed]) {
      event.preventDefault();
      useHint(c);
      return;
    }
    const letter = LETTERS.indexOf(event.key.toUpperCase());
    if (isChoice(c.item.question) && letter >= 0 && letter < c.optionOrder.length) {
      const option = c.optionOrder[letter];
      if (!eliminatedOptions(c).has(option)) {
        event.preventDefault();
        toggleOption(c, option);
      }
    }
    return;
  }

  if (c.phase === "feedback") {
    if (/^[1-4]$/.test(event.key)) {
      const target = ui.stage.querySelector(`[data-grade="${event.key}"]`);
      if (target && !target.disabled) {
        event.preventDefault();
        target.click();
      }
      return;
    }
    if (event.key === "Enter" && !onButton) {
      const target = ui.stage.querySelector(".grade.is-suggested:not(:disabled)") ||
        ui.stage.querySelector('.grade-row.is-single button') ||
        ui.stage.querySelector('[data-grade="3"]:not(:disabled)') ||
        ui.stage.querySelector('[data-grade="2"]:not(:disabled)');
      if (target) {
        event.preventDefault();
        target.click();
      }
    }
  }
}

function keyHints(c) {
  const hint = (keys, label) => h("span", { class: "key-hint" }, h("kbd", { text: keys }), label);
  if (c.phase === "recall") {
    return [hint("Enter", "show options")];
  }
  if (c.phase === "attempt") {
    return [
      isChoice(c.item.question) && hint("A–" + LETTERS[Math.min(c.optionOrder.length, LETTERS.length) - 1], "choose"),
      hint("1–4", "confidence & submit"),
      c.ladder.length > 0 && hint("H", "hint"),
      !isChoice(c.item.question) && hint("Esc", "leave text box")
    ].filter(Boolean);
  }
  return [hint("1–4", "grade"), hint("Enter", "suggested")];
}

// Focuses the answer field once per phase — repaints after a hint or an
// option click must not steal focus (that would turn shortcut keys into text).
function focusFirstField(c) {
  if (c.focusedPhase === c.phase) {
    return;
  }
  c.focusedPhase = c.phase;
  if (c.phase === "feedback") {
    const explain = ui.stage.querySelector(".explain textarea");
    if (explain) {
      explain.focus();
    }
    return;
  }
  const field = ui.stage.querySelector(".recall-box, .cloze-input, .answer-input, .answer-text");
  if (field && !(c.phase === "attempt" && isChoice(c.item.question))) {
    field.focus();
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

function responseText(c) {
  const question = c.item.question;
  if (c.cloze) {
    return c.cloze.filter((part) => part.blank).map((part, index) => c.clozeValues[index] || "").join(" | ");
  }
  if (isChoice(question)) {
    return [c.recallText.trim() && `Recalled: ${c.recallText.trim()}`, c.selected.length ? `Chose: ${c.selected.join("; ")}` : ""].filter(Boolean).join(" · ");
  }
  if (question.type === "code_run" || question.answerMode === "code") {
    return c.code;
  }
  if (question.answerMode === "both") {
    return [c.text, c.code].filter((value) => value && value.trim()).join("\n\n");
  }
  return c.text;
}

function formatClock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function shuffle(list) {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

// Exercise kit, part 3: roleplay. A live conversation with the practice
// partner, a model playing the person in step.persona, then a coach call that
// judges each of step.goals with a quote from the learner's lines. Same
// interface as basic.js. Nothing is graded locally: no word list can tell a
// warm reply from a cold one.

import { h } from "../../lib/dom.js";
import { rich, plain } from "../../lib/markup.js";
import { icon } from "../icons.js";
import { button } from "../components.js";
import { countdown } from "./inputs.js";
import { partnerStatus, partnerReply, partnerCoach } from "../../io/partner.js";

export const DEFAULT_TURNS = 6;

export function roleplay(step, ctx) {
  const name = step.name || "Partner";
  const turns = step.turns || DEFAULT_TURNS;
  const state = {
    lines: [{ from: "partner", text: step.opener }],
    hasKey: null,
    statusError: null,
    waiting: false,
    error: null,
    coaching: false,
    coachError: null,
    verdict: null,
    overrides: new Map(),
    locked: false,
    timer: null
  };
  const yours = () => state.lines.filter((line) => line.from === "you").length;
  const transcriptText = () => state.lines.map((line) => `${line.from === "partner" ? name : "You"}: ${line.silent ? "(said nothing)" : line.text}`).join("\n");

  const log = h("div", { class: "chat-log", role: "log", "aria-live": "polite" });
  const notice = h("div", { class: "chat-notice" });
  const timerSlot = h("div", { class: "chat-timer" });
  const input = h("textarea", {
    class: "input chat-input",
    rows: 2,
    placeholder: step.placeholder || "Type what you'd say out loud. Enter sends.",
    "aria-label": `Your reply to ${name}`,
    onInput: () => paintCompose(),
    onKeydown: (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.isComposing) {
        event.preventDefault();
        say();
      }
    }
  });
  const send = button("Send", { variant: "primary", onClick: () => say() });
  const turnLabel = h("span");
  const compose = h("div", { class: "chat-compose" }, input, send);
  const foot = h("div", { class: "chat-foot" }, turnLabel, h("span", { text: "Check ends the scene and brings in the coach." }));
  const el = h(
    "div",
    { class: "roleplay" },
    h("div", { class: "roleplay-goals" }, h("div", { class: "explain-label", text: "Goals" }), h("ul", null, step.goals.map((goal) => h("li", { text: goal })))),
    log,
    notice,
    timerSlot,
    compose,
    foot
  );

  const paintLog = () => {
    log.replaceChildren(
      ...state.lines.map((line) =>
        h(
          "div",
          { class: ["chat-line", `from-${line.from}`, line.silent && "is-silent"] },
          h("span", { class: "chat-who", text: line.from === "partner" ? name : "You" }),
          h("div", { class: "chat-bubble", text: line.silent ? "… (you froze)" : line.text })
        )
      ),
      ...(state.waiting ? [h("div", { class: "chat-line from-partner" }, h("span", { class: "chat-who", text: name }), h("div", { class: "chat-bubble chat-typing", "aria-label": `${name} is typing` }, h("span"), h("span"), h("span")))] : [])
    );
  };

  const paintNotice = () => {
    notice.replaceChildren();
    if (state.hasKey === false && !state.locked) {
      notice.append(h("p", { class: "muted", text: state.statusError?.message || "The practice partner needs an Anthropic API key: add one in Settings → Practice partner. Until then, Check skips this scene." }));
    } else if (state.coaching) {
      notice.append(h("p", { class: "muted", text: "The coach is reading the conversation…" }));
    } else if (state.error && !state.locked) {
      notice.append(h("div", { class: "chat-error" }, icon("alert", { size: 16 }), h("span", { text: state.error.message }), button("Try again", { size: "sm", onClick: () => answer() })));
    }
  };

  const paintCompose = () => {
    const over = state.locked || state.hasKey === false || yours() >= turns;
    compose.hidden = over;
    foot.hidden = over;
    input.disabled = over;
    send.disabled = over || state.hasKey !== true || state.waiting || Boolean(state.error) || !input.value.trim();
    turnLabel.textContent = `Reply ${Math.min(yours() + 1, turns)} of ${turns}`;
  };

  const paint = () => {
    paintLog();
    paintNotice();
    paintCompose();
    if (!foot.hidden && foot.isConnected) {
      foot.scrollIntoView({ block: "nearest" });
    }
  };

  // Each reply gets the clock; the first gets double, for reading the scene.
  const startClock = () => {
    state.timer?.stop();
    timerSlot.replaceChildren();
    if (step.seconds > 0 && state.hasKey && !state.locked) {
      state.timer = countdown(step.seconds * (yours() === 0 ? 2 : 1), () => say({ silent: true }));
      timerSlot.append(state.timer.el);
    }
  };

  const answer = async () => {
    state.waiting = true;
    state.error = null;
    paint();
    ctx.onChange();
    const result = await partnerReply({ persona: step.persona, name: step.name, transcript: state.lines });
    state.waiting = false;
    if (state.locked) {
      return;
    }
    if (result.error) {
      state.error = result.error;
    } else {
      state.lines.push({ from: "partner", text: result.text });
    }
    paint();
    ctx.onChange();
    if (result.error) {
      return;
    }
    if (yours() >= turns) {
      ctx.submit();
      return;
    }
    startClock();
    input.focus();
  };

  // A clock that runs out sends what was typed, or a silence: freezing is the
  // miss being trained, and the partner reacts to it.
  const say = ({ silent = false } = {}) => {
    const text = input.value.trim();
    if (state.locked || state.waiting || state.error || state.hasKey !== true || yours() >= turns || (!silent && !text)) {
      return;
    }
    state.timer?.stop();
    timerSlot.replaceChildren();
    state.lines.push(text ? { from: "you", text } : { from: "you", text: "", silent: true });
    input.value = "";
    answer();
  };

  const toResult = () => {
    const goals = state.verdict.goals.map((goal, index) => (state.overrides.has(index) ? { ...goal, met: state.overrides.get(index), overridden: true } : goal));
    const count = goals.filter((goal) => goal.met).length;
    const needed = step.pass ?? Math.max(1, Math.ceil(goals.length * 0.6));
    const passed = count >= needed;
    return { correct: passed, score: count / goals.length, verdict: passed ? "correct" : count > 0 ? "partial" : "wrong", response: transcriptText(), detail: { goals, count, needed } };
  };

  partnerStatus().then((result) => {
    state.hasKey = Boolean(result.hasKey);
    state.statusError = result.error || null;
    paint();
    ctx.onChange();
    startClock();
  });
  paint();

  return {
    el,
    focus: () => input.focus(),
    ready: () => state.hasKey === false || (state.hasKey === true && !state.waiting && yours() >= 1),
    async check() {
      state.locked = true;
      state.timer?.stop();
      timerSlot.replaceChildren();
      if (state.hasKey === false) {
        paint();
        return { correct: null, score: null, verdict: "self", response: "", detail: { skipped: true } };
      }
      if (yours() === 0) {
        paint();
        return { correct: false, score: 0, verdict: "wrong", response: "" };
      }
      state.coaching = true;
      paint();
      const result = await partnerCoach({ scene: plain(step.prompt || ""), persona: step.persona, name: step.name, goals: step.goals, transcript: state.lines });
      state.coaching = false;
      if (result.error) {
        state.coachError = result.error;
        paint();
        return { correct: null, score: null, verdict: "self", response: transcriptText() };
      }
      state.verdict = result;
      paint();
      return toResult();
    },
    show() {
      state.locked = true;
      paint();
    },
    explain(result) {
      const block = h("div", { class: "explain-block" });
      if (result.detail?.skipped) {
        block.append(h("p", { class: "muted", text: "Skipped: there's no API key yet. Grade yourself on how you'd have handled it." }));
      }
      if (state.coachError) {
        block.append(h("p", { class: "chat-error", text: `The coach couldn't grade this: ${state.coachError.message} Grade yourself instead.` }));
      }
      if (state.verdict && result.detail?.goals) {
        const { goals, count, needed } = result.detail;
        block.append(
          h("div", { class: "explain-label", text: `Coach · ${count} of ${goals.length} goals (need ${needed})` }),
          h(
            "ul",
            { class: "concept-checks" },
            goals.map((goal, index) =>
              h(
                "li",
                { class: goal.met ? "is-hit" : "is-miss" },
                h("span", { class: "check-mark" }, icon(goal.met ? "check" : "x", { size: 14 })),
                h(
                  "span",
                  { class: "check-text" },
                  step.goals[index],
                  goal.overridden && h("em", { class: "muted", text: " (your call)" }),
                  goal.quote && h("q", { class: "coach-quote", text: goal.quote }),
                  h("span", { class: "rule-why coach-why", text: goal.why })
                ),
                h(
                  "button",
                  {
                    type: "button",
                    class: "link-btn",
                    title: goal.met ? "Count this goal as missed" : "The coach misread this",
                    onClick: () => {
                      state.overrides.set(index, !goal.met);
                      ctx.regrade?.(toResult());
                    }
                  },
                  goal.met ? "Not really" : "I did this"
                )
              )
            )
          ),
          h(
            "div",
            { class: "compare-pair" },
            h("div", null, h("div", { class: "explain-label", text: "Your weakest line" }), h("p", { text: state.verdict.weakest })),
            h("div", null, h("div", { class: "explain-label", text: "Try instead" }), h("p", { text: state.verdict.better }))
          ),
          h("div", { class: "explain-label", text: "Next time" }),
          h("p", { class: "coach-next", text: state.verdict.next })
        );
      }
      if (step.model) {
        block.append(h("div", { class: "explain-label", text: "Lines that work" }), h("div", { class: "model-answer rich" }, rich(step.model)));
      }
      return block.childNodes.length ? block : null;
    }
  };
}

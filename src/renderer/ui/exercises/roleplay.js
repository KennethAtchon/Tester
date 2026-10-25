// Exercise kit, part 3: roleplay. A live conversation with the practice
// partner, a model playing the person in step.persona, then a coach call that
// judges each of step.goals with a quote from the learner's lines. Same
// interface as basic.js. Nothing is graded locally: no word list can tell a
// warm reply from a cold one.
//
// Talk mode puts a 3D face on the partner: she says her lines out loud and the
// learner answers out loud. The transcript goes through say() like a typed
// line, so the partner, the clock and the coach behave the same in both modes.

import { h } from "../../lib/dom.js";
import { rich, plain } from "../../lib/markup.js";
import { icon } from "../icons.js";
import { button } from "../components.js";
import { countdown } from "./inputs.js";
import { createFace } from "../face.js";
import { settings, persist } from "../../state/progress.js";
import { partnerStatus, partnerReply, partnerCoach } from "../../io/partner.js";
import { voiceWarm, voiceTranscribe, voiceMicAccess, onVoiceProgress, listen } from "../../io/voice.js";

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
  const talkSlot = h("div", { class: "talk-switch" });
  const faceView = h("div", { class: "face-view" });
  const faceStatus = h("div", { class: "face-status", role: "status", "aria-live": "polite" });
  const faceStage = h("div", { class: "face-stage", hidden: true }, faceView, faceStatus);
  const el = h(
    "div",
    { class: "roleplay" },
    h("div", { class: "roleplay-goals" }, h("div", { class: "roleplay-goals-head" }, h("div", { class: "explain-label", text: "Goals" }), talkSlot), h("ul", null, step.goals.map((goal) => h("li", { text: goal })))),
    faceStage,
    log,
    notice,
    timerSlot,
    compose,
    foot
  );

  // Talk mode. `run` goes up whenever the mode changes or the scene ends, so a
  // step still in flight (voicing, listening, transcribing) sees it's stale.
  const talk = { on: false, face: null, take: null, phase: "idle", error: null, progress: null, level: 0, run: 0, watch: null, seen: false };

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
    compose.hidden = over || talk.on;
    foot.hidden = over;
    input.disabled = over;
    send.disabled = over || state.hasKey !== true || state.waiting || Boolean(state.error) || !input.value.trim();
    turnLabel.textContent = `Reply ${Math.min(yours() + 1, turns)} of ${turns}`;
  };

  const paintTalk = () => {
    talkSlot.replaceChildren();
    if (state.hasKey === true && !state.locked) {
      talkSlot.append(
        talk.on
          ? button("Type instead", { size: "sm", iconName: "pencil", onClick: () => setTalk(false) })
          : button("Talk face to face", { size: "sm", iconName: "mic", onClick: () => setTalk(true), title: `See ${name} and talk out loud. Speech is made and transcribed on this computer.` })
      );
    }
    faceStage.hidden = !talk.on;
    faceStatus.replaceChildren();
    if (!talk.on) {
      return;
    }
    if (talk.error) {
      faceStatus.append(h("div", { class: "chat-error" }, icon("alert", { size: 16 }), h("span", { text: talk.error.message }), button("Try again", { size: "sm", onClick: () => retryTalk() })));
      return;
    }
    const percent = talk.progress?.total ? ` ${Math.floor((talk.progress.loaded / talk.progress.total) * 100)}%` : "";
    const lines = {
      loading: `Getting ${name}'s face and voice ready…${percent}`,
      speaking: `${name} is talking…`,
      listening: "Your turn: say it out loud.",
      hearing: "Listening…",
      transcribing: "Got it…",
      idle: ""
    };
    const text = state.waiting ? `${name} is thinking…` : lines[talk.phase];
    faceStatus.append(h("span", { class: "face-status-text", text }));
    if (talk.phase === "loading" && !talk.face) {
      faceStatus.append(h("span", { class: "muted face-status-note", text: "The first time sets up her voice: about 1 GB, a few minutes." }));
    }
    if (talk.phase === "listening" || talk.phase === "hearing") {
      faceStatus.append(
        h("span", { class: "voice-level", "aria-hidden": "true" }, h("span", { class: "voice-level-fill", style: { width: `${Math.min(100, Math.round(talk.level * 800))}%` } })),
        button("Done", { size: "sm", variant: "primary", onClick: () => talk.take?.stop(), title: "Finish your reply now" })
      );
    }
  };

  const paint = () => {
    paintLog();
    paintNotice();
    paintCompose();
    paintTalk();
    if (!foot.hidden && foot.isConnected) {
      foot.scrollIntoView({ block: "nearest" });
    }
  };

  // Each reply gets the clock; the first gets double, for reading the scene.
  // In Talk mode it runs while the learner may speak, and running out ends
  // the take: whatever was said is sent, or a silence.
  const startClock = () => {
    state.timer?.stop();
    timerSlot.replaceChildren();
    if (step.seconds > 0 && state.hasKey && !state.locked) {
      state.timer = countdown(step.seconds * (yours() === 0 ? 2 : 1), () => (talk.on ? talk.take?.stop() : say({ silent: true })));
      timerSlot.append(state.timer.el);
    }
  };

  const stopClock = () => {
    state.timer?.stop();
    timerSlot.replaceChildren();
  };

  const lastPartnerLine = () => [...state.lines].reverse().find((line) => line.from === "partner")?.text || "";

  const failTalk = (error) => {
    talk.error = error;
    talk.phase = "idle";
    paint();
  };

  // She says `text`, then the learner's turn starts.
  const speakThenHear = async (text) => {
    const run = talk.run;
    talk.phase = "speaking";
    talk.face.listening(null);
    paint();
    const spoken = await talk.face.say(text);
    if (run !== talk.run) {
      return;
    }
    if (spoken.error) {
      failTalk(spoken.error);
      return;
    }
    await hear();
  };

  const hear = async () => {
    const run = talk.run;
    talk.phase = "listening";
    talk.level = 0;
    paint();
    let take;
    try {
      take = await listen({
        onLevel: (level) => {
          talk.level = level;
          const fill = faceStatus.querySelector(".voice-level-fill");
          if (fill) {
            fill.style.width = `${Math.min(100, Math.round(level * 800))}%`;
          }
        },
        onSpeech: () => {
          talk.phase = "hearing";
          paintTalk();
        }
      });
    } catch (error) {
      failTalk({ code: "mic", message: `The microphone didn't start: ${error.message}` });
      return;
    }
    if (run !== talk.run) {
      take.stop();
      return;
    }
    talk.take = take;
    talk.face.listening(take.analyser);
    startClock();
    const { pcm, spoke } = await take.done;
    talk.take = null;
    if (run !== talk.run) {
      return;
    }
    stopClock();
    talk.face.listening(null);
    if (!spoke) {
      talk.phase = "idle";
      say({ silent: true });
      return;
    }
    talk.phase = "transcribing";
    paint();
    const heard = await voiceTranscribe(pcm);
    if (run !== talk.run) {
      return;
    }
    if (heard.error) {
      failTalk(heard.error);
      return;
    }
    talk.phase = "idle";
    input.value = heard.text;
    say({ silent: !heard.text });
  };

  // Ends whatever Talk mode is doing; the face stays on screen unless `drop`.
  const haltTalk = ({ drop = false } = {}) => {
    talk.run += 1;
    talk.take?.stop();
    talk.take = null;
    talk.face?.interrupt();
    talk.face?.listening(null);
    talk.phase = "idle";
    if (drop) {
      talk.face?.destroy();
      talk.face = null;
      clearInterval(talk.watch);
      talk.watch = null;
    }
  };

  // The player has no unmount hook, so Talk mode watches for its card leaving
  // the page (next step, lesson closed) to let go of the microphone and the face.
  const watchForExit = () => {
    talk.watch ||= setInterval(() => {
      if (el.isConnected) {
        talk.seen = true;
      } else if (talk.seen) {
        haltTalk({ drop: true });
      }
    }, 1000);
  };

  const setTalk = async (on) => {
    haltTalk({ drop: !on });
    talk.on = on;
    talk.error = null;
    settings().talk = on;
    persist();
    if (!on) {
      paint();
      if (!state.waiting && !state.error && !state.locked && yours() < turns) {
        startClock();
        input.focus();
      }
      return;
    }
    stopClock();
    watchForExit();
    const run = talk.run;
    talk.phase = "loading";
    paint();
    if (!talk.face) {
      const mic = await voiceMicAccess();
      if (run !== talk.run) {
        return;
      }
      if (mic.error || !mic.granted) {
        failTalk(mic.error || { code: "mic", message: "Recall isn't allowed to use the microphone. Turn it on in System Settings → Privacy & Security → Microphone, then try again." });
        return;
      }
      // Her face shows straight away; her voice (set up the first time) follows.
      const face = await createFace(faceView, { name });
      if (run !== talk.run || face.error) {
        face.destroy?.();
        if (face.error && run === talk.run) {
          failTalk(face.error);
        }
        return;
      }
      const stopProgress = onVoiceProgress((progress) => {
        talk.progress = progress;
        paintTalk();
      });
      const ready = await voiceWarm({ voice: face.voice });
      stopProgress();
      talk.progress = null;
      if (run !== talk.run || ready.error) {
        face.destroy();
        if (ready.error && run === talk.run) {
          failTalk(ready.error);
        }
        return;
      }
      talk.face = face;
    }
    talk.phase = "idle";
    paint();
    if (!state.waiting && !state.error && !state.locked && yours() < turns) {
      speakThenHear(lastPartnerLine());
    }
  };

  // She repeats her last line and the learner gets the turn again.
  const retryTalk = () => {
    if (!talk.face) {
      setTalk(true);
      return;
    }
    talk.error = null;
    speakThenHear(lastPartnerLine());
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
    if (talk.on && talk.face) {
      if (yours() >= turns) {
        const run = talk.run;
        talk.phase = "speaking";
        paint();
        await talk.face.say(result.text);
        if (run === talk.run) {
          ctx.submit();
        }
        return;
      }
      speakThenHear(result.text);
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
    if (state.hasKey && settings().talk) {
      setTalk(true);
    } else {
      startClock();
    }
  });
  paint();

  return {
    el,
    focus: () => input.focus(),
    ready: () => state.hasKey === false || (state.hasKey === true && !state.waiting && yours() >= 1),
    async check() {
      state.locked = true;
      haltTalk();
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
      haltTalk();
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

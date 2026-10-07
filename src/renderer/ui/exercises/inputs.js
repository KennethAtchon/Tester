// Exercise kit, part 2: estimate, number, fill, text, api, code. Same interface as
// basic.js (el, ready, check, show, explain, autoHint).

import { h } from "../../lib/dom.js";
import { rich } from "../../lib/markup.js";
import { icon } from "../icons.js";
import { shuffled } from "./basic.js";
import { parseQuantity, gradeEstimate, formatQuantity, parseNumber, gradeNumber, formatNumber, parseFill, gradeFill, gradeApi, HTTP_METHODS } from "../../domain/grading.js";
import { gradeText, tokenize } from "../../domain/textGrader.js";
import { renderCodeControl } from "../runner.js";
import { mountCodeEditors } from "../codeEditor.js";

// ── estimate ────────────────────────────────────────────────────────────────

export function estimate(step, ctx) {
  const state = { value: "", locked: false };
  const preview = h("span", { class: "estimate-preview" });
  const input = h("input", {
    type: "text",
    class: "estimate-input",
    inputmode: "decimal",
    placeholder: "e.g. 1200, 1.2k, 3M",
    "aria-label": step.unit ? `Your estimate in ${step.unit}` : "Your estimate",
    autocomplete: "off",
    onInput: (event) => {
      state.value = event.target.value;
      const parsed = parseQuantity(state.value);
      preview.textContent = parsed != null && /[a-z]/i.test(state.value) ? `= ${parsed.toLocaleString()}` : "";
      ctx.onChange();
    },
    onKeydown: (event) => {
      if (event.key === "Enter" && parseQuantity(state.value) > 0) {
        event.preventDefault();
        ctx.submit();
      }
    }
  });

  const el = h(
    "div",
    { class: "estimate" },
    step.given?.length &&
      h("div", { class: "given" }, h("div", { class: "given-title", text: "Assume" }), h("dl", null, step.given.map(([label, value]) => [h("dt", null, rich(label, { inline: true })), h("dd", null, rich(String(value), { inline: true }))]))),
    h("label", { class: "estimate-field" }, input, h("span", { class: "estimate-unit", text: step.unit }), preview)
  );

  return {
    el,
    focus: () => input.focus(),
    ready: () => parseQuantity(state.value) > 0,
    check() {
      const value = parseQuantity(state.value);
      const result = gradeEstimate(step, value);
      return { correct: result.correct, score: result.score, verdict: result.verdict, response: `${state.value} ${step.unit}`, detail: { ...result, value } };
    },
    show(result) {
      state.locked = true;
      input.disabled = true;
      input.classList.add(result.correct ? "is-right" : result.verdict === "partial" ? "is-close" : "is-wrong");
    },
    explain(result) {
      const { value, ratio } = result.detail;
      const off = ratio == null ? "" : ratio < 1.05 ? "spot on" : `${ratio.toFixed(ratio < 10 ? 1 : 0)}× ${value > step.answer ? "high" : "low"}`;
      return h(
        "div",
        { class: "explain-block" },
        numberLine(value, step.answer, step.unit),
        h("p", { class: "estimate-verdict" }, "You said ", h("strong", { text: withUnit(formatQuantity(value), step.unit) }), " · answer ", h("strong", { text: `≈ ${withUnit(formatQuantity(step.answer), step.unit)}` }), off && ` · ${off}`),
        step.solution?.length && h("div", { class: "explain-label", text: "Worked solution" }),
        step.solution?.length && h("ol", { class: "solution" }, step.solution.map((line) => h("li", null, rich(line, { inline: true }))))
      );
    },
    autoHint() {
      return step.solution?.[0] ? `Start here: ${step.solution[0]}` : null;
    }
  };
}

function withUnit(text, unit) {
  return unit ? `${text} ${unit}` : text;
}

// ── number: an exact answer (math, physics, chemistry…) ────────────────────

export function number(step, ctx) {
  const state = { value: "" };
  const input = h("input", {
    type: "text",
    class: "estimate-input",
    inputmode: "decimal",
    placeholder: "Your answer",
    "aria-label": step.unit ? `Your answer in ${step.unit}` : "Your answer",
    autocomplete: "off",
    onInput: (event) => {
      state.value = event.target.value;
      ctx.onChange();
    },
    onKeydown: (event) => {
      if (event.key === "Enter" && parseNumber(state.value) != null) {
        event.preventDefault();
        ctx.submit();
      }
    }
  });

  const el = h(
    "div",
    { class: "estimate" },
    step.given?.length &&
      h("div", { class: "given" }, h("div", { class: "given-title", text: "Given" }), h("dl", null, step.given.map(([label, value]) => [h("dt", null, rich(label, { inline: true })), h("dd", null, rich(String(value), { inline: true }))]))),
    h("label", { class: "estimate-field" }, input, step.unit && h("span", { class: "estimate-unit", text: step.unit })),
    h("p", { class: "muted small", text: "Whole numbers, decimals, negatives, and fractions like 3/4 all work." })
  );

  return {
    el,
    focus: () => input.focus(),
    ready: () => parseNumber(state.value) != null,
    check() {
      const value = parseNumber(state.value);
      const result = gradeNumber(step, value);
      return { ...result, response: withUnit(state.value.trim(), step.unit), detail: { value } };
    },
    show(result) {
      input.disabled = true;
      input.classList.add(result.correct ? "is-right" : "is-wrong");
    },
    explain(result) {
      if (result.correct && !step.solution?.length) {
        return null;
      }
      return h(
        "div",
        { class: "explain-block" },
        !result.correct && h("p", { class: "estimate-verdict" }, "Answer: ", h("strong", { text: withUnit(formatNumber([].concat(step.answer)[0]), step.unit) })),
        step.solution?.length && h("div", { class: "explain-label", text: "Worked solution" }),
        step.solution?.length && h("ol", { class: "solution" }, step.solution.map((line) => h("li", null, rich(line, { inline: true }))))
      );
    },
    autoHint() {
      return step.solution?.[0] ? `Start here: ${step.solution[0]}` : null;
    }
  };
}

// Log-scale line from answer/100 to answer×100 with both markers.
function numberLine(value, answer, unit) {
  const position = (number) => {
    const ratio = Math.log10(Math.max(number, 1e-12) / answer);
    return Math.max(0, Math.min(100, 50 + ratio * 25));
  };
  return h(
    "div",
    { class: "numline", role: "img", "aria-label": `Your estimate versus the answer on a log scale` },
    h("div", { class: "numline-band" }),
    h("div", { class: "numline-track" }),
    h("span", { class: "numline-mark is-answer", style: { left: `${position(answer)}%` } }, h("span", { text: "answer" })),
    value > 0 && h("span", { class: "numline-mark is-guess", style: { left: `${position(value)}%` } }, h("span", { text: "you" })),
    h("div", { class: "numline-ticks" }, ["÷100", "÷10", "", "×10", "×100"].map((label) => h("span", { text: label })))
  );
}

// ── fill: blanks in a sentence ──────────────────────────────────────────────

export function fill(step, ctx) {
  const parts = parseFill(step.text);
  const blanks = parts.filter((part) => part.blank != null);
  const bank = step.bank ? shuffled(step.bank) : null;
  const state = { values: blanks.map(() => ""), active: 0, locked: false, result: null };
  const el = h("div", { class: "fill" });

  const used = () => new Set(state.values.filter(Boolean));

  const paint = () => {
    const sentence = h("p", { class: "fill-text" });
    for (const part of parts) {
      if (part.blank == null) {
        sentence.append(rich(part.text, { inline: true }));
        continue;
      }
      const index = part.blank;
      const mark = state.result ? (state.result.perBlank[index] ? "is-right" : "is-wrong") : null;
      if (bank) {
        sentence.append(
          h(
            "button",
            {
              type: "button",
              class: ["blank-slot", state.active === index && !state.locked && "is-active", state.values[index] && "is-filled", mark],
              disabled: state.locked,
              onClick: () => {
                state.values[index] = "";
                state.active = index;
                paint();
                ctx.onChange();
              }
            },
            state.values[index] || "      ",
            mark === "is-wrong" && h("span", { class: "blank-fix", text: part.answers[0] })
          )
        );
      } else {
        const input = h("input", {
          type: "text",
          class: ["blank-input", mark],
          size: Math.max(6, Math.min(22, part.answers[0].length + 2)),
          value: state.values[index],
          disabled: state.locked,
          "aria-label": `Blank ${index + 1}`,
          autocomplete: "off",
          spellcheck: "false",
          onInput: (event) => {
            state.values[index] = event.target.value;
            ctx.onChange();
          }
        });
        sentence.append(input);
        if (mark === "is-wrong") {
          sentence.append(h("span", { class: "blank-fix", text: part.answers[0] }));
        }
      }
    }
    el.replaceChildren(sentence);
    if (bank && !state.locked) {
      const taken = used();
      el.append(
        h(
          "div",
          { class: "word-bank" },
          bank.map((word) =>
            h(
              "button",
              {
                type: "button",
                class: ["word", taken.has(word) && "is-used"],
                disabled: taken.has(word),
                onClick: () => {
                  const target = state.values[state.active] === "" ? state.active : state.values.indexOf("");
                  if (target < 0) {
                    return;
                  }
                  state.values[target] = word;
                  const next = state.values.indexOf("");
                  state.active = next >= 0 ? next : target;
                  paint();
                  ctx.onChange();
                }
              },
              word
            )
          )
        )
      );
    }
  };

  paint();

  return {
    el,
    focus: () => el.querySelector(".blank-input")?.focus(),
    ready: () => state.values.every((value) => value.trim()),
    check() {
      const result = gradeFill(step, state.values);
      return { correct: result.correct, score: result.score, verdict: result.correct ? "correct" : result.score >= 0.5 ? "partial" : "wrong", response: state.values.join(" | "), detail: result };
    },
    show(result) {
      state.locked = true;
      state.result = result.detail;
      paint();
    },
    explain: () => null,
    autoHint() {
      const index = blanks.findIndex((part, blankIndex) => !part.answers.some((answer) => answer.toLowerCase() === state.values[blankIndex].trim().toLowerCase()));
      if (index < 0) {
        return null;
      }
      state.values[index] = blanks[index].answers[0];
      paint();
      ctx.onChange();
      return `Filled blank ${index + 1}.`;
    }
  };
}

// ── text: written answer, concept-graded ────────────────────────────────────

export function text(step, ctx) {
  const state = { value: "", overrides: new Map(), result: null, locked: false };
  const counter = h("span", { class: "text-count", text: "0 words" });
  const area = h("textarea", {
    class: "input text-answer",
    rows: 5,
    placeholder: "Explain in your own words. Partial answers still earn credit.",
    "aria-label": "Your answer",
    onInput: (event) => {
      state.value = event.target.value;
      const words = state.value.trim().split(/\s+/).filter(Boolean).length;
      counter.textContent = `${words} word${words === 1 ? "" : "s"}`;
      ctx.onChange();
    }
  });
  const el = h("div", { class: "text-ex" }, area, h("div", { class: "text-foot" }, counter, step.concepts?.length ? h("span", { class: "muted small", text: `A strong answer covers ${step.concepts.length} ideas.` }) : null));

  const mode = step.concepts?.length ? "concepts" : step.rubric?.length ? "rubric" : "self";

  const evaluate = () => {
    if (mode === "concepts") {
      const graded = gradeText(state.value, step.concepts, step.pass);
      const hits = graded.hits.map((entry, index) => (state.overrides.has(index) ? { ...entry, hit: state.overrides.get(index), overridden: true } : entry));
      const count = hits.filter((entry) => entry.hit).length;
      const passed = count >= graded.needed;
      return { hits, count, needed: graded.needed, score: count / hits.length, passed };
    }
    if (mode === "rubric") {
      const have = new Set(tokenize(state.value));
      const hits = step.rubric.map((row, index) => {
        const words = tokenize(row).filter((word) => word.length > 3);
        const auto = words.length > 0 && words.filter((word) => have.has(word)).length / words.length >= 0.4;
        return { label: row, hit: state.overrides.has(index) ? state.overrides.get(index) : auto, overridden: state.overrides.has(index) };
      });
      const count = hits.filter((entry) => entry.hit).length;
      const needed = Math.max(1, Math.ceil(hits.length * 0.6));
      return { hits, count, needed, score: count / hits.length, passed: count >= needed };
    }
    return null;
  };

  const toResult = (graded) => {
    if (!graded) {
      return { correct: null, score: null, verdict: "self", response: state.value };
    }
    const verdict = graded.passed ? "correct" : graded.count > 0 ? "partial" : "wrong";
    return { correct: graded.passed, score: graded.score, verdict, response: state.value, detail: graded };
  };

  return {
    el,
    focus: () => area.focus(),
    ready: () => state.value.trim().split(/\s+/).filter(Boolean).length >= 2,
    check() {
      state.result = toResult(evaluate());
      return state.result;
    },
    show() {
      state.locked = true;
      area.readOnly = true;
    },
    explain(result) {
      const block = h("div", { class: "explain-block" });
      if (result.detail) {
        block.append(
          h("div", { class: "explain-label", text: mode === "concepts" ? `Ideas covered · ${result.detail.count} of ${result.detail.hits.length} (need ${result.detail.needed})` : `Rubric · ${result.detail.count} of ${result.detail.hits.length}` }),
          h(
            "ul",
            { class: "concept-checks" },
            result.detail.hits.map((entry, index) =>
              h(
                "li",
                { class: entry.hit ? "is-hit" : "is-miss" },
                h("span", { class: "check-mark" }, icon(entry.hit ? "check" : "x", { size: 14 })),
                h("span", { class: "check-text" }, entry.label, entry.overridden && h("em", { class: "muted", text: " (your call)" })),
                h(
                  "button",
                  {
                    type: "button",
                    class: "link-btn",
                    title: entry.hit ? "Mark as not covered" : "I did cover this",
                    onClick: () => {
                      state.overrides.set(index, !entry.hit);
                      ctx.regrade?.(toResult(evaluate()));
                    }
                  },
                  entry.hit ? "Not really" : "I covered this"
                )
              )
            )
          )
        );
      }
      if (step.model) {
        block.append(h("div", { class: "explain-label", text: "Model answer" }), h("div", { class: "model-answer rich" }, rich(step.model)));
      }
      return block.childNodes.length ? block : null;
    },
    autoHint() {
      if (mode !== "concepts") {
        return null;
      }
      const graded = evaluate();
      const missing = graded.hits.find((entry) => !entry.hit);
      return missing ? `Make sure you cover: ${missing.label.toLowerCase()}.` : "You've covered every idea — check it.";
    }
  };
}

// ── api: method + path per purpose ──────────────────────────────────────────

export function api(step, ctx) {
  const state = { rows: step.endpoints.map(() => ({ method: "", path: "" })), locked: false, result: null };
  const el = h("div", { class: "api" });

  const paint = () => {
    el.replaceChildren(
      h(
        "div",
        { class: "api-rows" },
        step.endpoints.map((endpoint, index) => {
          const row = state.rows[index];
          const mark = state.result?.perRow[index];
          return h(
            "div",
            { class: ["api-row", mark && (mark.methodOk && mark.pathOk ? "is-right" : "is-wrong")] },
            h("div", { class: "api-purpose" }, rich(endpoint.purpose, { inline: true })),
            h(
              "div",
              { class: "api-inputs" },
              h(
                "select",
                {
                  class: ["api-method", row.method && `m-${row.method.toLowerCase()}`, mark && !mark.methodOk && "is-wrong"],
                  disabled: state.locked,
                  "aria-label": "HTTP method",
                  onChange: (event) => {
                    row.method = event.target.value;
                    event.target.className = `api-method m-${row.method.toLowerCase()}`;
                    ctx.onChange();
                  }
                },
                h("option", { value: "", text: "Method", selected: !row.method }),
                HTTP_METHODS.map((method) => h("option", { value: method, text: method, selected: row.method === method }))
              ),
              h("input", {
                type: "text",
                class: ["api-path", mark && !mark.pathOk && "is-wrong"],
                placeholder: "/resource/{id}",
                value: row.path,
                disabled: state.locked,
                spellcheck: "false",
                autocomplete: "off",
                "aria-label": "Path",
                onInput: (event) => {
                  row.path = event.target.value;
                  ctx.onChange();
                }
              })
            ),
            mark && !(mark.methodOk && mark.pathOk) && h("div", { class: "api-fix" }, "Expected ", h("code", { text: `${[].concat(endpoint.method)[0]} ${[].concat(endpoint.path)[0]}` }))
          );
        })
      )
    );
  };

  paint();

  return {
    el,
    ready: () => state.rows.every((row) => row.method && row.path.trim().startsWith("/")),
    check() {
      const result = gradeApi(step, state.rows);
      return { correct: result.correct, score: result.score, verdict: result.correct ? "correct" : result.score >= 0.5 ? "partial" : "wrong", response: state.rows.map((row) => `${row.method} ${row.path}`).join("; "), detail: result };
    },
    show(result) {
      state.locked = true;
      state.result = result.detail;
      paint();
    },
    explain: () => null,
    autoHint() {
      const index = state.rows.findIndex((row, rowIndex) => ![].concat(step.endpoints[rowIndex].method).includes(row.method));
      if (index < 0) {
        return "Methods look right — check the paths: nouns, plural, ids as {id}.";
      }
      state.rows[index].method = [].concat(step.endpoints[index].method)[0];
      paint();
      ctx.onChange();
      return `Set the method for “${step.endpoints[index].purpose}”.`;
    }
  };
}

// ── code: runnable JavaScript with tests (imported question banks) ──────────

export function code(step, ctx) {
  const state = { code: step.starterCode || "", run: null };
  const control = renderCodeControl({
    answerId: "code",
    initialCode: state.code,
    language: step.language,
    tests: step.tests,
    onResult: (result) => {
      state.run = result;
    }
  });
  control.addEventListener("input", (event) => {
    if (event.target.dataset.questionId === "code") {
      state.code = event.target.value;
      ctx.onChange();
    }
  });
  return {
    el: control,
    mounted: () => mountCodeEditors(control, `code:${step.id}`),
    ready: () => state.code.trim().length > 0,
    async check() {
      const run = await control.runTests();
      const passed = Boolean(run && !run.compileError && run.results.length > 0 && run.results.every((entry) => entry.passed));
      const score = run?.results?.length ? run.results.filter((entry) => entry.passed).length / run.results.length : 0;
      return { correct: passed, score, verdict: passed ? "correct" : score >= 0.5 ? "partial" : "wrong", response: state.code };
    },
    show: () => {},
    explain: () => null,
    autoHint: () => (step.tests[0] ? `The first test runs: ${step.tests[0].call}` : null)
  };
}

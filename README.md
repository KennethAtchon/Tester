# Recall — Test Form Maker

An Electron desktop learning studio. Load a test library (JSON), then practice it with spaced, effortful retrieval: answer from memory, rate your confidence, get feedback that explains *why*, and let the scheduler bring each item back just before you'd forget it. The original workflow is still here as **Mock exam**: sit a whole test and export the answers to Markdown for an AI reviewer.

The design follows a learning-science playbook. The learning engine comes first, and motivation sits on top of it. The goal is retention, not time in the app.

## Run

```sh
npm install
npm start
```

## How it works

| Screen | What it's for |
|---|---|
| **Today** | Today's goal (cards per day), what's due, one-click start or **Just one card** when motivation is low, a guilt-free 3-minute catch-up after a break, your "After ___, I will ___" plan, and why you earned each point. |
| **Skill map** | Every library as a grid of skills shaded by mastery. Placement check, interleaved **Practice mix**, a **Capstone** that unlocks once every skill reaches 60%, and prerequisite locks you can override. |
| **Session** (focus mode) | One card at a time: recall → commit by rating confidence → feedback → grade Again / Hard / Good / Easy → scheduled. |
| **Mistakes** | Every miss with your answer, the right answer, and why. Shows your top confusions (wrong options you keep picking) and a drill built from open mistakes. An entry resolves when you get it right on a later day. |
| **Insights** | Calibration (are you as right as you feel?), recall by gap since last review, your own forgetting curve, review forecast, challenge level against the 70–85% band, practice calendar, skills weakest-first, milestones. |
| **Mock exam** | The full test form for AI review. Optional per-question confidence goes into the export. Doesn't touch the schedule. |
| **Settings** | Daily goal, session length, new items per day, review cap, target retention, recall-before-options, explain-why prompts, theme. |

### Learning techniques in the session

- **Retrieval first.** Typed answers are checked against key terms. For choice items you've seen before, the options stay hidden until you've tried to recall the answer (*Recall before options*).
- **Pretesting.** New items ask you to have a go before you see anything. A wrong guess followed by feedback beats reading the answer.
- **Worked → faded → independent.** After a miss on a typed item, it comes back as a *faded example*: the model answer with key words blanked for you to fill in. Then it moves to full recall. A placement check that shows you know a skill skips these steps (expertise reversal).
- **Confidence before reveal.** The confidence buttons (Guess / Unsure / Likely / Certain, keys 1–4) are the submit buttons. Confident misses get a hypercorrection callout and are flagged in the notebook.
- **Feedback that explains.** Each item shows its one-line *why*, misconception notes on the wrong option you picked, your answer beside the model answer with key terms marked, and a rubric pre-filled from your answer that you can correct.
- **Self-explanation.** After some correct answers you're asked to explain why before seeing the expert explanation, then the two are shown side by side.
- **Hint ladder with a cost.** Nudge → partial → reveal. Each hint costs points and caps the card at Hard. The reveal counts as a miss.
- **Re-queue misses.** "Again" brings the card back 3–5 cards later in the same session.
- **Spaced repetition with FSRS-5.** Per-item stability and difficulty. Each review lands when predicted recall drops to your target retention (90% by default).
- **Interleaving and a quick win.** Sessions mix skills, open with the easiest due review, and cap reviews per day so a backlog spreads over several days.
- **Difficulty targeting.** Sessions add more new material when recent accuracy is above 85% and consolidate when it's below 70%.
- **Delayed judgments of learning.** At the end of a session: "Will you still know these in a week?" The answer is checked against the review a week later.

Points are paid only for effortful correct recall: more for longer gaps and harder items, less with hints, never for time spent. Every point shows its reason. Streaks count days you met *your own* goal; a freeze covers a missed day, and a broken streak just restarts quietly.

### Your data

Progress (memory state, review log, mistakes, streak, settings) is saved to `learning-progress.json` in Electron's user-data folder; the exact path is shown in **Settings**. It's kept out of the repo on purpose. Loading a library keeps a copy of its JSON with your progress so reviews can be scheduled across launches; loading the same library again (same `tent` or title) refreshes it and keeps your progress.

## Test JSON Format

Load a JSON file shaped like `sample-tests.json` or one of the files in `examples/`:

```json
{
  "title": "Learning Checks",
  "description": "A set of short tests.",
  "tests": [
    {
      "id": "javascript-basics",
      "title": "JavaScript Basics",
      "topic": "JavaScript",
      "instructions": "Answer in your own words.",
      "questions": [
        {
          "id": "q1",
          "prompt": "What is closure?",
          "type": "long_answer"
        },
        {
          "id": "q2",
          "prompt": "Which keyword declares a block-scoped variable?",
          "type": "single_choice",
          "options": ["var", "let", "function"]
        },
        {
          "id": "q3",
          "prompt": "Which keywords declare variables? Select all that apply.",
          "type": "multiple_choice",
          "options": ["var", "let", "const", "return"]
        },
        {
          "id": "q4",
          "prompt": "JavaScript functions can close over variables from an outer scope.",
          "type": "true_false"
        }
      ]
    }
  ]
}
```

Supported question types:

- `short_answer`
- `long_answer`
- `single_choice`
- `multiple_choice`
- `true_false`
- `code_run` — a live-coded question: the candidate writes JavaScript and runs it against test cases in a sandbox (see [Runnable code questions](#runnable-code-questions))

Legacy aliases still work for older files:

- `short` maps to `short_answer`
- `long` maps to `long_answer`
- `choice` maps to `single_choice`
- `code`, `coding`, `run` map to `code_run`

Fields the app reads:

- `title`, `description`, `tent`, and `tests` at the top level
- `id`, `title`, `topic`, `instructions`, and `questions` for each test
- `id`, `prompt`, `type`, and `options` for each question

Optional `tent` names a subfolder under `results/` for exported Markdown. Tests from the same library file share one tent, so related answer files stay grouped — for example, `performance-vs-scalability-answers.md` and `latency-vs-throughput-answers.md` both save to `results/system-design-tradeoffs/`.

For backwards compatibility, older `choices` arrays are also read as `options`.

Extra fields are fine. Fields the app doesn't use are ignored.

### Learning fields (optional)

These let practice sessions grade automatically and give better feedback. Everything still works without them: items with no key are self-graded, and choice items without a key let you set one the first time you see them.

| Field | On | What it does |
|---|---|---|
| `expectedAnswer` (or `expected_answer`, `correctAnswer`, `answer`) | question | The answer key. For `single_choice`/`true_false`, the correct option text (or `true`/`false`); for `multiple_choice`, an array of correct options; for typed answers, the model answer used for key-term checking, the faded example, and side-by-side comparison. |
| `why` (or `explanation`) | question | One line shown in feedback: *why* this is the answer. Also enables the explain-why prompt. |
| `misconceptions` (or `distractors`) | question | `{ "wrong option": "what it gets wrong" }`. Shown when you pick that option, and in your top confusions. |
| `hints` | question | Up to three hints, cheapest first. Without them the app builds a ladder from the key (rule out an option, first words, partial answer). |
| `rubric` | question | Checklist for open answers, pre-filled from your answer for self-grading. Also exported for the reviewer. |
| `relevance` | test | Why this skill matters, shown on the skill page. |
| `prerequisites` | test | Test ids to master first. The skill shows as locked until they reach 60% mastery; you can unlock it anyway. |

`sample-tests.json` uses all of them.

Rich coding prompts can also include optional fields that the app renders before the answer box:

- `scenario`
- `task`
- `requirements`
- `constraints`
- `starterCode` or `starter_code`
- `candidateCode`, `candidate_code`, or `code`
- `expectedBehavior` or `expected_behavior`
- `expectedOutput` or `expected_output`
- `answerFormat` or `answer_format`
- `source`
- `details`, as an array of `{ "label": "...", "value": "...", "kind": "text|list|code" }`

Reviewer-only fields are hidden while taking the test but included in exported Markdown so the review request can be graded precisely:

- `expectedAnswer` or `expected_answer`
- `rubric`
- `weakSpots` or `weak_spots`
- `commonMistakes` or `common_mistakes`
- `redFlags` or `red_flags`

## Runnable code questions

A `code_run` question lets the candidate write JavaScript and **Run** it against test cases without leaving the app. Code executes in an isolated Node child process (`src/runner/harness.js`) with a fresh `vm` context: no `require`, no filesystem, no network, and a hard 5-second wall-clock kill plus a 2-second per-call timeout to stop runaway loops.

Fields for a `code_run` question:

- `starterCode` (or `starter_code`) — pre-fills the editor; the candidate edits instead of starting blank.
- `language` — used for the code fence in the exported Markdown (defaults to `javascript`).
- `tests` — an array of cases evaluated against the submitted code:
  - `name` — label shown in the results panel.
  - `call` — a JavaScript expression evaluated after the candidate's code runs (e.g. an IIFE that exercises the solution and returns a value).
  - `expect` — the value the `call` must deep-equal (arrays/objects compared structurally; `NaN` equals `NaN`).
  - `expectError` — instead of `expect`, assert the call throws. `true` matches any error; a string matches an error whose message contains it.

Run results (pass/fail per test, expected-vs-got, and console output) are shown inline and embedded in the exported Markdown so a reviewer sees both the code and how it behaved.

Example:

```json
{
  "id": "lru-cache",
  "type": "code_run",
  "language": "javascript",
  "prompt": "Implement an O(1) LRU cache.",
  "starterCode": "function createLRU(capacity) {\n  // ...\n}",
  "tests": [
    { "name": "evicts least-recently-used", "call": "(() => { const c = createLRU(2); c.put('a',1); c.put('b',2); c.get('a'); c.put('c',3); return [c.get('a'), c.get('b')]; })()", "expect": [1, null] }
  ]
}
```

## Architecture

No build step: vanilla ES modules under `src/renderer/`, with CodeMirror 5 vendored.

- `app.js` — entry point: loads progress, applies the theme, rolls the streak, starts the router.
- `domain/` — pure logic with no DOM:
  - `fsrs.js` — FSRS-5 scheduler (stability, difficulty, retrievability, intervals).
  - `grading.js` — answer keys, key-term coverage, rubric prefill, hint ladders, cloze (faded examples).
  - `insights.js` — calibration, retention by gap, forecast, challenge level, forgetting curve.
  - `rewards.js` — XP rules and milestone badges.
  - `normalize.js` — validates loaded JSON into a predictable shape.
  - `markdown.js` — the Mock-exam Markdown export.
- `state/` — `progress.js` (persistent learner data), `catalog.js` (enrolled libraries → skills → items), `learner.js` (memory, mastery, mistakes, streak, rewards; every attempt goes through `recordAttempt`), `sessions.js` (session builder), `store.js` (Mock-exam answers).
- `ui/` — `router.js`, `rail.js`, `components.js`, `charts.js`, `icons.js`, `theme.js`, `toast.js`, `runner.js` and `codeEditor.js` (code questions), and `views/` (one module per screen).
- `styles/app.css` — the design system: tokens for light and dark, then layout per screen.

The main process exposes the file API over IPC (`src/preload.js` → `window.testFiles`), including `code:run` (`src/runner/runCode.js` → `src/runner/harness.js`) and `progress:load` / `progress:save`.

## Export

In **Mock exam**, use **Save Markdown** to create a review request. If the loaded library defines a `tent`, the file is written under `results/<tent>/`; otherwise it goes directly in `results/`. Give that Markdown file to an AI and ask it to create a graded results file with explanations. Self-rated confidence is included, so the reviewer can flag confident mistakes.

# Test Form Maker

A small Electron desktop app for taking tests from a JSON file and exporting the completed answers to Markdown. The Markdown file is designed to be handed to an AI for review, grading, and explanations.

## Run

```sh
npm install
npm start
```

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

- `title`, `description`, and `tests` at the top level
- `id`, `title`, `topic`, `instructions`, and `questions` for each test
- `id`, `prompt`, `type`, and `options` for each question

For backwards compatibility, older `choices` arrays are also read as `options`.

Extra fields are fine. For example, `expectedAnswer` or `rubric` can live in the JSON for the AI reviewer, even though the app does not grade automatically.

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

The renderer is split into focused ES modules under `src/renderer/` instead of one file:

- `app.js` — entry point; wires DOM controls to the modules.
- `store.js` — single source of truth for state and the mutations that touch it.
- `domain/normalize.js` — validates loaded JSON into a predictable shape.
- `domain/markdown.js` — pure Markdown export builder.
- `ui.js` — view layer; renders state, holds no business logic.
- `runner.js` — code-editor + sandboxed-test UI for `code_run` questions.
- `io.js`, `status.js`, `theme.js`, `util.js` — load/save controllers, status bar, theming, and shared helpers.

The main process adds a `code:run` IPC handler (`src/runner/runCode.js` → `src/runner/harness.js`) exposed to the renderer as `window.testFiles.runCode`.

## Export

After answering questions, use **Save Markdown** to create a response file. Give that Markdown file to an AI and ask it to create a graded results Markdown file with explanations.

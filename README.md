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

Legacy aliases still work for older files:

- `short` maps to `short_answer`
- `long` maps to `long_answer`
- `choice` maps to `single_choice`

Fields the app reads:

- `title`, `description`, and `tests` at the top level
- `id`, `title`, `topic`, `instructions`, and `questions` for each test
- `id`, `prompt`, `type`, and `options` for each question

For backwards compatibility, older `choices` arrays are also read as `options`.

Extra fields are fine. For example, `expectedAnswer` or `rubric` can live in the JSON for the AI reviewer, even though the app does not grade automatically.

## Export

After answering questions, use **Save Markdown** to create a response file. Give that Markdown file to an AI and ask it to create a graded results Markdown file with explanations.

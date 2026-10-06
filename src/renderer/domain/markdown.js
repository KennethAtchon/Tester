// Builds the Markdown review request from a test, its answers, and any code-run
// results. Pure: takes everything as arguments so it is trivially testable.

import { stringify, isAnswered, codeAnswerKey } from "../lib/util.js";

// Question types whose UI only captures a selection — there is no field for the
// user to type an explanation. Graders must score these on selection correctness
// alone and must not deduct for "missing" prose justification.
const SELECTION_ONLY_TYPES = new Set(["multiple_choice", "single_choice", "true_false"]);

const CONFIDENCE_LABELS = { 1: "Guess (~25%)", 2: "Unsure (~50%)", 3: "Likely (~75%)", 4: "Certain (~95%)" };

export function buildMarkdown({ library, test, answers, sourcePath, runResults, confidence = {} }) {
  const answeredCount = test.questions.filter((question) => isQuestionAnswered(question, answers)).length;
  const now = new Date().toLocaleString();

  const lines = [
    `# ${test.title} Answers`,
    "",
    "## Review Request",
    "",
    "Please grade these answers, explain what is correct or incorrect, and create a results Markdown file with suggested improvements.",
    "Where a self-rated confidence is given, also comment on calibration: flag confident wrong answers (these are the most valuable to correct) and correct answers given with low confidence.",
    "",
    "## Test Metadata",
    "",
    `- Library: ${library.title}`,
    `- Source: ${sourcePath || "Unknown"}`,
    `- Topic: ${test.topic || "General"}`,
    `- Questions answered: ${answeredCount} of ${test.questions.length}`,
    `- Exported: ${now}`,
    ""
  ];

  if (test.instructions) {
    lines.push("## Instructions", "", test.instructions, "");
  }

  lines.push("## Answers", "");

  test.questions.forEach((question, index) => {
    lines.push(`### ${index + 1}. ${question.prompt}`, "", `**Question type:** ${question.type}`, "");

    if (SELECTION_ONLY_TYPES.has(question.type)) {
      lines.push(
        "> **Grading directive:** Selection-only question. The interface captures the choice and nothing else — there is no field for the user to explain it. Grade solely on whether the selection is correct. Do NOT deduct points for a missing written justification, even if the test-level instructions ask for explanations.",
        ""
      );
    }

    appendDetails(lines, question.details, "Question Context", question.language);
    appendDetails(lines, question.grading, "Reviewer Grading Notes", question.language);

    if (question.type === "code_run") {
      appendCodeAnswer(lines, question, answers[question.id], runResults[question.id]);
    } else if (question.answerMode === "code") {
      appendCodeBlock(lines, "Submitted code", question.language, answers[question.id]);
    } else if (question.answerMode === "both") {
      lines.push("**Explanation:**", "", formatAnswer(answers[question.id]), "");
      appendCodeBlock(lines, "Submitted code", question.language, answers[codeAnswerKey(question.id)]);
    } else {
      lines.push("**Answer:**", "", formatAnswer(answers[question.id]), "");
    }

    if (confidence[question.id]) {
      lines.push(`**Self-rated confidence:** ${CONFIDENCE_LABELS[confidence[question.id]]}`, "");
    }
  });

  return lines.join("\n");
}

// True when a question has any answer content, accounting for "both" questions
// that store prose and code under separate keys.
function isQuestionAnswered(question, answers) {
  if (question.answerMode === "both") {
    return isAnswered(answers[question.id]) || isAnswered(answers[codeAnswerKey(question.id)]);
  }
  return isAnswered(answers[question.id]);
}

function appendCodeBlock(lines, label, language, code) {
  lines.push(`**${label}:**`, "", `\`\`\`${language || "javascript"}`, stringify(code) || "// (no code submitted)", "```", "");
}

function appendCodeAnswer(lines, question, answer, runResult) {
  lines.push("**Submitted code:**", "", `\`\`\`${question.language || "javascript"}`, stringify(answer) || "// (no code submitted)", "```", "");

  if (!runResult) {
    lines.push("**Run result:** _Not run._", "");
    return;
  }

  if (runResult.compileError) {
    lines.push("**Run result:** Compile/setup error", "", `\`\`\`\n${runResult.compileError}\n\`\`\``, "");
    return;
  }

  const passed = runResult.results.filter((result) => result.passed).length;
  lines.push(`**Run result:** ${passed}/${runResult.results.length} tests passed`, "");

  for (const result of runResult.results) {
    const mark = result.passed ? "✅" : "❌";
    lines.push(`- ${mark} ${result.name}${result.passed ? "" : ` — expected \`${result.expected}\`, got \`${result.error ?? result.got}\``}`);
  }
  lines.push("");
}

function appendDetails(lines, details, title, language) {
  if (!details || details.length === 0) {
    return;
  }

  lines.push(`**${title}:**`, "");

  for (const detail of details) {
    lines.push(`_${detail.label}_`);

    if (detail.kind === "list" && Array.isArray(detail.value)) {
      lines.push(...detail.value.map((item) => `- ${item}`), "");
      continue;
    }

    if (detail.kind === "code") {
      lines.push(`\`\`\`${language || "text"}`, Array.isArray(detail.value) ? detail.value.join("\n") : detail.value, "```", "");
      continue;
    }

    lines.push(Array.isArray(detail.value) ? detail.value.join("\n") : detail.value, "");
  }
}

function formatAnswer(answer) {
  if (Array.isArray(answer)) {
    return answer.length > 0 ? answer.map((item) => `- ${item}`).join("\n") : "_No answer provided._";
  }

  return stringify(answer) || "_No answer provided._";
}

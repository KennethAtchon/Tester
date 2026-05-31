// Builds the Markdown review request from a test, its answers, and any code-run
// results. Pure: takes everything as arguments so it is trivially testable.

import { stringify, isAnswered } from "../lib/util.js";

export function buildMarkdown({ library, test, answers, sourcePath, runResults }) {
  const answeredCount = test.questions.filter((question) => isAnswered(answers[question.id])).length;
  const now = new Date().toLocaleString();

  const lines = [
    `# ${test.title} Answers`,
    "",
    "## Review Request",
    "",
    "Please grade these answers, explain what is correct or incorrect, and create a results Markdown file with suggested improvements.",
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

    appendDetails(lines, question.details, "Question Context", question.language);
    appendDetails(lines, question.grading, "Reviewer Grading Notes", question.language);

    if (question.type === "code_run") {
      appendCodeAnswer(lines, question, answers[question.id], runResults[question.id]);
    } else {
      lines.push("**Answer:**", "", formatAnswer(answers[question.id]), "");
    }
  });

  return lines.join("\n");
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

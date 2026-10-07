// Exercise registry: one factory per step type (see basic.js for the shared
// interface), plus plain-text summaries of a step and its answer for the
// mistake notebook and Markdown exports.

import { concept, choice, sort, order, match } from "./basic.js";
import { estimate, number, fill, text, api, code } from "./inputs.js";
import { build } from "./build.js";
import { plain } from "../../lib/markup.js";
import { choiceAnswers, formatQuantity, formatNumber, parseFill } from "../../domain/grading.js";

const FACTORIES = { concept, choice, sort, order, match, estimate, number, fill, text, api, build, code };

export function createExercise(step, ctx) {
  const factory = FACTORIES[step.type];
  if (!factory) {
    throw new Error(`Unknown step type "${step.type}"`);
  }
  return factory(step, ctx);
}

export const TYPE_LABELS = {
  concept: "Learn",
  choice: "Choose",
  sort: "Sort",
  order: "Sequence",
  match: "Match",
  estimate: "Estimate",
  number: "Solve",
  fill: "Fill in",
  text: "Explain",
  api: "Design the API",
  build: "Build",
  code: "Code"
};

export function stepPrompt(step) {
  if (step.type === "fill" && !step.prompt) {
    return "Complete the sentence.";
  }
  return plain(step.prompt || step.title || "");
}

export function answerSummary(step) {
  switch (step.type) {
    case "choice":
      return (choiceAnswers(step) || ["(no answer key)"]).map(plain).join("; ");
    case "sort":
      return step.buckets.map((bucket) => `${bucket}: ${step.items.filter((item) => item.bucket === bucket).map((item) => plain(item.text)).join(", ")}`).join(" · ");
    case "order":
      return step.items.map(plain).join(" → ");
    case "match":
      return step.pairs.map((pair) => `${plain(pair[0])} → ${plain(pair[1])}`).join("; ");
    case "estimate":
      return `≈ ${formatQuantity(step.answer)}${step.unit ? ` ${step.unit}` : ""}`;
    case "number":
      return `${formatNumber([].concat(step.answer)[0])}${step.unit ? ` ${step.unit}` : ""}`;
    case "fill":
      return parseFill(step.text).map((part) => (part.blank == null ? plain(part.text) : `[${part.answers[0]}]`)).join("");
    case "text":
      return plain(step.model || (step.rubric || []).join("; ") || "");
    case "api":
      return step.endpoints.map((endpoint) => `${[].concat(endpoint.method)[0]} ${[].concat(endpoint.path)[0]}`).join("; ");
    case "build":
      return "See the reference design.";
    default:
      return "";
  }
}

// Insights: teaches the learner to judge their own learning. Calibration
// (are you as right as you feel?), retention by spacing gap (the fluency
// illusion made visible), the learner's own forgetting curve, review load,
// whether practice sits in the 70–85% challenge band, and practice habits.
// Learning signals come first; engagement signals are secondary.

import { h } from "../../lib/dom.js";
import { icon } from "../icons.js";
import { card, pageHead, statTile, emptyState, pct, meter, chip } from "../components.js";
import { chartCard, columnChart, lineChart, calibrationChart, heatmap, dataTable, legendItem } from "../charts.js";
import { catalog } from "../../state/catalog.js";
import { progress, settings } from "../../state/progress.js";
import { skillStats, weekXp, earnedBadges } from "../../state/learner.js";
import {
  calibration,
  retentionByGap,
  spacedVsMassed,
  challengeSeries,
  forecast,
  activityGrid,
  hintReliance,
  forgettingCurve,
  jolAccuracy
} from "../../domain/insights.js";
import { formatAgo } from "../../lib/time.js";
import { href } from "../router.js";

const percent = (value) => `${Math.round(value * 100)}%`;

export function renderInsights(root) {
  const page = h("div", { class: "page" });
  root.append(page);

  page.append(pageHead({ eyebrow: "Metacognition", title: "Insights", sub: "How well you're learning — not how long you spend. Learning signals first." }));

  const data = progress();
  const log = data.log;
  if (log.length === 0) {
    page.append(emptyState({ iconName: "insights", title: "Nothing to show yet", body: "Finish a session and this page will show your calibration, your own forgetting curve, and how spacing changes what you keep." }));
    return;
  }

  const memories = Object.values(data.items);
  const cal = calibration(log);
  const spacing = spacedVsMassed(log);
  const hints = hintReliance(log);
  const longTerm = memories.filter((memory) => memory.lastCorrect && memory.stability >= 21).length;
  const bias = cal.bias == null ? null : cal.bias > 0.03 ? "overconfident" : cal.bias < -0.03 ? "underconfident" : "well calibrated";

  page.append(
    h(
      "div",
      { class: "stat-row stat-row-5" },
      statTile({ label: "Spaced recall", value: spacing.spaced == null ? "—" : pct(spacing.spaced), sub: spacing.spacedN ? `${spacing.spacedN} reviews after 1+ day` : "needs a review after a day" }),
      statTile({ label: "Calibration gap", value: cal.error == null ? "—" : `${Math.round(cal.error * 100)} pts`, sub: bias || "rate confidence to see this", tone: cal.error != null && cal.error > 0.15 ? "warn" : null }),
      statTile({ label: "Hint reliance", value: hints == null ? "—" : pct(hints), sub: "of recent answers used a hint" }),
      statTile({ label: "Long-term memory", value: String(longTerm), sub: "items stable for 3+ weeks" }),
      statTile({ label: "Points", value: String(data.stats.xpTotal || 0), sub: `${weekXp()} this week` })
    )
  );

  if (spacing.massedN >= 5 && spacing.spacedN >= 5 && spacing.massed - spacing.spaced > 0.05) {
    page.append(
      h(
        "div",
        { class: "callout callout-accent insight-callout" },
        icon("eye", { size: 18 }),
        h(
          "div",
          null,
          h("strong", { text: "The fluency illusion, in your own numbers. " }),
          `Same-day retries: ${pct(spacing.massed)} right. After a day or more: ${pct(spacing.spaced)}. The same-day number feels like learning; the spaced one is what you actually keep. That's why reviews are spread out.`
        )
      )
    );
  }

  page.append(h("div", { class: "chart-grid" }, calibrationCard(cal), retentionCard(log), curveCard(memories), forecastCard(memories), challengeCard(log), calendarCard()));
  page.append(h("div", { class: "insight-lower" }, skillsCard(), h("div", { class: "insight-side" }, badgesCard(), jolCard(data))));
}

function calibrationCard(cal) {
  const certain = cal.buckets[3];
  const note = certain.n >= 3
    ? `When you say “Certain”, you're right ${pct(certain.accuracy)} of the time.`
    : "Rate your confidence before each answer to fill this in.";
  return chartCard({
    title: "Calibration",
    sub: "Are you as right as you feel?",
    legend: [legendItem("How often you were right", "dot"), legendItem("What you said", "ring")],
    chart: calibrationChart(cal.buckets),
    table: dataTable(
      ["Confidence", "You said", "You were right", "Answers"],
      cal.buckets.map((bucket) => [bucket.label, percent(bucket.expected), bucket.accuracy == null ? null : percent(bucket.accuracy), bucket.n])
    ),
    note
  });
}

function retentionCard(log) {
  const buckets = retentionByGap(log);
  return chartCard({
    title: "Recall by gap since last review",
    sub: "Accuracy on reviews, grouped by how long you'd waited.",
    chart: columnChart({
      data: buckets.map((bucket) => ({
        label: bucket.label,
        value: bucket.accuracy,
        tip: bucket.n ? `${bucket.label}: ${pct(bucket.accuracy)} right (${bucket.n} reviews)` : `${bucket.label}: no reviews yet`
      })),
      max: 1,
      format: percent,
      ariaLabel: "Recall accuracy by gap since last review"
    }),
    table: dataTable(["Gap", "Accuracy", "Reviews"], buckets.map((bucket) => [bucket.label, bucket.accuracy == null ? null : percent(bucket.accuracy), bucket.n])),
    note: "Lower bars at longer gaps are normal — that effortful recall is what builds durable memory."
  });
}

function curveCard(memories) {
  const points = forgettingCurve(memories, 30);
  const retention = settings().retention;
  if (points.length === 0) {
    return null;
  }
  const at = (day) => points.find((point) => point.day === day)?.recall ?? 0;
  return chartCard({
    title: "Your forgetting curve",
    sub: "Average recall chance of everything you've learned, if you stopped reviewing today.",
    chart: lineChart({
      points: points.map((point) => ({ x: point.day, y: point.recall, label: point.day === 0 ? "today" : `in ${point.day} days` })),
      yDomain: [0, 1],
      area: true,
      format: percent,
      refLine: { y: retention, label: `${percent(retention)} review target` },
      xTicks: [0, 7, 14, 21, 30].map((day) => ({ x: day, label: day === 0 ? "Today" : `${day}d` })),
      ariaLabel: "Projected average recall over the next 30 days"
    }),
    table: dataTable(["When", "Average recall"], [0, 1, 3, 7, 14, 21, 30].map((day) => [day === 0 ? "Today" : `In ${day} days`, percent(at(day))])),
    note: `Without review: ${percent(at(7))} in a week, ${percent(at(30))} in a month. Each review flattens the curve for that item.`
  });
}

function forecastCard(memories) {
  const days = forecast(memories, 14);
  const label = (entry, index) => {
    if (index === 0) {
      return "Today";
    }
    const [year, month, date] = entry.day.split("-").map(Number);
    return new Date(year, month - 1, date).toLocaleDateString(undefined, { weekday: "narrow" });
  };
  return chartCard({
    title: "Reviews coming up",
    sub: "Next 14 days. Overdue items count toward today.",
    chart: columnChart({
      data: days.map((entry, index) => ({
        label: entry.day,
        short: label(entry, index),
        value: entry.count,
        tip: `${index === 0 ? "Today" : entry.day}: ${entry.count} review${entry.count === 1 ? "" : "s"}`
      })),
      format: (value) => String(Math.round(value)),
      integer: true,
      ariaLabel: "Reviews due over the next 14 days"
    }),
    table: dataTable(["Day", "Reviews due"], days.map((entry, index) => [index === 0 ? "Today" : entry.day, entry.count])),
    note: `Daily cap: ${settings().maxReviewsPerDay} reviews. A backlog spreads over several days instead of landing at once.`
  });
}

function challengeCard(log) {
  const series = challengeSeries(log, 20, 80);
  if (series.length < 2) {
    return chartCard({
      title: "Challenge level",
      sub: "Rolling accuracy over your last 20 answers.",
      chart: h("p", { class: "muted small chart-empty", text: "Answer at least 21 items to see your challenge level over time." }),
      table: h("p", { class: "muted small", text: "Not enough data yet." })
    });
  }
  const latest = series[series.length - 1].accuracy;
  const verdict = latest > 0.85 ? "Too easy lately — sessions will add more new material." : latest >= 0.7 ? "In the zone: hard enough to learn, easy enough to keep going." : "Running hard — sessions will lean on reviews until it settles.";
  return chartCard({
    title: "Challenge level",
    sub: "Rolling accuracy over your last 20 answers. The target band is 70–85%.",
    chart: lineChart({
      points: series.map((point) => ({ x: point.index, y: point.accuracy, label: `answer ${point.index}` })),
      yDomain: [0, 1],
      band: [0.7, 0.85, "challenge zone"],
      format: percent,
      ariaLabel: "Rolling accuracy with the 70 to 85 percent target band"
    }),
    table: dataTable(["Window ending", "Accuracy"], series.slice(-12).map((point) => [new Date(point.ts).toLocaleString(), percent(point.accuracy)])),
    note: verdict
  });
}

function calendarCard() {
  const data = progress();
  const goal = settings().dailyGoal;
  const cells = activityGrid(data.streak.history, data.streak.frozen, goal, 18);
  const recent = cells.filter((cell) => !cell.future && (cell.count > 0 || cell.frozen)).slice(-30).reverse();
  return chartCard({
    title: "Practice calendar",
    sub: `Darker = more cards. Your goal is ${goal} a day.`,
    legend: [
      h("span", { class: "legend-item" }, "Less", ...[0, 1, 2, 3, 4].map((level) => h("span", { class: `legend-heat heat-${level}` })), "More"),
      h("span", { class: "legend-item" }, h("span", { class: "legend-heat heat-frozen" }), "Streak freeze")
    ],
    chart: heatmap(cells, { goal }),
    table: dataTable(["Day", "Cards", "Goal met"], recent.map((cell) => [cell.day, cell.count, cell.met ? "yes" : cell.frozen ? "frozen" : "no"])),
    note: `Current streak ${data.streak.current} · best ${data.streak.best}. Streaks count days you met your own goal; freezes cover a missed day.`
  });
}

function skillsCard() {
  const rows = [];
  for (const library of catalog().libraries) {
    for (const skill of library.skills) {
      rows.push({ skill, stats: skillStats(skill.key) });
    }
  }
  rows.sort((a, b) => a.stats.mastery - b.stats.mastery);
  return card(
    { title: "Skills, weakest first", sub: "Mastery decays as memories fade — a mastered skill that slips shows up here again." },
    h(
      "div",
      { class: "table-wrap" },
      h(
        "table",
        { class: "table" },
        h("thead", null, h("tr", null, ["Skill", "Mastery", "Seen", "Due", "Last practiced"].map((label) => h("th", { text: label })))),
        h(
          "tbody",
          null,
          rows.map(({ skill, stats }) =>
            h(
              "tr",
              null,
              h("td", null, h("a", { href: href("skill", skill.key), text: skill.title }), h("div", { class: "muted small", text: skill.libTitle })),
              h("td", { class: "strength-cell" }, meter(stats.mastery, { tone: stats.mastered ? "good" : "accent", label: `${skill.title} mastery` }), h("span", { class: "num", text: pct(stats.mastery) })),
              h("td", { class: "num", text: `${stats.seen}/${stats.total}` }),
              h("td", { class: "num", text: String(stats.due) }),
              h("td", { class: "muted", text: stats.lastPracticed ? formatAgo(stats.lastPracticed) : "—" })
            )
          )
        )
      )
    )
  );
}

function badgesCard() {
  const badges = earnedBadges();
  return card(
    { title: "Milestones", sub: "Awarded for mastery, not activity." },
    h(
      "ul",
      { class: "badge-list" },
      badges.map((badge) =>
        h(
          "li",
          { class: ["badge", badge.earnedAt && "is-earned"] },
          h("span", { class: "badge-icon" }, icon(badge.earnedAt ? "star" : "lock", { size: 16 })),
          h("div", null, h("strong", { text: badge.title }), h("span", { text: badge.earnedAt ? `${badge.description} · ${formatAgo(badge.earnedAt)}` : badge.description }))
        )
      )
    )
  );
}

function jolCard(data) {
  const result = jolAccuracy(data.items, data.log);
  const pending = Object.values(data.items).filter((memory) => memory.jol).length - result.judged;
  return card(
    { title: "Your predictions", sub: "“Will you remember this in a week?” — checked against what happened." },
    result.judged > 0
      ? h("p", null, h("strong", { class: "big-inline", text: pct(result.accuracy) }), ` of ${result.judged} predictions came true.`)
      : h("p", { class: "muted small", text: "Answer the end-of-session question and this fills in a week later." }),
    pending > 0 && chip(`${pending} waiting to be checked`, { iconName: "clock" })
  );
}

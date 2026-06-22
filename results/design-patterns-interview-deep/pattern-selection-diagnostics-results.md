# Pattern Selection Diagnostics — Results

**Source answers:** `results/design-patterns-interview-deep/pattern-selection-diagnostics-answers.md`
**Graded:** 2026-06-01
**Topic:** Design Patterns — Intent and Tradeoffs

## Score Summary

| # | Type | Selection | Score |
|---|------|-----------|-------|
| 1 | multiple_choice | ✅ correct three | 10/10 |
| 2 | single_choice | ✅ Factory Method | 10/10 |
| 3 | long_answer | ⚠️ Facade only, missed "both" | 5/10 |
| 4 | single_choice | ✅ State | 10/10 |
| 5 | long_answer | ✅ overengineering, no concrete fix | 6/10 |
| 6 | true_false | ✅ False | 10/10 |
| | **Total** | | **51/60 (85%)** |

**Grading note:** Q1, Q2, Q4, Q6 are selection-only — the app captures the choice and gives you no field to type a justification. They're graded on selection correctness alone. All four correct → full marks. (The earlier 47% was wrong: it docked these for "missing explanations" that the interface never lets you write. The exporter has been fixed to emit a grading directive so this can't recur.)

Only the two `long_answer` questions (Q3, Q5) carry reasoning expectations — that's where the remaining points are.

---

## Q1 — Pattern groups · 10/10

Selected the three true statements and correctly left the performance statement unselected. That's a perfect score — this is a checkbox question with no explanation field.

Optional, for your own understanding (not graded): example per group — behavioral → **Observer**, structural → **Adapter**, creational → **Factory Method**. The false statement's trap: patterns are **design vocabulary**, not performance tools (Flyweight helps memory in a narrow case, but performance isn't any group's defining intent).

---

## Q2 — Notification objects · 10/10

Factory Method — correct, full marks. Single-choice, no justification field.

For your own reference (not graded): the fit is picking a product **subtype** (email/SMS/push) while decoupling the client from concrete classes. Builder would only win if construction had many independent steps or optional parts — "create" in the prompt is not a Builder signal.

---

## Q3 — Adapter vs Facade · 5/10

**Partly right, but missed the key move.** The strong answer is **"both, and here's the dominant force"** — not a flat pick.

- Facade reasoning is fine: it hides eight calls, token refresh, retries behind a narrow `charge()`. Good.
- But you dismissed Adapter too fast. There **is** an Adapter force here: making the vendor's incompatible SDK conform to *your* application's expected `PaymentGateway.charge(amount, token)` interface. That's textbook Adapter intent.
- So which dominates? If the app already defines `PaymentGateway` and you're conforming the vendor to it → **Adapter** leads. If the point is just taming subsystem complexity behind a simple API → **Facade** leads. Real wrappers do both; the interview point is naming the dominant intent.
- "They both do the same thing" — wrong, and it undercuts your own answer. They have different intents: Adapter = compatibility, Facade = simplification. Drop that line.

---

## Q4 — Document modes · 10/10

State — correct, full marks. Single-choice, no justification field.

For your own reference (not graded): the distinguishing detail is that a successful `publish()` **transitions the document to another mode** — self-transitioning lifecycle = State. Strategy would fit only if the client picked an interchangeable algorithm with no lifecycle meaning. Same composition shape, different intent.

---

## Q5 — `UserNameFactoryBuilderProviderSingleton` · 6/10

**Best answer of the set.** You correctly refused to praise the pattern stack and called out complexity with no problem behind it. That's the trap and you avoided it.

**To get full marks (rubric-required)**
- Propose the **concrete simplest replacement**, not just "don't do this." For trimming a string:
  ```javascript
  const normalizeUsername = (raw) => raw.trim();
  ```
  If real invariants exist (length, charset, uniqueness), a small **value object** that validates in its constructor — nothing more.
- Mention preserving existing **tests/behavior** while deleting the ceremony, so the refactor is safe.
- Watch the second trap: don't replace one unnecessary stack with a different unnecessary abstraction.

---

## Q6 — Naming is enough? · 10/10

False — correct, full marks. True/false, no justification field.

For your own reference (not graded): interviewers test **forces, tradeoffs, boundaries, failure modes**, not vocabulary recall. A weak answer names "Strategy" correctly but never says how the client chooses the strategy, where state lives, or how each algorithm is tested.

---

## Bottom line

**85%.** Every selection question (Q1, Q2, Q4, Q6) was correct — full marks. You read pattern intent from problem forces cleanly.

The only points left on the table are in the two `long_answer` questions:
- **Q3** — answer is "both, name the dominant force." You picked Facade and dismissed Adapter too fast; there's a real Adapter force (conforming the vendor SDK to your `PaymentGateway` interface).
- **Q5** — strong critique, but name the concrete replacement: a `trim()` function or a small validating value object.

Nail those two and this is mid-90s.

# Creational Patterns: Implement This — Results

**Source answers:** `results/design-patterns-interview-deep/creational-patterns-implement-this-answers.md`
**Graded:** 2026-06-01
**Topic:** Factory Method, Abstract Factory, Builder, Prototype, Singleton

## Score Summary

| # | Pattern | Score | Verdict |
|---|---------|-------|---------|
| 1 | Factory Method | 6/10 | Right idea, factory not wired in, key explanation missing |
| 2 | Abstract Factory | 7/10 | Strongest answer. Concept correct, client wiring thin |
| 3 | Builder | 2/10 | Misread the task — built a URL string, not the object |
| 4 | Prototype | 2/10 | Missed deep-copy demonstration and the bug entirely |
| 5 | Singleton critique | 5/10 | Real risks named, missed the interview-level core |
| 6 | Compare all five | 5/10 | Omitted Singleton, vague on Builder |
| | **Total** | **27/60 (45%)** | |

---

## Q1 — Factory Method · 6/10

**Correct**
- Parser base class + `CsvParser`/`JsonParser` subclasses: right product hierarchy.
- `ParserFactory(type)` isolates the branch in a dedicated factory. Rubric allows a small switch in a dedicated factory — good.

**Wrong / missing**
- Factory never wired into `ImportJob`. `run()` still empty. Rubric wants `run()` asking for a parser through the abstraction then orchestrating. You stopped before connecting the two.
- No testability shown. Rubric explicitly wants DI or an overrideable factory method. Inject the parser (or factory) via constructor so a test passes a fake.
- "Why Factory Method, not Builder or Abstract Factory" — required by the answer format, not answered.
- Bugs: `Jsonparser` typo (should be `JsonParser`); TS type annotation `(type): Parser =>` in a `.js` block; selection by `else` means anything non-csv returns JSON silently.

**Fix**
```javascript
class ImportJob {
  constructor(filePath, parserFactory = ParserFactory) {
    this.filePath = filePath;
    this.parserFactory = parserFactory; // injected → testable
  }
  async run() {
    const ext = this.filePath.split('.').pop();
    const parser = this.parserFactory(ext);   // creation delegated
    return parser.parse(this.filePath);        // run() only orchestrates
  }
}

function ParserFactory(type) {
  switch (type) {
    case 'csv':  return new CsvParser();
    case 'json': return new JsonParser();
    // case 'xml': return new XmlParser();  ← future extension, one line, one place
    default: throw new Error(`No parser for .${type}`);
  }
}
```
One-liner you owed: Factory Method because there is **one** product type (a parser) with swappable implementations. Abstract Factory would be for **families** of related products; Builder for assembling **one complex** object step by step.

---

## Q2 — Abstract Factory · 7/10

**Correct**
- Two product families (Web/Native), one `PlatformFactory` interface, two concrete factories, each method returns the matching family member. This is the core of Abstract Factory and you got it.
- Explanation of the FM-vs-AF distinction (one canonical object vs a family of related objects) is accurate.

**Wrong / missing**
- `createTextInput {}` missing parens — syntax error.
- Client code stops at `web.createButton()`. Rubric wants client code that **receives the factory** and builds the whole screen. The whole point is the client never names a concrete product:
```typescript
function buildSettingsScreen(ui: PlatformFactory) {
  const button = ui.createButton();
  const toggle = ui.createToggle();
  const input  = ui.createTextInput();
  return [button, toggle, input]; // guaranteed same family
}
buildSettingsScreen(new WebFactory());   // all Web
buildSettingsScreen(new NativeFactory()); // all Native — mixing is impossible
```
- State the **family invariant** in code terms: because one factory makes all three controls, you cannot get a `WebButton` next to a `NativeToggle`. That impossibility is the deliverable.
- Product classes are empty stubs — fine for pseudocode, but a shared `Button`/`Toggle` interface would make "client unaware of concrete products" real.

---

## Q3 — Builder · 2/10

**Misread the task.** The builder must assemble a `SearchQuery` object (the type was given in the starter code). You built a URL query string instead. Most rubric points are about the object and its validation, which never appears.

**Wrong / missing**
- No `build()` → so no place to centralize validation. This was the central requirement.
- None of the invariants from the scenario are checked: `pageSize` without `page`, `desc` without a sort field, `createdAfter` after `createdBefore`.
- `filterPage`/`created` are `console.log` placeholders — no behavior.
- `searcher = SearchBuilder()` missing `new`; query-string joins use `?` repeatedly (would be `&`), but that's moot since the output should be an object.
- "When is a plain object enough?" — required, not answered.

**Fix (shape)**
```typescript
class SearchBuilder {
  private q: Partial<SearchQuery> = {};
  constructor(text: string) { this.q.text = text; }
  tags(t: string[])              { this.q.tags = t; return this; }
  sort(by: SearchQuery['sortBy'], dir: SearchQuery['sortDirection']) {
    this.q.sortBy = by; this.q.sortDirection = dir; return this;
  }
  paginate(page: number, pageSize: number) {
    this.q.page = page; this.q.pageSize = pageSize; return this;
  }
  createdBetween(after: Date, before: Date) {
    this.q.createdAfter = after; this.q.createdBefore = before; return this;
  }
  build(): SearchQuery {
    const q = this.q;
    if (q.pageSize && !q.page) throw new Error('pageSize requires page');
    if (q.sortDirection && !q.sortBy) throw new Error('sort direction requires sortBy');
    if (q.createdAfter && q.createdBefore && q.createdAfter > q.createdBefore)
      throw new Error('createdAfter must precede createdBefore');
    return q as SearchQuery; // validated invariants live in ONE place
  }
}

new SearchBuilder('laptops').sort('createdAt','desc').paginate(1,20).build();
```
"Plain object is enough" when there are no cross-field rules and call sites are already readable — Builder earns its keep only when validation or optional-field noise is real.

---

## Q4 — Prototype · 2/10

**Wrong on the definition.** A shallow copy isn't "a copy that doesn't one-to-one match the original." A shallow copy duplicates the top-level object but **shares the same nested references**. That shared reference *is* the bug the question asks you to demonstrate.

**Missing everything the rubric wanted**
- `clone()` copies only `title`/`name` — two scalars. The scenario's object has nested arrays of steps, retry policies, notification rules. None modeled, so deep vs shallow never comes up.
- No concrete shallow-copy bug shown. This was a required deliverable.
- No test for clone independence.

**Fix**
```javascript
class WorkflowTemplate {
  constructor(name, steps = [], retryPolicy = {}) {
    this.name = name;
    this.steps = steps;             // nested mutable → must deep copy
    this.retryPolicy = retryPolicy; // nested mutable → must deep copy
  }
  clone() {
    return new WorkflowTemplate(
      this.name,
      this.steps.map(s => ({ ...s })),   // deep enough for one level
      { ...this.retryPolicy }
    );
  }
}
```
The bug if you *don't* deep copy:
```javascript
const base = new WorkflowTemplate('base', [{ id: 1 }]);
const shallow = new WorkflowTemplate(base.name, base.steps); // shares steps
shallow.steps.push({ id: 2 });
base.steps.length; // 2 — editing customer B mutated customer A
```
Test = clone, mutate the clone's nested state, assert the original is unchanged. Share only immutable data (config constants, functions); copy anything mutable.

---

## Q5 — Singleton critique · 5/10

**Correct**
- Single point of failure and connection saturation are legitimate operational risks.
- "Use a pool" is the right production instinct.

**Missing the interview-level core (this is what the rubric tests)**
- **Hidden dependencies** — the big one. A global Singleton lets any code reach the DB without declaring it, so you can't see a class's real dependencies from its signature.
- **Test isolation** — global state leaks between tests; you can't substitute a fake without monkey-patching.
- **Single instance ≠ Singleton pattern.** You can have exactly one connection pool for the process *and* still inject it. The problem isn't one-ness; it's the hard-coded global access point. The rubric calls this out explicitly and the answer blurs it.
- Alternative is under-specified: name **dependency injection from a composition root** — construct one pool at startup, pass it (or a repository interface) into services.

Your answer argues mostly about runtime load, which is real but secondary to the design/testability argument an interviewer is fishing for.

---

## Q6 — Compare all five · 5/10

**Correct**
- Factory Method, Abstract Factory, and Prototype are each pinned to a distinct creation problem. AF "same family, complement each other" is good.

**Wrong / missing**
- **Singleton omitted entirely** — required, and the answer trails off mid-sentence with a stray `/`.
- Builder is vague: "you don't know what you need until you need it" isn't the creation problem. Builder = constructing **one complex object step by step**, often with validation, when a constructor would be unreadable.
- Sentence is cut off — incomplete submission.

**Model answer**
> Factory Method delegates creation of one product hierarchy to subclasses; Abstract Factory creates families of related products through one interface so the family stays consistent; Builder constructs a complex object step by step and validates it at the end; Prototype creates a new object by copying a configured existing one; Singleton restricts a class to a single globally accessible instance — convenient but risky in application code because it hides dependencies and hurts testability.

---

## What to study next

1. **Builder + Prototype** scored lowest — both because the *task* was misread, not because the pattern is hard. Re-read the scenario and produce the actual object the question names before writing methods.
2. **Wire factories into their clients.** Q1 and Q2 both stopped at "factory exists" without showing the client consuming it. The consumption is half the pattern.
3. **Singleton:** internalize *hidden dependencies* and *single-instance ≠ global Singleton*. Those two points separate a junior critique from an interview-level one.
4. **Finish answers** — Q3 explanation blank, Q6 cut off. Empty/partial answers forfeit easy rubric points.

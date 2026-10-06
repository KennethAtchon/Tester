# Writing courses for Recall

A course is a set of **units**, each with a few short **lessons**, and optional **Design Lab projects**. A lesson is a sequence of **steps**, shown one at a time like Brilliant: a short concept card, then something to do, with feedback after every answer.

Any course in this folder loads automatically when the app starts. To add a course without touching this folder, drop a `.json` file (or a plain-text quick course) onto the app window.

Check your work before opening the app:

```sh
node scripts/validate-course.mjs courses/system-design            # a whole course folder
node scripts/validate-course.mjs courses/system-design/units/03-estimation.json   # one file
```

The validator also *grades your own reference answers*. Every `text` model answer must pass its concepts, every `build` solution must pass its rules, and so on. If it fails, learners who write the right thing would fail too.

---

## Layout

A course is either one JSON file, or a folder:

```
courses/system-design/
  course.json                 metadata + the order of units and projects
  units/01-foundations.json   one file per unit
  projects/url-shortener.json one file per Design Lab project
```

`course.json`:

```json
{
  "id": "system-design",
  "title": "System Design, End to End",
  "tagline": "From requirements to a design you can defend.",
  "description": "…",
  "color": "#2f6df6",
  "units": ["units/01-foundations.json", "units/02-requirements.json"],
  "projects": ["projects/url-shortener.json"]
}
```

A single-file course has the same fields, with `units` and `projects` holding the objects inline instead of file names.

### Unit

```json
{
  "id": "requirements",
  "title": "Requirements",
  "description": "What to build, and how well it has to work.",
  "lessons": [ { "id": "…", "title": "…", "summary": "…", "minutes": 6, "steps": [ … ] } ]
}
```

### Project (Design Lab)

A project designs one real system end to end. Steps are grouped into **stages**, each graded, and the learner gets a scorecard at the end.

```json
{
  "id": "url-shortener",
  "title": "Design a URL Shortener",
  "summary": "Short links, billions of redirects.",
  "difficulty": "Beginner",
  "minutes": 25,
  "brief": "Product brief shown before the first stage…",
  "stages": [
    { "id": "requirements", "title": "Requirements", "steps": [ … ] },
    { "id": "estimation", "title": "Estimation", "steps": [ … ] },
    { "id": "api", "title": "API", "steps": [ … ] },
    { "id": "data", "title": "Data model", "steps": [ … ] },
    { "id": "design", "title": "High-level design", "steps": [ … ] },
    { "id": "deep-dive", "title": "Deep dives", "steps": [ … ] }
  ]
}
```

---

## Steps

Every step has an `id`, unique within its lesson or project, in kebab-case. Every gradable step needs a `why`: one or two sentences shown after the answer that explain the reasoning, not just the result. Optional on any gradable step: `hint` (one nudge), and `context` (a short scenario shown above the prompt).

Text fields support a little formatting: `**bold**`, `*italic*`, `` `code` ``, blank lines between paragraphs, and lines starting with `- ` for bullets. No HTML.

### concept: teach one idea

```json
{ "id": "what-is-lb", "type": "concept", "title": "Load balancers", "body": "A **load balancer** sits in front of a pool of servers…", "visual": { … } }
```

Keep `body` under about 60 words. Visuals (optional):

| `visual.kind` | Shape | Use for |
|---|---|---|
| `flow` | `{ "kind": "flow", "steps": ["Client", "DNS", "Load balancer", "App", "DB"] }` | A request path or pipeline |
| `diagram` | `{ "kind": "diagram", "nodes": [{ "id": "c", "type": "client", "x": 10, "y": 50, "label": "optional" }], "edges": [["c", "lb", "optional label"]] }` | Architecture. `x` and `y` run 0–100. `type` is a component (below). |
| `bars` | `{ "kind": "bars", "unit": "ns", "log": true, "items": [{ "label": "L1 cache", "value": 1 }] }` | Comparing magnitudes |
| `stats` | `{ "kind": "stats", "items": [{ "value": "99.9%", "label": "≈ 8.8 h down / year" }] }` | A few headline numbers |
| `compare` | `{ "kind": "compare", "left": { "title": "SQL", "points": ["…"] }, "right": { "title": "NoSQL", "points": ["…"] } }` | Two options side by side |
| `table` | `{ "kind": "table", "columns": ["…"], "rows": [["…"]] }` | Small reference tables |

### choice: pick one (or several)

```json
{
  "id": "lb-purpose", "type": "choice",
  "prompt": "What does a load balancer **not** do?",
  "options": ["Spread requests across servers", "Remove unhealthy servers from rotation", "Make the database faster", "Give clients one stable address"],
  "answer": "Make the database faster",
  "why": "A load balancer sits in front of app servers; it can't speed up the database behind them.",
  "misconceptions": { "Remove unhealthy servers from rotation": "Health checks are a core load-balancer job — that's how failed servers stop getting traffic." }
}
```

For several correct options, make `answer` an array. For true/false, use `"options": ["True", "False"]`. Give a `misconceptions` note for any wrong option people commonly pick.

### sort: put items into buckets

```json
{
  "id": "fr-vs-nfr", "type": "sort",
  "prompt": "Functional or non-functional?",
  "buckets": ["Functional", "Non-functional"],
  "items": [
    { "text": "Users can shorten a URL", "bucket": "Functional" },
    { "text": "Redirects take under 100 ms at p99", "bucket": "Non-functional", "why": "It describes how well, not what." }
  ],
  "why": "Functional = what the system does. Non-functional = how well it does it."
}
```

Use 5–8 items.

### order: put things in sequence

```json
{ "id": "request-path", "type": "order", "prompt": "Order the steps of a page load.", "items": ["DNS lookup", "TCP + TLS handshake", "HTTP request", "Server renders", "Browser paints"], "why": "…" }
```

Write `items` **in the correct order**; the app shuffles them. Use 4–6 items.

### match: pair things up

```json
{ "id": "match-stores", "type": "match", "prompt": "Match each need to a store.", "pairs": [["Full-text search", "Search index"], ["User sessions", "In-memory cache"]], "why": "…" }
```

Use 3–5 pairs, and keep the right-hand sides distinct.

### estimate: back-of-the-envelope number

```json
{
  "id": "write-qps", "type": "estimate",
  "prompt": "Average write QPS?",
  "given": [["Daily active users", "100M"], ["Writes per user per day", "1"], ["Seconds per day", "≈ 100K (86,400)"]],
  "answer": 1000, "unit": "writes/sec", "tolerance": 0.3,
  "solution": ["100M × 1 = 100M writes/day", "100M ÷ 100K s ≈ 1,000 writes/sec"],
  "why": "Round aggressively. Interviewers care about the order of magnitude and your reasoning, not the decimals."
}
```

Learners can type `1000`, `1k`, or `1e3`. An answer within `tolerance` (default 30%) counts as right, and within 2× gets partial credit. Use the same rounding the `solution` uses: 1 day ≈ 100K seconds.

### fill: complete the sentence

```json
{ "id": "cache-aside-fill", "type": "fill", "text": "On a read, the app checks the [[cache]] first. On a miss it reads the [[database]] and then [[writes the value to the cache|populates the cache]].", "bank": ["cache", "database", "writes the value to the cache", "queue"], "why": "…" }
```

`[[a|b]]` is a blank that accepts `a` or `b`. With a `bank`, learners tap words into blanks, so the first alternative of every blank must be in the bank; add one or two distractors. Without a bank, learners type the answer, and small typos are forgiven.

### text: explain in your own words (concept-graded)

```json
{
  "id": "why-stateless", "type": "text",
  "prompt": "Why do we keep app servers stateless?",
  "concepts": [
    { "label": "Any server can handle any request", "any": ["any server", "any instance", "interchangeable", "route anywhere"] },
    { "label": "Easy to add or remove servers", "any": ["scale horizontally", "add servers", "autoscal*", "remove servers"] },
    { "label": "State lives in a shared store", "any": ["shared store", "external store", "redis", "database", "session store"] }
  ],
  "pass": 2,
  "model": "Stateless servers keep sessions in a shared store such as Redis, so any server can handle any request. That makes it easy to add servers to scale horizontally, or remove failed ones, without losing user state.",
  "why": "…"
}
```

The grader expands common abbreviations (LB, DB, QPS, TTL…), ignores word endings and filler words, and counts a phrasing when all its words appear close together in any order. End a word with `*` to match by prefix (`autoscal*`). `re:` starts a regular expression. Give each concept **3–6 phrasings** a real person might write. `pass` is how many concepts are needed (default 60%). Learners can override a miss they think is wrong. **The `model` answer must pass.**

### api: design endpoints

```json
{
  "id": "shortener-api", "type": "api",
  "prompt": "Design the API.",
  "endpoints": [
    { "purpose": "Create a short link for a long URL", "method": "POST", "path": ["/urls", "/links", "/shorten"] },
    { "purpose": "Follow a short link", "method": "GET", "path": ["/{code}", "/urls/{code}"] }
  ],
  "why": "…"
}
```

For each purpose, the learner picks a method and types a path. Paths are compared segment by segment, ignoring `/api` and `/v1` prefixes, plurals, and how parameters are written (`{id}`, `:id`, `<id>`). List every reasonable path, and use an array for `method` if more than one is fine.

### build: draw the architecture (graph-graded)

```json
{
  "id": "shortener-hld", "type": "build",
  "prompt": "Wire up a design that serves 100K redirects/sec.",
  "palette": ["client", "dns", "cdn", "lb", "app", "cache", "db_sql", "db_nosql", "queue", "worker"],
  "start": { "nodes": [{ "id": "c", "type": "client", "x": 8, "y": 50 }], "edges": [] },
  "rules": {
    "nodes": [{ "type": "lb", "why": "One server can't take 100K requests/sec." }, { "type": "cache", "why": "Redirects are read-heavy and repeat." }],
    "edges": [{ "from": "app", "to": "cache", "why": "…" }],
    "paths": [{ "through": ["client", "lb", "app", "db"], "why": "A redirect must be able to reach the stored mapping." }],
    "forbidden": [{ "from": "client", "to": "db", "why": "Clients never talk to the database directly." }],
    "connected": true,
    "pass": 0.75
  },
  "solution": { "nodes": [ … ], "edges": [ … ] },
  "why": "…"
}
```

Connections are graded as links, not arrows, so direction doesn't matter. A `path` passes when some route visits the listed kinds in order; other components may sit between them. Each rule's `why` appears next to its ✓ or ✗. **The `solution` must pass every rule.**

Component types: `client`, `dns`, `cdn`, `lb`, `gateway`, `app`, `service`, `cache`, `db_sql`, `db_nosql`, `replica`, `object_store`, `queue`, `worker`, `search`, `id_gen`, `rate_limiter`, `ws`, `notify`, `stream`, `warehouse`, `auth`, `coordinator`.

In rules you can also use aliases: `db` (SQL or NoSQL), `datastore` (any database or replica), `storage` (databases + object storage), `entry` (load balancer or gateway), `compute` (app, service, worker), `async` (queue or stream), and `a|b` for either.

Nodes may carry a `label` (e.g. a `service` labelled "Feed service"); graders only look at `type`.

---

## Writing good lessons

- **Open with a question.** Ask before you explain; a wrong guess followed by feedback beats reading.
- **One idea per card.** Concept bodies under ~60 words. Alternate teach → do.
- **7–10 steps per lesson, at least 5 gradable, at least 3 different exercise types.**
- **Every wrong option should be plausible**, and the common ones get a `misconceptions` note.
- **`why` explains the reasoning** in one or two sentences, never "because that's the answer."
- **Use real numbers** and say where an approximation comes from.
- **Contrast near-misses.** Two things that look alike but differ in one way teach the boundary.

## Quick courses (plain text)

For flashcard-style material, paste or drop a `.txt` or `.md` file:

```
# Networking basics
## Ports
Q: Which port does HTTPS use by default?
- 80
* 443
- 22
Why: 443 is HTTPS; 80 is plain HTTP.

Q: What does DNS do?
A: Resolves a domain name to an IP address.

> A concept card: any line starting with > is shown as a short explanation.
```

`#` is the course title, `##` starts a lesson, `Q:` a question, `- ` a wrong option, `* ` the right option, `A:` a typed answer, `Why:` the explanation. Typed answers are graded on their key words.

## Older test files

Files in the original `{ "title", "tests": [{ "questions": [...] }] }` format still import: each test becomes a lesson and each question a step.

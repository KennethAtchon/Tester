# Recall

A desktop app for learning by doing, in the style of Brilliant. Courses are made of short interactive lessons: a quick idea, then something to do with it, with feedback after every answer. It ships with a full **System Design** course, from functional requirements through to a high-level design you build on a canvas and get auto-graded.

Under the games and streaks there's one learning engine: retrieval practice, spaced repetition (FSRS-5), interleaving, and feedback that explains why.

## Run

```sh
npm install
npm start
```

On first launch, four quick choices set things up: your goal, a daily pace, which **games** you want, and whether to start from the beginning or take a two-minute placement check. All of it can be changed later in **Practice** and **Settings**.

## The System Design course

Eight units, 33 lessons, and about 390 interactive steps, followed by four Design Lab projects:

- **Foundations**: The design process, Anatomy of a request, Latency and throughput, Scaling up vs scaling out
- **Requirements**: Functional requirements, Non-functional requirements, Access patterns and trade-offs
- **Back-of-the-envelope estimation**: Numbers to keep in your head, From users to QPS, Storage and bandwidth, Servers, caches, and sanity checks
- **API design**: Resources and methods, Pagination, filtering, and versioning, Idempotency, retries, and limits, Choosing a protocol
- **Data modeling and storage**: SQL or NoSQL?, Schemas, keys, and indexes, Designing for access patterns, Blobs, search, and the right tool
- **Building blocks**: Load balancers, Caching, When caches bite, CDNs and the edge, Queues and async work
- **Scaling the data layer**: Replication, Sharding, Consistency and CAP, Transactions across services, Unique IDs at scale
- **Reliability and operations**: Availability and redundancy, Handling failure, Rate limiting, Observability and SLOs

**Design Lab** projects take one system end to end: Requirements → Estimation → API → Data model → High-level design → Deep dives. Each stage is graded, and the scorecard shows where to tighten the design.

| Project | Level |
|---|---|
| Design a URL Shortener | Beginner |
| Design a Social News Feed | Intermediate |
| Design a Chat App | Intermediate |
| Design a Video Streaming Platform | Advanced |

Each project has two modes. **Guided** gives feedback and hints as you go. **Interview** gives you 45 minutes with no hints, and all the feedback comes at the end. Either way, **Export for AI review** saves the whole design as Markdown under `results/design-lab/` if you want a second opinion.

## Exercise types

| Type | What you do | How it's graded |
|---|---|---|
| Learn | Read a short idea with a visual: a flow, a diagram, bars, stats, a comparison, or a table | Not graded |
| Choose | Pick one or several options | Answer key. Wrong options can carry a "why not" note |
| Sort | Drag items into buckets | Per item, with partial credit |
| Sequence | Put steps in order | Partial credit for how much is already in the right relative order |
| Match | Pair left with right | Per pair |
| Estimate | Back-of-the-envelope number (`1.2k`, `3M` and `1e6` all work) | Within 30% is right and within 2× gets partial credit. Shows a log-scale number line and the worked solution |
| Fill in | Complete a sentence by tapping a word bank or typing | Per blank. Typed blanks forgive small typos |
| Explain | Write an answer in your own words | Checked for key **concepts**, not exact words (see below). You can override a miss |
| Design the API | Pick a method and write a path for each purpose | Ignores `/api` and `/v1` prefixes, plurals, and `{id}`, `:id` or `<id>` styles |
| Build | Draw an architecture: add components from a palette, then drag from a box's ● to another box to connect them | Checked as a graph: required components, connections, request paths, and connections that must not exist. Each check explains itself, and you can compare against a reference design |
| Code | Write JavaScript and run it against tests (from imported question banks) | Test cases in a sandboxed child process |

### How grading works, with no AI

Every grader is deterministic and runs offline in `src/renderer/domain/`:

- **Written answers** (`textGrader.js`): each concept lists several phrasings a person might write. The grader expands abbreviations (LB, DB, QPS, TTL…), ignores word endings and filler words, and counts a phrasing when all its words appear close together in any order. A phrasing can also use a `prefix*` wildcard or a regular expression. You get credit for each concept covered and pass at a set threshold. If you think a miss is wrong, you can override it.
- **Architecture** (`architecture.js`): your diagram is treated as an undirected graph. Rules can require a component (`cache`), a connection (`app ↔ cache`), a path that passes through components in order (`client → lb → app → db`), forbidden shortcuts (`client ↔ db`), and that every component is connected. Aliases such as `db` (any database), `entry` (load balancer or gateway), and `compute` keep rules flexible.
- **Estimates, API paths, sorting, sequencing, matching and blanks** (`grading.js`): each has its own grader, with partial credit where it makes sense.

The course validator grades every reference answer with these same graders, so a model answer that wouldn't pass is caught before it reaches a learner (see [Writing courses](#writing-courses)).

## Games

All the games run on the same memory model, so whatever you learn in one shows up in the others. You choose which ones appear on Home.

| Game | What it is |
|---|---|
| **Guided lessons** | The course path. Missed steps come back at the end of the lesson. Earn up to three stars per lesson |
| **Daily review** | Spaced repetition. Rate your confidence, then grade Again / Hard / Good / Easy, and each card comes back when you're about to forget it |
| **Design Lab** | Full system designs, graded stage by stage |
| **Lightning round** | 60 seconds of rapid-fire questions on cards you've already learned. Build a combo |
| **Sort & Match** | Sorting, matching and sequencing puzzles, interleaved across topics |
| **Estimation dojo** | Five back-of-the-envelope estimates, scored by how close you get |
| **Boss battles** | Ten mixed questions per unit, with three lives. Unlocks when you finish the unit |

Around them sit XP and levels, a daily XP goal with a streak (and streak freezes), three daily quests, badges for mastery and milestones, combos, sounds you can turn off, and confetti for real milestones. XP is paid for effortful correct answers, never for time spent.

### The learning techniques underneath

- **Retrieval first.** Lessons open with a question before they explain. In review, *Recall before options* hides the choices until you've tried to answer.
- **Feedback that explains.** Every answer shows a short *why*. A wrong option you picked can carry a "why not" note, and builds and written answers show a checklist.
- **Self-explanation.** After some correct answers, you're asked to explain why before you see the explanation.
- **Spaced repetition** with FSRS-5, tuned to a target retention (90% by default).
- **Confidence ratings** in reviews. Confident mistakes are flagged, because correcting them sticks best.
- **Hints with a cost.** A hint costs XP and caps the grade.
- **Mistake notebook.** Every miss with your answer, the right answer and why, your top confusions, and a drill. An entry clears when you get it right on a later day.
- **Insights.** Calibration, recall by gap, your forgetting curve, the review forecast, and a practice calendar.

## Adding courses

Adding a course is one step:

- **Drop a file anywhere on the window**: course JSON, an older test file, or plain-text notes (`.txt` or `.md`).
- **Library → Choose file…** opens the same thing through a file picker.
- **Library → Paste notes**: paste plain-text Q/A and see a live preview before you create the course.
- **The courses folder** (`courses/`, or **Settings → Open folder**): anything in it loads automatically on every launch. That's where the System Design course lives.

The quickest format is plain text:

```
# Networking basics
## Ports and protocols
Q: Which port does HTTPS use by default?
- 80
* 443
- 22
Why: 443 is HTTPS; 80 is plain HTTP; 22 is SSH.

Q: What does DNS do?
A: Resolves a domain name to an IP address.

> Lines starting with > become short concept cards.
```

Older `{ "title", "tests": [{ "questions": [...] }] }` question banks still import: each test becomes a lesson and each question a step. Answer keys, explanations, the first hint, rubrics, misconception notes and runnable code tests carry over.

## Writing courses

The full schema, covering every step type, visual, grading rule and component type, is in [`courses/README.md`](courses/README.md). Check a course before opening the app:

```sh
node scripts/validate-course.mjs courses/system-design
```

The validator checks structure and also **grades the reference answers**: every written model answer must pass its own concepts, and every reference design must pass its own rules and use only components from its palette.

## Your data

Progress (memory state, review log, mistakes, XP, streak, badges, settings) is saved to `learning-progress.json` in Electron's user-data folder. The exact path is shown in **Settings**. It's kept out of the repo on purpose. Courses you add are stored with your progress, so they're there on the next launch.

## Architecture

There's no build step: the renderer is vanilla ES modules under `src/renderer/`, with CodeMirror 5 vendored.

- `app.js` is the entry point. It loads progress and the built-in courses, applies the theme, rolls the streak forward, sends first-time learners to setup, and handles dropped files.
- `domain/` holds pure logic with no DOM:
  - `courseFormat.js` parses course JSON, folders, quick text and older test files.
  - `grading.js`, `textGrader.js` and `architecture.js` are the graders.
  - `fsrs.js` is the scheduler.
  - `games.js` defines the games, goals and daily goals.
  - `rewards.js` handles XP, levels and badges.
  - `insights.js` computes the analytics.
  - `normalize.js` reads older test files.
- `state/`:
  - `progress.js` holds persistent learner data.
  - `catalog.js` maps courses → units → lessons → items.
  - `learner.js` handles memory, mastery, mistakes, streak and rewards. Every answer goes through `recordAttempt`.
  - `sessions.js` builds every kind of play.
  - `quests.js` runs the daily quests.
- `ui/`:
  - `player.js` runs any play (lesson, review, project or game) one step at a time.
  - `exercises/` holds one factory per step type, plus the diagram and build canvas.
  - `views/` holds one module per screen.
  - The shared pieces are `components.js`, `charts.js`, `rail.js`, `router.js`, `theme.js` and `toast.js`.
- `lib/` has DOM helpers, light Markdown (`markup.js`), sound effects and confetti.
- `styles/app.css` is the design system: light and dark tokens, then layout per screen.

The main process exposes a small file API over IPC (`src/preload.js` → `window.testFiles`). It lists built-in courses, opens a course file, opens the courses folder, saves Markdown, loads and saves progress, and runs code (`src/runner/`).

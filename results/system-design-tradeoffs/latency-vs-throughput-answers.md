# Latency vs Throughput Answers

## Review Request

Please grade these answers, explain what is correct or incorrect, and create a results Markdown file with suggested improvements.

## Test Metadata

- Library: System Design Trade-offs
- Source: /Users/ken/Documents/workspace/sandbox/test/examples/system-design-tradeoffs-test.json
- Topic: System Design Fundamentals
- Questions answered: 6 of 6
- Exported: 6/21/2026, 7:34:28 PM

## Instructions

Be quantitative. Where a relationship exists (e.g. Little's Law), state it.

## Answers

### 1. Define latency and throughput, and give the typical unit for each.

**Question type:** short_answer

**Reviewer Grading Notes:**

_Expected answer_
Latency is the time to complete one operation end-to-end (units: seconds/ms, often reported as p50/p99). Throughput is the number of operations completed per unit time (units: requests/sec, ops/sec, MB/s).

_Rubric_
- Latency = time per single operation, time units
- Throughput = work per unit time, rate units
- Bonus: notes latency is often reported as a percentile distribution, not a mean

_Common mistakes_
- Calling throughput 'speed' without specifying per-unit-time
- Reporting latency only as an average instead of a percentile

**Answer:**

Latency is how long it takes for an operation to complete. Throughput is how long it takes for n number of inputs to be processed in t number of time.

### 2. Throughput is simply 1 / latency.

**Question type:** true_false

> **Grading directive:** Selection-only question. The interface captures the choice and nothing else — there is no field for the user to explain it. Grade solely on whether the selection is correct. Do NOT deduct points for a missing written justification, even if the test-level instructions ask for explanations.

**Reviewer Grading Notes:**

_Expected answer_
False

_Rubric_
- Recognizes the answer is False
- Explains that concurrency/parallelism and batching decouple them: many in-flight requests give high throughput even with high per-request latency

**Answer:**

True

### 3. State Little's Law and name what each term means.

**Question type:** short_answer

**Reviewer Grading Notes:**

_Expected answer_
L = λ × W: the average number of items in the system (L, concurrency) equals the arrival/throughput rate (λ) times the average time each item spends in the system (W, latency).

_Rubric_
- Gives L = λ × W (or equivalent concurrency = throughput × latency)
- Correctly identifies L as items-in-system/concurrency
- Identifies λ as throughput/arrival rate and W as latency/residence time

**Answer:**

I dont know Little's law.

### 4. Adding batching to a write pipeline raised throughput from 10k to 60k writes/sec but raised p99 latency from 5ms to 90ms. Explain the mechanism, and describe a scenario where this trade is good and one where it is bad.

**Question type:** long_answer

**Reviewer Grading Notes:**

_Rubric_
- Explains batching amortizes fixed per-op cost (syscalls, round trips, fsync) across many items, raising throughput
- Explains items now wait to fill a batch / flush interval, raising per-item latency
- Good case: bulk/async ingestion, analytics, logging where end-to-end latency is not user-facing
- Bad case: interactive/synchronous request path where users feel the added wait

_Weak spots tested_
- Claiming batching is strictly better without naming the latency cost
- Not tying the latency increase to queueing/flush-interval delay

**Answer:**

Batching is when you put off processing a single unit, to be able to process a bunch of units at the same time. Batching can be helpful to be able to process more data in less time. The reason why the P99 latency has been raised, however, is because that user's request is being batched, which means the user has to wait for the batch to complete, depending on other user's requests. Batching is helpful for async operations, where the user doesn't need an immediate response. For operations that can be done fast, I believe batching isn't that necessary.

### 5. A video-encoding farm processes a fixed backlog of files overnight; no one watches it run. Which metric should you optimize?

**Question type:** single_choice

> **Grading directive:** Selection-only question. The interface captures the choice and nothing else — there is no field for the user to explain it. Grade solely on whether the selection is correct. Do NOT deduct points for a missing written justification, even if the test-level instructions ask for explanations.

**Reviewer Grading Notes:**

_Expected answer_
Throughput — total jobs finished per hour matters; per-file latency is irrelevant since nothing is waiting on an individual result.

**Answer:**

Throughput — maximize files completed per hour

### 6. Why can a service with excellent average latency still deliver a poor user experience, and why does tail latency get worse as a request fans out to many backends?

**Question type:** long_answer

**Reviewer Grading Notes:**

_Rubric_
- Explains averages hide the slow tail; many users hit p95/p99, and a single user makes many requests so they likely hit a slow one
- Explains fan-out: a request waiting on N parallel backends is as slow as the slowest of N, so the effective latency tracks a high percentile of each backend
- Bonus: quantifies (e.g. if each backend is slow 1% of the time, 100-way fan-out is slow ~63% of the time)

_Weak spots tested_
- Conflating mean and percentile
- Missing the 'slowest-of-N' effect in fan-out

**Answer:**

I don't really know what tail latency is but to answer the question, there could be added latency in the fan out process for requests I think. I dont know how to answer this one.

# Performance vs Scalability Answers

## Review Request

Please grade these answers, explain what is correct or incorrect, and create a results Markdown file with suggested improvements.

## Test Metadata

- Library: System Design Trade-offs
- Source: /Users/ken/Documents/workspace/sandbox/test/examples/system-design-tradeoffs-test.json
- Topic: System Design Fundamentals
- Questions answered: 5 of 5
- Exported: 6/21/2026, 7:28:45 PM

## Instructions

Answer from memory. Be precise about which property a problem is really testing. Use concrete numbers or examples where they sharpen the point.

## Answers

### 1. Define performance and scalability in one sentence each, so the difference is unambiguous.

**Question type:** short_answer

**Reviewer Grading Notes:**

_Expected answer_
Performance is how fast the system handles a single unit of work (or its responsiveness under a fixed load); scalability is the system's ability to keep that performance acceptable as load, data, or users grow — usually by adding resources.

_Rubric_
- Performance framed around a fixed/current load or single request
- Scalability framed around growth in load/data/users
- Mentions adding resources or capacity for scalability
- Does not use one term to define the other

_Common mistakes_
- Treating 'fast' and 'scalable' as synonyms
- Defining scalability purely as 'handles more users' without the 'while keeping performance acceptable' clause

**Answer:**

Performance as fast your system is to run for a single user, while scalability is how fast your system is once their are more users using your product.

### 2. A widely-cited rule of thumb states: 'If your system is slow for a single user, you have a ___ problem. If it is fast for one user but slow under load, you have a ___ problem.'

**Question type:** single_choice

> **Grading directive:** Selection-only question. The interface captures the choice and nothing else — there is no field for the user to explain it. Grade solely on whether the selection is correct. Do NOT deduct points for a missing written justification, even if the test-level instructions ask for explanations.

**Reviewer Grading Notes:**

_Expected answer_
performance; scalability

**Answer:**

performance; scalability

### 3. A change that improves scalability can make single-request performance worse.

**Question type:** true_false

> **Grading directive:** Selection-only question. The interface captures the choice and nothing else — there is no field for the user to explain it. Grade solely on whether the selection is correct. Do NOT deduct points for a missing written justification, even if the test-level instructions ask for explanations.

**Reviewer Grading Notes:**

_Expected answer_
True

_Rubric_
- Recognizes the answer is True
- Bonus: gives an example (e.g. sharding/replication adds network hops or coordination overhead per request)

**Answer:**

False

### 4. Which of the following are ways to scale a system? Select all that apply.

**Question type:** multiple_choice

> **Grading directive:** Selection-only question. The interface captures the choice and nothing else — there is no field for the user to explain it. Grade solely on whether the selection is correct. Do NOT deduct points for a missing written justification, even if the test-level instructions ask for explanations.

**Reviewer Grading Notes:**

_Expected answer_
Vertical scaling, horizontal scaling, and partitioning/sharding the data are all scaling strategies. Rewriting a hot function in C is a performance optimization, not scaling.

**Answer:**

- Vertical scaling (bigger machine)
- Horizontal scaling (more machines)
- Sharding / partitioning the data

### 5. A checkout service responds in 80ms at 100 req/s. At 5,000 req/s, p99 climbs to 4s and error rates spike. Walk through how you'd determine whether this is a performance problem, a scalability problem, or both — and how the fix differs in each case.

**Question type:** long_answer

**Reviewer Grading Notes:**

_Rubric_
- Notes that single-request 80ms baseline means raw performance is fine, so the symptom points at scalability under load
- Proposes measuring resource saturation (CPU, memory, connection pools, DB locks, queue depth) to find the bottleneck
- Distinguishes 'optimize the unit of work' (perf fix) from 'add capacity / remove contention / shard' (scalability fix)
- Mentions that a perf optimization can also raise the ceiling, so the two are related but not identical

_Weak spots tested_
- Jumping straight to 'add more servers' without identifying the bottleneck
- Assuming a slow p99 always means slow code rather than contention/queueing

**Answer:**

A jump from 100 req to 5000 req per second is a 50 times increase in traffic. If it takes 4s (4000 ms) thats an equal 50 times increase in traffic. This makes me assume that for every 100 extra request, the system takes double the amount of time to run and it scales linearly. I think this is a scalability problem because the system isn't scaling well with more users.

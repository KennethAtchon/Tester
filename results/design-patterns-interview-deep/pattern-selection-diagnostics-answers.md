# Pattern Selection Diagnostics Answers

## Review Request

Please grade these answers, explain what is correct or incorrect, and create a results Markdown file with suggested improvements.

## Test Metadata

- Library: Design Patterns Interview Deep Test
- Source: /Users/ken/Documents/workspace/sandbox/test/examples/design-patterns-interview-deep-test.json
- Topic: Design Patterns: Intent and Tradeoffs
- Questions answered: 6 of 6
- Exported: 5/30/2026, 11:34:58 PM

## Instructions

Answer without looking anything up. For every answer, explain why your choice fits and why at least one tempting alternative does not. This section exposes whether you can select patterns from problem forces instead of matching names to definitions.

## Answers

### 1. Which statements correctly describe the three major design-pattern groups?

**Question type:** multiple_choice

**Question Context:**

_Requirements_
- Select every true statement.
- For each selected statement, give one concrete pattern example.
- For each unselected statement, explain the misconception.

_Source_
Refactoring Guru classifies patterns by intent into creational, structural, and behavioral groups: https://refactoring.guru/design-patterns/classification

**Reviewer Grading Notes:**

_Expected answer_
The first three statements are correct; the fourth is false. Some patterns can improve performance in specific contexts, such as Flyweight, but performance is not the defining intent of the creational group.

_Rubric_
- Correctly selects the first three options only.
- Maps examples accurately, such as Factory Method to creational, Adapter to structural, and Observer to behavioral.
- Explains intent rather than memorized category names.
- Does not claim patterns are mainly performance optimizations.

_Weak spots tested_
- Confusing category labels with implementation mechanics.
- Treating patterns as performance tools instead of design vocabulary.

**Answer:**

- Behavioral patterns primarily distribute responsibilities and communication between objects.
- Structural patterns primarily organize objects/classes into larger object structures.
- Creational patterns primarily control object creation and construction decisions.

### 2. You need to create different notification objects based on user preference: email, SMS, or push. Each object is simple, but the calling code should not know concrete classes. Which pattern is the best first fit?

**Question type:** single_choice

**Question Context:**

_Requirements_
- Pick one answer.
- Explain what problem force makes it fit.
- Explain when Builder would become a better answer.

**Reviewer Grading Notes:**

_Expected answer_
Factory Method is the best fit because the central problem is choosing a product subtype while hiding concrete classes from client code. Builder becomes more attractive when object construction has many independent steps, optional parts, or construction order concerns.

_Rubric_
- Chooses Factory Method.
- Mentions decoupling client code from concrete product classes.
- Clearly distinguishes product selection from step-by-step construction.
- Does not use Builder just because the word create appears.

_Weak spots tested_
- Overusing Builder for every construction problem.
- Missing the difference between selecting a subtype and assembling an object.

**Answer:**

Factory Method

### 3. A team wraps a legacy payment SDK behind `PaymentGateway.charge(amount, token)`. Internally the SDK still has eight calls, token refresh, retries, and vendor-specific exceptions. Is this Adapter, Facade, both, or neither? Defend your answer.

**Question type:** long_answer

**Question Context:**

_Answer format_
Write 2-4 paragraphs. Name the forces that would make Adapter the better label and the forces that would make Facade the better label.

**Reviewer Grading Notes:**

_Expected answer_
A strong answer says it can be both depending on the primary intent. It is Facade if the goal is simplifying a complex subsystem behind a narrow API. It is Adapter if the goal is making an incompatible vendor interface conform to the application's expected `PaymentGateway` interface. In many real systems a wrapper can play both roles, but interview answers should identify the dominant force.

_Rubric_
- Recognizes Facade as simplification of a complex subsystem.
- Recognizes Adapter as interface compatibility between otherwise incompatible APIs.
- Explains that real implementations can combine roles without making the concepts identical.
- Avoids saying pattern labels are determined only by class names.

_Weak spots tested_
- Treating patterns as mutually exclusive code shapes.
- Ignoring intent and problem context.

**Answer:**

This is using the facade design pattern. The user has to onboard their provider and all they have to do to charge a user is to call that charge command with their amount and token. The SDK hides the rest of the implement like the eight calls, token refresh, and retry logic. It will handle all the heavy lifting and return to the user if it failed or succeed. This is not an adapter because it doesn't configure something to be used by something else. An adapter is like you have a pipe object, you need to adapt it to work with a different pipe object. They both do the same thing, but u want to make sure they work together.

### 4. A document editor has `Draft`, `Review`, and `Published` modes. The same `publish()` call behaves differently per mode, and successful calls transition the document to another mode. Which pattern best models this?

**Question type:** single_choice

**Question Context:**

_Requirements_
- Pick one answer.
- Name the detail in the prompt that distinguishes it from Strategy.
- Describe one sign that Strategy would be the better answer instead.

**Reviewer Grading Notes:**

_Expected answer_
State is the best answer because behavior depends on the object's current mode and operations can transition the object to a new mode. Strategy is better when the client chooses an interchangeable algorithm and the algorithm choice does not represent the host object's lifecycle state.

_Rubric_
- Chooses State.
- Mentions lifecycle mode and transitions.
- Contrasts with interchangeable algorithm selection in Strategy.
- Avoids saying Strategy and State are identical because both use composition.

_Weak spots tested_
- Confusing same implementation shape with same intent.
- Missing state transitions as the key clue.

**Answer:**

State

### 5. You see a `UserNameFactoryBuilderProviderSingleton` used to create a string after trimming whitespace. What is wrong with this design, and how would you refactor it?

**Question type:** long_answer

**Question Context:**

_Answer format_
Answer like you are in a code review. Be concrete and propose the simplest replacement.

**Reviewer Grading Notes:**

_Expected answer_
A good answer flags speculative generality and pattern overuse. Trimming and validating a string probably needs a simple function, value object, or inline validation depending on reuse and invariants. The refactor should remove fake abstractions, keep behavior explicit, and preserve any real domain rules.

_Rubric_
- Identifies overengineering instead of praising pattern usage.
- Proposes a simpler function or focused value object based on actual invariants.
- Mentions preserving tests/behavior while removing accidental complexity.
- Avoids replacing one unnecessary pattern stack with another.

_Weak spots tested_
- Believing more pattern names means better architecture.
- Not separating domain invariants from incidental ceremony.

**Answer:**

Why are we declaring this object that uses a bunch of different design patterns? And why are we doing this just for creating a username? Whats the complexity thats being resolved with the design patterns? This seems like added complexity that shouldn't exist in the system. Don't use design patterns just for the sake of using them, they have to solve a problem.

### 6. True or false: In an interview, it is usually enough to name the pattern that fits a problem. The implementation details are secondary.

**Question type:** true_false

**Question Context:**

_Requirements_
- Choose true or false.
- Justify with what an interviewer is really testing.
- Give one example of a pattern answer that would be weak even if the pattern name is correct.

**Reviewer Grading Notes:**

_Expected answer_
False. Interviewers usually test whether you understand forces, tradeoffs, boundaries, and failure modes. A candidate can name Strategy correctly but fail by not explaining how clients choose strategies, where state lives, how to test each algorithm, or why a simple function map may be enough.

_Rubric_
- Answers false.
- Explains that reasoning and tradeoffs matter more than vocabulary.
- Provides a concrete weak-answer example.
- Shows awareness of overengineering risk.

**Answer:**

False

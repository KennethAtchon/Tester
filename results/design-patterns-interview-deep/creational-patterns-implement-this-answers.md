# Creational Patterns: Implement This Answers

## Review Request

Please grade these answers, explain what is correct or incorrect, and create a results Markdown file with suggested improvements.

## Test Metadata

- Library: Design Patterns Interview Deep Test
- Source: /Users/ken/Documents/workspace/sandbox/test/examples/design-patterns-interview-deep-test.json
- Topic: Factory Method, Abstract Factory, Builder, Prototype, Singleton
- Questions answered: 6 of 6
- Exported: 6/1/2026, 7:54:35 PM

## Instructions

This section is intentionally code-heavy. Write JavaScript or TypeScript-like pseudocode. Focus on object boundaries, dependency direction, and testability. Do not hide behind prose only.

## Answers

### 1. Implement a Factory Method-style solution for importing files from CSV and JSON without `ImportJob` knowing concrete parser classes.

**Question type:** long_answer

**Question Context:**

_Scenario_
`ImportJob` receives a file path and should parse records. Today it has `if (ext === '.csv')` and `if (ext === '.json')` branches mixed with job orchestration. You expect XML later, but not yet.

_Requirements_
- Show the creator/factory method boundary.
- Keep `ImportJob.run()` focused on orchestration.
- Make the answer easy to unit test without real file IO.
- Do not implement XML unless your design shows how it would be added later.

_Constraints_
- Avoid global mutable registries unless you justify them.
- Avoid a giant switch inside `run()`.
- A small switch in a dedicated factory is acceptable if you explain the tradeoff.

_Starter code_
```javascript
class ImportJob {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async run() {
    // Remove concrete parser selection from this method.
  }
}

class CsvParser {
  async parse(filePath) { return []; }
}

class JsonParser {
  async parse(filePath) { return []; }
}
```

_Answer format_
Provide code plus a short explanation of why this is Factory Method rather than Builder or Abstract Factory.

**Reviewer Grading Notes:**

_Expected answer_
A strong answer extracts parser creation into a factory method on a creator class or into a dedicated factory dependency, so `run()` asks for a parser through an abstraction and then orchestrates parsing. It should keep parser implementations swappable and testable. It should not overcomplicate the design with Abstract Factory unless families of related products exist.

_Rubric_
- Separates product creation from job orchestration.
- Uses a parser interface/protocol clearly, even if in JS pseudocode.
- Keeps future XML extension localized.
- Explains why Builder and Abstract Factory are not the main fit.
- Includes testability through dependency injection or a small overrideable factory method.

_Red flags_
- Leaves file type branching in `run()`.
- Uses Singleton for parsers without a reason.
- Builds a plugin framework for two parsers without explaining the cost.

**Explanation:**

We can use the factory method to dynamically create the right csv or json object for importjob to use. This is better than creating each object and having the run() handle the logic between choosing which one to use.

**Submitted code:**

```javascript
class ImportJob {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async run() {
    // Remove concrete parser selection from this method.
  }
}


class Parser {
  async parse(filePath) { return []; }
}

class CsvParser extends Parser {
  async parse(filePath) { return []; }
}

class JsonParser extends Parser {
  async parse(filePath) { return []; }
}

const ParserFactory = (type) : Parser => {
  if(type == 'csv'){
    return new CsvParser();
  } else {
    return new Jsonparser();
  }
}
```

### 2. Design an Abstract Factory for rendering platform-specific UI controls for Web and Native without mixing control families.

**Question type:** long_answer

**Question Context:**

_Scenario_
A cross-platform settings screen needs `Button`, `Toggle`, and `TextInput`. Web controls must use DOM events. Native controls must use native event bridges. Mixing a Web button with a Native toggle in the same screen should be impossible or very obvious in code review.

_Requirements_
- Define the abstract factory interface.
- Define at least two concrete factories.
- Show client code that receives the factory and builds the screen.
- Explain the product-family invariant.

_Answer format_
Code-first answer. Then explain how this differs from Factory Method.

**Reviewer Grading Notes:**

_Expected answer_
A strong answer defines a UI factory with methods such as `createButton`, `createToggle`, and `createTextInput`, then implements `WebUIFactory` and `NativeUIFactory`. Client code depends on the abstract factory and receives a consistent product family. The key distinction from Factory Method is creating families of related products, not just one product hierarchy.

_Rubric_
- Creates multiple related product types through one factory interface.
- Maintains family consistency across Web and Native products.
- Keeps client code unaware of concrete products.
- Contrasts correctly with Factory Method.

_Weak spots tested_
- Using a single method factory and calling it Abstract Factory.
- Forgetting the related-family constraint.

**Explanation:**

It differs from the factory method because of what its doing. A regular factory has a purpose: to return a canonical object. For example, in an broker factory, the factory job is just to return a broker. For an abstract factory, the factory can create one of many objects that are related to one another. It vends similarly linked objects.

**Submitted code:**

```typescript
// Web Family
class WebButton {}
class WebToggle {}
class WebTextInput {}

// Native Family
class NativeButton {}
class NativeToggle {}
class NativeTextInput {}

class PlatformFactory {
  createButton() {}
	createToggle() {}
  createTextInput {}
}

class WebFactory extends PlatformFactory {
  createButton(){
    return new WebButton();
  }
  createToggle(){
    return new WebToggle();
  }
  createTextInput(){
    return new WebTextInput();
  }
}

class NativeFactory extends PlatformFactory {
  createButton(){
    return new NativeButton();
  }
  createToggle(){
    return new NativeToggle();
  }
  createTextInput(){
    return new NativeTextInput();
  }
}

web = new WebFactory();
native = new NativeFactory();

button = web.createButton();
button2 = native.createButton();
```

### 3. Implement a Builder for a search query object with optional filters, sorting, pagination, and validation.

**Question type:** long_answer

**Question Context:**

_Scenario_
A search API accepts many optional parameters. Call sites currently pass huge object literals, and invalid combinations are common: `pageSize` without `page`, descending sort without a sort field, and both `createdBefore` and `createdAfter` in the wrong order.

_Requirements_
- Make common valid construction readable.
- Centralize validation in `build()` or equivalent.
- Show at least two call-site examples.
- Explain why a plain object may be enough in simpler cases.

_Starter code_
```typescript
type SearchQuery = {
  text: string;
  tags?: string[];
  sortBy?: 'createdAt' | 'relevance';
  sortDirection?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  createdAfter?: Date;
  createdBefore?: Date;
};
```

**Reviewer Grading Notes:**

_Expected answer_
A strong answer uses fluent or stepwise builder methods and validates cross-field invariants at build time. It should show readable call sites and avoid pretending Builder is required for every object literal. For TypeScript, a staged builder can get extra credit if it prevents some invalid states at compile time without becoming unreadable.

_Rubric_
- Centralizes construction and validation.
- Handles optional fields without long parameter lists.
- Demonstrates readable client code.
- Discusses when not to use Builder.
- Does not hide validation in scattered setters.

**Explanation:**

_No answer provided._

**Submitted code:**

```typescript
type SearchQuery = {
  text: string;
  tags?: string[];
  sortBy?: 'createdAt' | 'relevance';
  sortDirection?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  createdAfter?: Date;
  createdBefore?: Date;
};

class SearchBuilder {
  
  constructor(){
    this.query = ""
  }
  
  addText(text){
    this.query += "?q=" + text;
    return this;
  }
  
  addTag(tag){
    this.query += "?tag=" + tag;
    return this
  }
  
  sort(sortBy, sortDirection){
    this.query += "?sortby=" + sortBy + "?sortdirection=" + sortDirection;
    return this
  }
  
  filterPage(page, pageSize){
    console.log("same as the others")
    return this
  }
  
  created(createdBefore, createdAfter){
    console.log("same as the others")
    return this
  }
  
}

searcher = SearchBuilder();

query = searcher.addText("hello").addTag("world").sort("justinbieber", 'katieperry').filterPage(1, 10).created('October 8', 'May 10');
```

### 4. You need to clone a configured workflow template and customize a few fields per customer. Design a Prototype-based approach and identify the dangerous shallow-copy edge case.

**Question type:** long_answer

**Question Context:**

_Scenario_
A `WorkflowTemplate` has nested arrays of steps, retry policies, and notification rules. New customers often start from the same base workflow but customize individual nested rules.

_Requirements_
- Show a `clone()` or equivalent prototype operation.
- Explain what must be deep copied and what can be shared.
- Show one bug that happens if nested mutable objects are shared accidentally.
- Explain how you would test the clone behavior.

**Reviewer Grading Notes:**

_Expected answer_
A strong answer uses cloning to avoid recreating a complex configured object from scratch, but it carefully distinguishes immutable shared data from mutable nested state. It should call out that shallow copying nested arrays or objects can cause edits in one customer workflow to mutate another customer's workflow.

_Rubric_
- Uses prototype cloning for a preconfigured object.
- Identifies nested mutable state as the main correctness risk.
- Shows a concrete shallow-copy bug.
- Includes tests proving clone independence where needed.

**Explanation:**

A shallow copy is a copy that doesn't one to one match the original object. This can be dangerous because it could cause the program to misbehave and be very difficult to debug by the programmer because the programmer doesn't know how the object works under the hood. What must be deep copied is the steps, the state, and inflight items, what can be shared is functions.

**Submitted code:**

```javascript
class WorkflowTemplate {
  
  constructor(title, name){
    this.title = title
    this.name = name
  }
  
  clone(){
    return new WorkflowTemplate(this.title, this.name)
  }
}
```

### 5. A candidate proposes a Singleton `DatabaseConnection` because every service needs the database. Critique the design in interview-level detail.

**Question type:** long_answer

**Question Context:**

_Requirements_
- List at least three risks.
- Explain when a singleton-like lifecycle can still be acceptable.
- Propose a more testable alternative for application code.
- Be precise about global state vs single instance.

**Reviewer Grading Notes:**

_Expected answer_
A strong answer distinguishes having one configured instance in the composition root from hard-coding a global Singleton. Risks include hidden dependencies, test isolation problems, lifecycle/order issues, concurrency/resource cleanup concerns, and difficulty substituting fakes. A dependency-injected connection pool or repository interface is usually more testable.

_Rubric_
- Does not reflexively say Singleton is always evil or always good.
- Names concrete risks around global access and tests.
- Distinguishes single instance lifetime from Singleton pattern mechanics.
- Proposes dependency injection/composition root as an alternative.

_Weak spots tested_
- Missing the hidden dependency problem.
- Confusing process-wide resource ownership with direct global access.

**Answer:**

A singleton database connection can pose a wide array of issues. If we had a bunch of services connected to a single database connection it could easily overwhelm the connection and cause reliability issue with the database. For database connection, there should be a pool, the pool can allow multiple services to connect to multiple different database. A single database connection also introduces a signal point of failure, if this connection were to ever go down, then all the relying services will go down with it.

### 6. In one dense paragraph, compare Factory Method, Abstract Factory, Builder, Prototype, and Singleton by the specific creation problem each solves.

**Question type:** short_answer

**Reviewer Grading Notes:**

_Expected answer_
Factory Method delegates creation of one product hierarchy; Abstract Factory creates families of related products; Builder constructs complex objects step by step; Prototype creates new objects by copying an existing configured object; Singleton restricts a class to one globally accessible instance, which is often risky in application code.

_Rubric_
- One precise creation problem per pattern.
- No category errors between Factory Method and Abstract Factory.
- Mentions Singleton's global-access tradeoff.
- Avoids vague definitions like 'creates objects better'.

**Answer:**

Factory method is used to create different objects that do the same thing but differently. Abstract factory is used to create different objects that belong to the same family, they compliment each other. A builder pattern is used when you don't know what you will need until you need it, and it makes it easy to extend the object. A prototype is a way to copy objects without having to know exactly how the object is built/

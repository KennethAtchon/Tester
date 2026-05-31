"use strict";

// Sandboxed code-execution harness.
//
// Runs as a plain Node process (the parent spawns Electron with
// ELECTRON_RUN_AS_NODE=1). It reads a JSON job from stdin, evaluates the
// candidate's code inside a fresh `vm` context with no `require`, no network,
// and no filesystem access, then runs each test expression and reports a
// structured pass/fail result on stdout.
//
// The parent process owns the wall-clock kill switch; the per-call `timeout`
// here only guards synchronous infinite loops.

const vm = require("node:vm");

const SETUP_TIMEOUT_MS = 2000;
const CALL_TIMEOUT_MS = 2000;
const MAX_LOG_LINES = 100;
const MAX_VALUE_LENGTH = 2000;

function deepEqual(a, b) {
  if (a === b) {
    return true;
  }

  if (typeof a !== typeof b || a === null || b === null) {
    return false;
  }

  if (typeof a !== "object") {
    // NaN === NaN is false above; treat them as equal for test purposes.
    return Number.isNaN(a) && Number.isNaN(b);
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((item, index) => deepEqual(item, b[index]));
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) {
    return false;
  }

  return keysA.every((key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]));
}

function describe(value) {
  if (value === undefined) {
    return "undefined";
  }

  try {
    const text = JSON.stringify(value, (_key, inner) => {
      if (typeof inner === "function") {
        return `[Function ${inner.name || "anonymous"}]`;
      }
      if (typeof inner === "bigint") {
        return `${inner.toString()}n`;
      }
      return inner;
    });

    if (text === undefined) {
      return String(value);
    }

    return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}… (truncated)` : text;
  } catch (error) {
    return String(value);
  }
}

function createSandbox(logs) {
  const record = (level) => (...args) => {
    if (logs.length < MAX_LOG_LINES) {
      logs.push(`[${level}] ${args.map((arg) => (typeof arg === "string" ? arg : describe(arg))).join(" ")}`);
    }
  };

  const sandbox = {
    console: { log: record("log"), warn: record("warn"), error: record("error"), info: record("log") },
    Math,
    JSON,
    Date,
    Array,
    Object,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Symbol,
    Promise,
    Number,
    String,
    Boolean,
    RegExp,
    Error,
    TypeError,
    RangeError,
    structuredClone,
    setTimeout,
    queueMicrotask
  };

  sandbox.globalThis = sandbox;
  return sandbox;
}

async function evaluateTest(context, test) {
  const name = typeof test.name === "string" && test.name.trim() ? test.name.trim() : test.call;

  try {
    let got = vm.runInContext(`(${test.call})`, context, { timeout: CALL_TIMEOUT_MS });

    if (got && typeof got.then === "function") {
      got = await got;
    }

    if (test.expectError) {
      return { name, passed: false, got: describe(got), expected: "an error to be thrown", error: null };
    }

    const passed = deepEqual(got, test.expect);
    return { name, passed, got: describe(got), expected: describe(test.expect), error: null };
  } catch (error) {
    if (test.expectError) {
      const matches = typeof test.expectError !== "string" || String(error.message).includes(test.expectError);
      return {
        name,
        passed: matches,
        got: `threw: ${error.message}`,
        expected: typeof test.expectError === "string" ? `error containing "${test.expectError}"` : "any error",
        error: null
      };
    }

    return { name, passed: false, got: null, expected: describe(test.expect), error: error.message };
  }
}

async function run(job) {
  const logs = [];
  const sandbox = createSandbox(logs);
  const context = vm.createContext(sandbox);

  try {
    vm.runInContext(String(job.code ?? ""), context, { timeout: SETUP_TIMEOUT_MS });
  } catch (error) {
    return { ok: false, compileError: error.message, results: [], logs };
  }

  const tests = Array.isArray(job.tests) ? job.tests : [];
  const results = [];

  for (const test of tests) {
    // Tests run sequentially so logs and shared state stay deterministic.
    results.push(await evaluateTest(context, test)); // eslint-disable-line no-await-in-loop
  }

  return { ok: results.every((result) => result.passed), compileError: null, results, logs };
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("end", () => resolve(input));
    process.stdin.on("error", reject);
  });
}

(async () => {
  try {
    const job = JSON.parse(await readStdin());
    const output = await run(job);
    process.stdout.write(JSON.stringify(output));
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, compileError: error.message, results: [], logs: [] }));
  }
  process.exit(0);
})();

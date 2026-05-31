"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");

const harnessPath = path.join(__dirname, "harness.js");

const WALL_CLOCK_TIMEOUT_MS = 5000;
const MAX_CODE_LENGTH = 50000;
const MAX_TESTS = 50;

// Runs candidate JavaScript in an isolated child process (the harness) and
// returns structured test results. The child is a plain Node runtime
// (ELECTRON_RUN_AS_NODE=1) so it shares no state with the Electron app, and a
// hard wall-clock kill guards against async infinite loops that vm's own
// timeout cannot interrupt.
function runCode(payload) {
  const code = typeof payload?.code === "string" ? payload.code : "";
  const tests = Array.isArray(payload?.tests) ? payload.tests.slice(0, MAX_TESTS) : [];

  if (!code.trim()) {
    return Promise.resolve({ ok: false, compileError: "No code to run.", results: [], logs: [] });
  }

  if (code.length > MAX_CODE_LENGTH) {
    return Promise.resolve({ ok: false, compileError: "Code exceeds the size limit.", results: [], logs: [] });
  }

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [harnessPath], {
      cwd: path.dirname(harnessPath),
      env: { ELECTRON_RUN_AS_NODE: "1", PATH: process.env.PATH },
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(killTimer);
      resolve(result);
    };

    const killTimer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({
        ok: false,
        compileError: `Execution timed out after ${WALL_CLOCK_TIMEOUT_MS / 1000}s (possible infinite loop).`,
        results: [],
        logs: []
      });
    }, WALL_CLOCK_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      finish({ ok: false, compileError: `Could not start runner: ${error.message}`, results: [], logs: [] });
    });

    child.on("close", () => {
      if (settled) {
        return;
      }

      try {
        finish(JSON.parse(stdout));
      } catch (error) {
        const detail = stderr.trim() || stdout.trim() || error.message;
        finish({ ok: false, compileError: `Runner produced no valid output: ${detail}`, results: [], logs: [] });
      }
    });

    child.stdin.write(JSON.stringify({ code, tests }));
    child.stdin.end();
  });
}

module.exports = { runCode };

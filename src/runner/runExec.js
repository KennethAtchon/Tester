"use strict";

// Free-form multi-language runner for code-answer editors.
//
// Unlike runCode.js (a sandboxed JS `vm` used for test-graded code_run
// questions), this executes the candidate's code with the REAL local
// interpreter/compiler for the selected language. It is intentionally
// unsandboxed — it runs on the user's machine — so it is only wired to the
// local, personal test-taking flow. Each run writes a temp file, spawns the
// toolchain, captures stdout/stderr with a wall-clock kill, and cleans up.

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TIMEOUT_MS = 8000;
const MAX_CODE_LENGTH = 50000;
const MAX_OUTPUT_LENGTH = 20000;

// Per-language toolchain. `run` returns [command, args]; `compile` (optional)
// builds a binary first and `run` then executes it.
const LANGUAGES = {
  javascript: { ext: "js", run: (file) => ["node", [file]] },
  typescript: { ext: "ts", run: (file) => ["tsx", [file]] },
  python: { ext: "py", run: (file) => ["python3", [file]] },
  ruby: { ext: "rb", run: (file) => ["ruby", [file]] },
  php: { ext: "php", run: (file) => ["php", [file]] },
  shell: { ext: "sh", run: (file) => ["bash", [file]] },
  go: { ext: "go", run: (file) => ["go", ["run", file]] },
  c: { ext: "c", compile: (file, out) => ["cc", [file, "-o", out]], run: (out) => [out, []] },
  cpp: { ext: "cpp", compile: (file, out) => ["c++", [file, "-o", out]], run: (out) => [out, []] }
};

function truncate(text) {
  if (text.length <= MAX_OUTPUT_LENGTH) {
    return text;
  }
  return `${text.slice(0, MAX_OUTPUT_LENGTH)}\n… (output truncated)`;
}

// Spawns a command, capturing stdout/stderr with a hard timeout. Resolves a
// plain result instead of rejecting so callers never have to try/catch.
function spawnCapture(command, args, cwd) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let child;

    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      if (child) {
        child.kill("SIGKILL");
      }
      finish({ code: 124, stdout, stderr: `${stderr}\nTimed out after ${TIMEOUT_MS / 1000}s.`, timedOut: true });
    }, TIMEOUT_MS);

    try {
      child = spawn(command, args, { cwd, env: process.env });
    } catch (error) {
      finish({ code: 127, stdout: "", stderr: `Could not start ${command}: ${error.message}`, missing: true });
      return;
    }

    child.on("error", (error) => {
      finish({ code: 127, stdout, stderr: `${command} not found (${error.code || error.message}).`, missing: error.code === "ENOENT" });
    });
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => finish({ code, stdout, stderr }));
  });
}

// Shapes a spawn result into the renderer-facing payload.
function toResult(spawned, phase) {
  return {
    ok: spawned.code === 0 && !spawned.missing && !spawned.timedOut,
    exitCode: spawned.code,
    stdout: truncate(spawned.stdout || ""),
    stderr: truncate(spawned.stderr || ""),
    missing: Boolean(spawned.missing),
    timedOut: Boolean(spawned.timedOut),
    phase: phase || "run"
  };
}

async function runExec(payload) {
  const language = typeof payload?.language === "string" ? payload.language : "";
  const code = typeof payload?.code === "string" ? payload.code : "";
  const spec = LANGUAGES[language];

  if (!spec) {
    return { ok: false, unsupported: true, language, stdout: "", stderr: `"${language}" can't be executed here.` };
  }
  if (!code.trim()) {
    return { ok: false, stdout: "", stderr: "No code to run." };
  }
  if (code.length > MAX_CODE_LENGTH) {
    return { ok: false, stdout: "", stderr: "Code exceeds the size limit." };
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qrun-"));
  const file = path.join(dir, `main.${spec.ext}`);

  try {
    fs.writeFileSync(file, code);

    if (spec.compile) {
      const binary = path.join(dir, os.platform() === "win32" ? "main.exe" : "main.out");
      const [cc, ccArgs] = spec.compile(file, binary);
      const compiled = await spawnCapture(cc, ccArgs, dir);
      if (compiled.code !== 0 || compiled.missing) {
        return toResult(compiled, "compile");
      }
      const [runCmd, runArgs] = spec.run(binary);
      return toResult(await spawnCapture(runCmd, runArgs, dir), "run");
    }

    const [cmd, args] = spec.run(file);
    return toResult(await spawnCapture(cmd, args, dir), "run");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { runExec };

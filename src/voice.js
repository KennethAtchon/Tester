// Voice for role-play steps ("Talk" mode). The partner's lines are spoken by
// official Kokoro (voice-engine/kokoro_server.py, started with uv) and the
// learner's spoken replies are transcribed by Whisper, both on this computer,
// so no audio leaves it: only the transcript goes to the practice partner,
// exactly like a typed line. Her face is a face pack (a portrait plus mouth
// and blink sprites, made by tools/face-pack) in the user-data folder; packs
// are personal content and never part of the (public) repo.
// Every function resolves to a value or { error: { code, message } }, as in
// partner.js.

const { app, systemPreferences } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const { pathToFileURL } = require("node:url");

const ENGINE_DIR = path.join(__dirname, "..", "voice-engine");
// Apps opened from the Dock don't get the shell's PATH, so uv is looked up here.
const UV_PATHS = ["/opt/homebrew/bin/uv", "/usr/local/bin/uv", path.join(os.homedir(), ".local", "bin", "uv"), path.join(os.homedir(), ".cargo", "bin", "uv")];
const STT_MODEL = "onnx-community/whisper-base.en";
const STT_DTYPE = "q8";
const SAMPLE_RATE = 16000;
const MAX_SECONDS = 90;

class VoiceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function guard(run) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof VoiceError) {
      return { error: { code: error.code, message: error.message } };
    }
    return { error: { code: "voice", message: error.message } };
  }
}

function voiceDir(...parts) {
  return path.join(app.getPath("userData"), "voice", ...parts);
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function checkVoice(voice) {
  if (!/^[a-z]{2}_[a-z]+$/.test(String(voice))) {
    throw new VoiceError("bad-request", `Unknown voice "${voice}".`);
  }
  return voice;
}

// --- Her voice: the Kokoro engine, one long-lived process.

let engine = null;

async function findUv() {
  for (const candidate of UV_PATHS) {
    if (await exists(candidate)) {
      return candidate;
    }
  }
  throw new VoiceError("setup", "Talk mode needs uv to run her voice. Install it with: brew install uv");
}

async function startEngine() {
  if (engine) {
    return engine.ready;
  }
  const uv = await findUv();
  const child = spawn(uv, ["run", "--frozen", "--project", ENGINE_DIR, "--python", "3.11", "python", "-u", path.join(ENGINE_DIR, "kokoro_server.py")], {
    cwd: ENGINE_DIR,
    env: { ...process.env, UV_PROJECT_ENVIRONMENT: voiceDir("python"), PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ""}` },
    stdio: ["pipe", "pipe", "pipe"]
  });
  const state = { child, pending: new Map(), nextId: 1, ready: null, stderr: [] };
  const fail = (error) => {
    for (const settle of state.pending.values()) {
      settle({ error: error.message });
    }
    state.pending.clear();
    if (engine === state) {
      engine = null;
    }
  };
  state.ready = new Promise((resolve, reject) => {
    readline.createInterface({ input: child.stdout }).on("line", (line) => {
      const message = JSON.parse(line);
      if (message.ready) {
        resolve();
      } else if (message.fatal) {
        reject(new VoiceError("setup", message.fatal));
      } else if (state.pending.has(message.id)) {
        state.pending.get(message.id)(message);
        state.pending.delete(message.id);
      }
    });
    readline.createInterface({ input: child.stderr }).on("line", (line) => {
      state.stderr.push(line);
      state.stderr.splice(0, state.stderr.length - 20);
    });
    child.on("error", (error) => {
      fail(error);
      reject(new VoiceError("voice", `Her voice didn't start: ${error.message}`));
    });
    child.on("exit", (code) => {
      const detail = state.stderr.filter(Boolean).slice(-3).join(" ");
      fail(new Error(`exited with code ${code}`));
      reject(new VoiceError("voice", `Her voice stopped (exit code ${code}). ${detail}`.trim()));
    });
  });
  engine = state;
  return state.ready;
}

function ask(request) {
  const state = engine;
  const id = state.nextId++;
  return new Promise((resolve) => {
    state.pending.set(id, resolve);
    state.child.stdin.write(`${JSON.stringify({ ...request, id })}\n`);
  });
}

// One sentence → WAV audio plus each word's phonemes and timing, which the
// face turns into mouth shapes.
function speak({ text, voice } = {}) {
  return guard(async () => {
    const sentence = String(text ?? "").trim();
    if (!sentence) {
      throw new VoiceError("bad-request", "Nothing to say.");
    }
    await startEngine();
    const reply = await ask({ text: sentence, voice: checkVoice(voice) });
    if (reply.error) {
      throw new VoiceError("voice", `Couldn't make her voice: ${reply.error}`);
    }
    return { audio: Buffer.from(reply.wav, "base64"), tokens: reply.tokens };
  });
}

// --- Speech to text: Whisper in this process (inference runs on ONNX threads).

const progress = { files: new Map(), listener: null };

function report(file, loaded, total) {
  progress.files.set(file, { loaded, total });
  let sumLoaded = 0;
  let sumTotal = 0;
  for (const entry of progress.files.values()) {
    sumLoaded += entry.loaded || 0;
    sumTotal += entry.total || 0;
  }
  progress.listener?.({ loaded: sumLoaded, total: sumTotal });
}

let stt = null;

function startStt() {
  stt ||= (async () => {
    const { pipeline, env } = await import("@huggingface/transformers");
    env.cacheDir = voiceDir("models");
    return pipeline("automatic-speech-recognition", STT_MODEL, {
      device: "cpu",
      dtype: STT_DTYPE,
      progress_callback: (event) => {
        if (event.status === "progress") {
          report(event.file, event.loaded, event.total);
        }
      }
    });
  })().catch((error) => {
    stt = null;
    throw new VoiceError("stt", `Couldn't load speech recognition: ${error.message}`);
  });
  return stt;
}

// Whisper writes markers like "[BLANK_AUDIO]" or "(silence)" for no speech.
function cleanTranscript(text) {
  return String(text ?? "")
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function transcribe({ pcm } = {}) {
  return guard(async () => {
    if (!(pcm instanceof Float32Array) || pcm.length === 0) {
      throw new VoiceError("bad-request", "No audio to transcribe.");
    }
    if (pcm.length > SAMPLE_RATE * MAX_SECONDS) {
      throw new VoiceError("bad-request", `That reply is longer than ${MAX_SECONDS} seconds.`);
    }
    const asr = await startStt();
    const result = await asr(pcm);
    return { text: cleanTranscript(result.text) };
  });
}

// --- Setup: the engine, Whisper, her face, microphone permission.

// Starts both engines (setting them up the first time) and voices one short
// word so her first real line comes back quickly.
function warm({ voice } = {}, onProgress) {
  return guard(async () => {
    progress.listener = onProgress;
    try {
      await Promise.all([
        startEngine().then(async () => {
          const reply = await ask({ text: "Hi.", voice: checkVoice(voice) });
          if (reply.error) {
            throw new VoiceError("voice", `Couldn't make her voice: ${reply.error}`);
          }
        }),
        startStt()
      ]);
    } finally {
      progress.listener = null;
    }
    return { ready: true };
  });
}

async function readPacks() {
  const root = voiceDir("faces");
  let names = [];
  try {
    names = await fs.readdir(root);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
  const packs = [];
  for (const name of names.sort()) {
    const manifestFile = path.join(root, name, "manifest.json");
    if (await exists(manifestFile)) {
      packs.push({ id: name, folder: path.join(root, name), manifest: JSON.parse(await fs.readFile(manifestFile, "utf8")) });
    }
  }
  return packs;
}

// The pack named after the character, else the same pick every time for that name.
function face(characterName) {
  return guard(async () => {
    const packs = await readPacks();
    if (packs.length === 0) {
      throw new VoiceError("no-faces", `No faces are installed yet. Make one with tools/face-pack and put it in ${voiceDir("faces")}.`);
    }
    const id = String(characterName ?? "").toLowerCase();
    let hash = 0;
    for (const char of id) {
      hash = (hash * 31 + char.codePointAt(0)) >>> 0;
    }
    const pack = packs.find((entry) => entry.id === id) || packs[hash % packs.length];
    const url = (file) => pathToFileURL(path.join(pack.folder, file)).href;
    const { manifest } = pack;
    return {
      id: pack.id,
      voice: manifest.voice,
      width: manifest.width,
      height: manifest.height,
      face: manifest.face,
      base: url(manifest.base),
      sprites: Object.fromEntries(Object.entries(manifest.sprites).map(([name, sprite]) => [name, { ...sprite, url: url(sprite.file) }]))
    };
  });
}

// macOS asks the user once; elsewhere the browser's own prompt decides.
function micAccess() {
  return guard(async () => {
    if (process.platform !== "darwin") {
      return { granted: true };
    }
    const status = systemPreferences.getMediaAccessStatus("microphone");
    if (status === "granted") {
      return { granted: true };
    }
    if (status === "not-determined") {
      return { granted: await systemPreferences.askForMediaAccess("microphone") };
    }
    return { granted: false };
  });
}

app.on("will-quit", () => engine?.child.kill());

module.exports = { warm, face, speak, transcribe, micAccess };

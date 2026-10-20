// Practice partner for role-play steps: one call plays the other person, turn
// by turn; a second call coaches the learner once the scene ends. It runs in
// the main process so the API key never reaches the page. The key is stored
// in the user-data folder, encrypted with the macOS keychain (safeStorage).
// Every function resolves to a value or { error: { code, message } }, since
// errors thrown across IPC lose their type and arrive with a wrapped message.

const { app, safeStorage } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Anthropic } = require("@anthropic-ai/sdk");

// The cheapest current model; a live reply has to come back in a second or two.
const MODEL = "claude-haiku-5-5";

// A learner line marked silent (their reply clock ran out) reaches both models
// as this: freezing is part of what is practised.
const SILENCE = "(says nothing)";

const PARTNER_RULES = `You are playing one person in a live, face-to-face conversation. The other person is rehearsing real-life social skills: they type what they would say out loud, and you answer as your character would.

Stay in character for the whole conversation. Don't mention practice, AI, or coaching, don't give tips, and don't narrate. A separate coach gives feedback afterwards, so your only job is to be a believable person.

Talk the way people talk in person: usually one or two short sentences, sometimes a few words. Write only the words you say: no stage directions, actions in asterisks, or emoji. Don't end every turn with a question; real people often just answer or react and leave the other person to carry it, especially early on.

Respond honestly to how you're treated. Warm up and share more when they listen, pick up on something you said, are playful, or lead with confidence. Cool down, give shorter answers, or change the subject when they dismiss your feelings, fire unrelated questions at you like an interview, talk only about themselves, or try too hard. Be neither a pushover nor a wall: a decent attempt gets a decent response.

When their line is "${SILENCE}", they froze. React to the silence the way your character would.

Keep it PG-13.`;

const COACH_RULES = `You coach people on in-person conversation: confidence, follow-up questions, handling someone's nerves, going deeper, playful banter, and leading. You are reviewing a rehearsal. The learner typed their lines; an AI played the other person from the brief you are given. Judge only the learner's lines, as the other person would have experienced them.

For each goal, in order: decide whether the learner met it, quote the learner's line that shows it (or the line where it was missed; an empty string if nothing they said was relevant), and say why in one plain sentence. Be strict but fair: a goal counts only if a real person on the other side would have felt it, not because the learner used a technique's keyword. A line of "${SILENCE}" means the learner froze.

Then quote the learner's weakest line and rewrite it the way a socially skilled person would say it: in the learner's voice, casual, short enough to say out loud. If they froze, the weakest line is the silence; write what they could have said instead.

Finish with one sentence: the single thing to do differently next time.

Speak to the learner as "you". Be direct and specific, without hype or lectures.`;

const COACH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["goals", "weakest", "better", "next"],
  properties: {
    goals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["met", "quote", "why"],
        properties: { met: { type: "boolean" }, quote: { type: "string" }, why: { type: "string" } }
      }
    },
    weakest: { type: "string" },
    better: { type: "string" },
    next: { type: "string" }
  }
};

function keyFilePath() {
  return path.join(app.getPath("userData"), "partner-key.bin");
}

async function readKey() {
  try {
    return safeStorage.decryptString(await fs.readFile(keyFilePath()));
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

let client = null;

async function getClient() {
  if (!client) {
    const apiKey = await readKey();
    if (!apiKey) {
      throw new PartnerError("no-key", "Add your Anthropic API key in Settings → Practice partner.");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

class PartnerError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// Most specific first: each SDK error class says whether trying again can help.
function failure(error) {
  if (error instanceof PartnerError) {
    return { error: { code: error.code, message: error.message } };
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return { error: { code: "auth", message: "Anthropic rejected the API key. Check it in Settings → Practice partner." } };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { error: { code: "busy", message: "Too many requests right now. Wait a moment and try again." } };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { error: { code: "offline", message: "Couldn't reach Anthropic. Check your internet connection." } };
  }
  if (error instanceof Anthropic.APIError) {
    return { error: { code: "api", message: `Anthropic API error ${error.status ?? ""}: ${error.error?.error?.message || error.message}`.trim() } };
  }
  throw error;
}

async function guard(run) {
  try {
    return await run();
  } catch (error) {
    return failure(error);
  }
}

function textOf(response) {
  if (response.stop_reason === "refusal") {
    throw new PartnerError("refusal", "The model declined this one. Try saying it another way.");
  }
  const text = response.content.filter((block) => block.type === "text").map((block) => block.text).join("").trim();
  if (!text) {
    throw new PartnerError("empty", `The model returned no text (stop reason: ${response.stop_reason}).`);
  }
  return text;
}

// transcript: [{ from: "partner" | "you", text, silent? }] → the same lines
// with silences spelled out.
function spoken(transcript) {
  const lines = Array.isArray(transcript) ? transcript.map((line) => ({ from: line?.from, text: line?.silent ? SILENCE : String(line?.text ?? "").trim() })) : [];
  if (lines.length === 0 || lines.some((line) => !["partner", "you"].includes(line.from) || !line.text)) {
    throw new PartnerError("bad-request", "The conversation sent to the partner is malformed.");
  }
  return lines;
}

function status() {
  return guard(async () => ({ hasKey: Boolean(await readKey()), model: MODEL }));
}

function setKey(key) {
  return guard(async () => {
    const trimmed = typeof key === "string" ? key.trim() : "";
    if (!trimmed) {
      throw new PartnerError("bad-request", "Paste an Anthropic API key first.");
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new PartnerError("no-keychain", "The keychain isn't available, so the key can't be stored safely.");
    }
    await fs.mkdir(path.dirname(keyFilePath()), { recursive: true });
    await fs.writeFile(keyFilePath(), safeStorage.encryptString(trimmed), { mode: 0o600 });
    client = null;
    return { hasKey: true, model: MODEL };
  });
}

function clearKey() {
  return guard(async () => {
    await fs.rm(keyFilePath(), { force: true });
    client = null;
    return { hasKey: false, model: MODEL };
  });
}

// The transcript opens with the partner's authored line and ends with the
// learner's latest one. The API needs a user turn first, so a stage cue stands
// in front of the opener.
function reply({ persona, name, transcript }) {
  return guard(async () => {
    const lines = spoken(transcript);
    if (lines[lines.length - 1].from !== "you") {
      throw new PartnerError("bad-request", "The partner can only answer the learner's line.");
    }
    const response = await (await getClient()).messages.create({
      model: MODEL,
      max_tokens: 1024,
      // No thinking: a spoken reply needs speed, and text-only turns can be
      // replayed exactly on the next request.
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
      system: `${PARTNER_RULES}\n\nYour character${name ? `, ${name}` : ""}:\n${persona}`,
      messages: [
        { role: "user", content: "(The scene starts. Say your first line.)" },
        ...lines.map((line) => ({ role: line.from === "partner" ? "assistant" : "user", content: line.text }))
      ]
    });
    return { text: textOf(response) };
  });
}

function coach({ scene, persona, name, goals, transcript }) {
  return guard(async () => {
    const lines = spoken(transcript);
    if (!Array.isArray(goals) || goals.length === 0) {
      throw new PartnerError("bad-request", "A role-play needs goals to coach against.");
    }
    const who = name || "Partner";
    const response = await (await getClient()).messages.create({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: "medium", format: { type: "json_schema", schema: COACH_SCHEMA } },
      system: COACH_RULES,
      messages: [
        {
          role: "user",
          content: [
            `Scene: ${scene}`,
            `The other person (${who}), as briefed to the AI playing them:\n${persona}`,
            `Goals:\n${goals.map((goal, index) => `${index + 1}. ${goal}`).join("\n")}`,
            `Conversation:\n${lines.map((line) => `${line.from === "partner" ? who : "Learner"}: ${line.text}`).join("\n")}`
          ].join("\n\n")
        }
      ]
    });
    const verdict = JSON.parse(textOf(response));
    if (verdict.goals.length !== goals.length) {
      throw new PartnerError("bad-verdict", `The coach judged ${verdict.goals.length} goals, not ${goals.length}.`);
    }
    return verdict;
  });
}

module.exports = { status, setKey, clearKey, reply, coach };

// Talk mode's link to the main process (src/voice.js), which makes her voice
// and transcribes the learner's, plus the microphone, which lives here. Each
// call resolves to a value or { error: { code, message } }, as in partner.js.

import { createSpeechGate, rms } from "../lib/speech.js";

const SAMPLE_RATE = 16000; // what Whisper expects
const FRAME = 2048;

function call(name, ...args) {
  const bridge = window.testFiles?.[name];
  if (!bridge) {
    return Promise.resolve({ error: { code: "no-desktop", message: "Talk mode needs the Recall desktop app." } });
  }
  return bridge(...args).catch((error) => ({ error: { code: "crash", message: error.message } }));
}

export const voiceWarm = (payload) => call("voiceWarm", payload);
export const voiceFace = (name) => call("voiceFace", name);
export const voiceSpeak = (payload) => call("voiceSpeak", payload);
export const voiceTranscribe = (pcm) => call("voiceTranscribe", { pcm });
export const voiceMicAccess = () => call("voiceMicAccess");
export const onVoiceProgress = (listener) => window.testFiles?.onVoiceProgress?.(listener) || (() => {});

// Records one reply. Resolves `done` with { pcm, spoke } once the learner has
// spoken and paused, or when stop() is called (Done button, clock ran out).
// `analyser` follows the same input, for the face to react to while it listens.
// ScriptProcessorNode is deprecated, but it hands over raw samples without
// loading a separate worklet module.
export async function listen({ onLevel, onSpeech } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const context = new AudioContext({ sampleRate: SAMPLE_RATE });
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(FRAME, 1, 1);
  const analyser = context.createAnalyser();
  const gate = createSpeechGate();
  const chunks = [];
  let heard = false;
  let closed = false;
  let finish;
  const done = new Promise((resolve) => {
    finish = resolve;
  });

  const stop = () => {
    if (closed) {
      return;
    }
    closed = true;
    processor.onaudioprocess = null;
    processor.disconnect();
    source.disconnect();
    for (const track of stream.getTracks()) {
      track.stop();
    }
    context.close();
    const pcm = new Float32Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      pcm.set(chunk, offset);
      offset += chunk.length;
    }
    finish({ pcm, spoke: gate.spoke });
  };

  processor.onaudioprocess = (event) => {
    const samples = new Float32Array(event.inputBuffer.getChannelData(0));
    chunks.push(samples);
    const level = rms(samples);
    onLevel?.(level);
    const state = gate.push(level, samples.length / SAMPLE_RATE);
    if (state === "speaking" && !heard) {
      heard = true;
      onSpeech?.();
    }
    if (state === "done") {
      stop();
    }
  };
  source.connect(processor);
  source.connect(analyser);
  processor.connect(context.destination);
  return { done, stop, analyser };
}

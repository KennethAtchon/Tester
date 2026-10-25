// The practice partner's face in Talk mode: a photo-real portrait from a face
// pack (src/voice.js) brought to life on a canvas. Her mouth crossfades
// between the pack's mouth shapes in time with her voice (Kokoro's phoneme
// timings, see lib/speech.js), she blinks at natural random intervals, and a
// slow breathing drift keeps her from looking like a still. Everything outside
// a sprite is always the original photo. Each sentence is voiced separately,
// so she starts talking while the rest is still being made.

import { splitSentences, spokenText, mouthTimeline, shapeAt, rms } from "../lib/speech.js";
import { voiceFace, voiceSpeak } from "../io/voice.js";

const MOUTHS = ["slight", "open", "ee", "oh"];
const FADE = 0.07; // seconds to crossfade between mouth shapes
const FACE_SHARE = 0.55; // how much of the canvas height her face fills

function loadImage(url) {
  const image = new Image();
  image.src = url;
  return image.decode().then(() => image);
}

export async function createFace(node, { name }) {
  const pack = await voiceFace(name);
  if (pack.error) {
    return { error: pack.error };
  }
  let base;
  const sprites = {};
  try {
    [base] = await Promise.all([
      loadImage(pack.base),
      ...Object.entries(pack.sprites).map(async ([shape, sprite]) => {
        sprites[shape] = { ...sprite, image: await loadImage(sprite.url) };
      })
    ]);
  } catch (error) {
    return { error: { code: "face", message: `Couldn't load her face: ${error.message}` } };
  }

  const canvas = document.createElement("canvas");
  canvas.className = "face-canvas";
  node.replaceChildren(canvas);
  const draw = canvas.getContext("2d");
  const fitCanvas = () => {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(node.clientWidth * ratio);
    canvas.height = Math.round(node.clientHeight * ratio);
  };
  const resize = new ResizeObserver(fitCanvas);
  resize.observe(node);
  fitCanvas();

  const audio = new AudioContext();
  const meter = audio.createAnalyser();
  meter.fftSize = 512;
  meter.connect(audio.destination);
  const level = new Float32Array(meter.fftSize);

  const weights = Object.fromEntries(MOUTHS.map((shape) => [shape, 0]));
  const queue = []; // [{ start, end, timeline }] in audio-clock seconds
  const sources = new Set();
  let listenMeter = null;
  let nextBlink = performance.now() + 1500;
  let generation = 0;
  let release = null;
  let frame = 0;
  let last = performance.now();

  // Blink: a quick close, a short hold, a slower open.
  const blinkAt = (now) => {
    if (now >= nextBlink + 220) {
      nextBlink = now + 2200 + Math.random() * 3800;
    }
    const t = now - nextBlink;
    if (t < 0) return 0;
    if (t < 70) return t / 70;
    if (t < 110) return 1;
    return Math.max(0, 1 - (t - 110) / 110);
  };

  const render = (now) => {
    frame = requestAnimationFrame(render);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const clock = audio.currentTime;
    while (queue.length && queue[0].end < clock) {
      queue.shift();
    }
    const current = queue.find((entry) => clock >= entry.start && clock < entry.end);
    const shape = current ? shapeAt(current.timeline, clock - current.start) : "closed";
    for (const mouth of MOUTHS) {
      const target = mouth === shape ? 1 : 0;
      weights[mouth] += Math.sign(target - weights[mouth]) * Math.min(Math.abs(target - weights[mouth]), dt / FADE);
    }

    // How loud she is (or he is, while she listens) nudges her head a little.
    let loud = 0;
    if (current) {
      meter.getFloatTimeDomainData(level);
      loud = rms(level);
    } else if (listenMeter) {
      listenMeter.getFloatTimeDomainData(level.subarray(0, Math.min(level.length, listenMeter.fftSize)));
      loud = rms(level) * 0.5;
    }

    const { width, height } = canvas;
    const face = pack.face;
    const scale = Math.max(width / pack.width, height / pack.height, (height * FACE_SHARE) / face.h);
    const seconds = now / 1000;
    const breathe = 1 + 0.006 * Math.sin((seconds * Math.PI * 2) / 4.6);
    const s = scale * breathe * (1 + Math.min(0.01, loud * 0.05));
    const centerX = face.x + face.w / 2 + 6 * Math.sin((seconds * Math.PI * 2) / 7.3);
    const centerY = face.y + face.h * 0.48 + 4 * Math.sin((seconds * Math.PI * 2) / 5.1) - Math.min(8, loud * 40);
    // Keep the photo covering the canvas while it drifts.
    const left = Math.min(0, Math.max(width - pack.width * s, width / 2 - centerX * s));
    const top = Math.min(0, Math.max(height - pack.height * s, height / 2 - centerY * s));
    draw.setTransform(s, 0, 0, s, left, top);
    draw.imageSmoothingQuality = "high";
    draw.drawImage(base, 0, 0);
    for (const mouth of MOUTHS) {
      if (weights[mouth] > 0.01 && sprites[mouth]) {
        draw.globalAlpha = weights[mouth];
        draw.drawImage(sprites[mouth].image, sprites[mouth].x, sprites[mouth].y);
      }
    }
    const blink = blinkAt(now);
    if (blink > 0.01 && sprites.blink) {
      draw.globalAlpha = blink;
      draw.drawImage(sprites.blink.image, sprites.blink.x, sprites.blink.y);
    }
    draw.globalAlpha = 1;
  };
  frame = requestAnimationFrame(render);

  const cut = () => {
    generation += 1;
    for (const source of sources) {
      source.onended = null;
      source.stop();
    }
    sources.clear();
    queue.length = 0;
    release?.();
    release = null;
  };

  return {
    voice: pack.voice,
    // Resolves once she has finished saying `text`, or { error }.
    async say(text) {
      const mine = ++generation;
      await audio.resume();
      let endsAt = audio.currentTime;
      for (const sentence of splitSentences(spokenText(text))) {
        const chunk = await voiceSpeak({ text: sentence, voice: pack.voice });
        if (mine !== generation) {
          return {};
        }
        if (chunk.error) {
          return chunk;
        }
        const bytes = chunk.audio;
        const buffer = await audio.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        if (mine !== generation) {
          return {};
        }
        const start = Math.max(audio.currentTime + 0.03, endsAt);
        const source = audio.createBufferSource();
        source.buffer = buffer;
        source.connect(meter);
        source.start(start);
        sources.add(source);
        source.onended = () => sources.delete(source);
        endsAt = start + buffer.duration;
        queue.push({ start, end: endsAt, timeline: mouthTimeline(chunk.tokens) });
      }
      await new Promise((resolve) => {
        release = resolve;
        setTimeout(resolve, Math.max(0, (endsAt - audio.currentTime) * 1000) + 60);
      });
      release = null;
      return {};
    },
    // Given the microphone's analyser she reacts a little as the learner talks.
    listening(analyser) {
      listenMeter = analyser;
    },
    interrupt() {
      cut();
    },
    destroy() {
      cut();
      cancelAnimationFrame(frame);
      resize.disconnect();
      audio.close();
      node.replaceChildren();
    }
  };
}

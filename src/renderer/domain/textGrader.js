// Concept grader for written answers — the app's "mini AI" without a model.
// Each step lists the concepts a good answer covers; each concept lists the
// ways people phrase it. Both the answer and the phrasings go through the same
// pipeline (lowercase → common abbreviations expanded → stopwords dropped →
// light stemming), and a phrasing counts when all of its words appear close
// together in the answer, in any order. Learners can still override a miss.

import { stem, STOPWORDS as BASE_STOPWORDS } from "./grading.js";

// Filler words to ignore. Lighter than the keyword list: words that change
// meaning in system design ("scale out", "same key", "any server", "not",
// "all", "only") are kept.
const KEEP = new Set(["any", "same", "out", "up", "down", "off", "over", "under", "again", "not", "no", "own", "more", "less", "most", "least", "all", "each", "few", "other", "only", "once", "before", "after", "first"]);
const STOPWORDS = new Set([...BASE_STOPWORDS].filter((word) => !KEEP.has(word)));

// Rewrites applied to raw text so spelling variants meet in the middle.
const REWRITES = [
  [/\bweb[\s-]*sockets?\b/g, " websocket "],
  [/\bkey[\s/-]*values?\b/g, " keyvalue "],
  [/\bk\s*\/\s*v\b/g, " keyvalue "],
  [/\bround[\s-]*robin\b/g, " roundrobin "],
  [/\bfan[\s-]*out\b/g, " fanout "],
  [/\bfail[\s-]*over\b/g, " failover "],
  [/\bback[\s-]*off\b/g, " backoff "],
  [/\bup[\s-]*time\b/g, " uptime "],
  [/\bthrough[\s-]*put\b/g, " throughput "],
  [/\bread[\s-]*heavy\b/g, " readheavy "],
  [/\bwrite[\s-]*heavy\b/g, " writeheavy "],
  [/\bidempoten(t|cy)\b/g, " idempotent "],
  [/\bp\s*(\d{2,3})\b/g, " p$1 "],
  [/(\d)\s*%/g, "$1 percent "]
];

// Whole-token synonyms (after rewrites, before stemming).
const CANONICAL = {
  lb: "load balancer",
  lbs: "load balancer",
  db: "database",
  dbs: "database",
  rdbms: "relational database",
  sql: "sql",
  nosql: "nosql",
  qps: "queries per second",
  rps: "requests per second",
  tps: "transactions per second",
  ttl: "time to live",
  ttls: "time to live",
  msg: "message",
  msgs: "message",
  async: "asynchronous",
  sync: "synchronous",
  ws: "websocket",
  pk: "primary key",
  fk: "foreign key",
  ms: "millisecond",
  msec: "millisecond",
  sec: "second",
  secs: "second",
  repl: "replication",
  cdns: "cdn",
  spof: "single point failure",
  slo: "service level objective",
  sla: "service level agreement",
  sli: "service level indicator",
  dau: "daily active user",
  mau: "monthly active user",
  rpo: "recovery point objective",
  rto: "recovery time objective",
  uuid: "unique identifier",
  guid: "unique identifier",
  id: "id",
  ids: "id"
};

// Words after rewrites and abbreviation expansion, stopwords dropped:
// [{ raw, stem }]. With keepWildcards a trailing "*" survives ("redundan*").
function words(text, keepWildcards = false) {
  let normalized = ` ${String(text ?? "").toLowerCase()} `;
  for (const [pattern, replacement] of REWRITES) {
    normalized = normalized.replace(pattern, replacement);
  }
  normalized = normalized.replace(keepWildcards ? /[^a-z0-9.%+#*]+/g : /[^a-z0-9.%+#]+/g, " ").replace(/(?<!\d)\.|\.(?!\d)/g, " ");
  const result = [];
  for (const word of normalized.split(/\s+/)) {
    if (!word) {
      continue;
    }
    if (keepWildcards && word.endsWith("*") && word.length > 2) {
      result.push({ raw: word, stem: word });
      continue;
    }
    const expanded = CANONICAL[word] ? CANONICAL[word].split(" ") : [word];
    for (const part of expanded) {
      if ((part.length > 1 && !STOPWORDS.has(part)) || /^\d$/.test(part)) {
        result.push({ raw: part, stem: part.length > 1 ? stem(part) : part });
      }
    }
  }
  return result;
}

export function tokenize(text) {
  return words(text).map((word) => word.stem);
}

// Wildcards prefix-match the unstemmed word ("postgres*" matches "Postgres"
// even though the stem is "postgr"); everything else matches stems.
function positionsOf(token, index) {
  if (!token.endsWith("*")) {
    return index.stems.get(token) || [];
  }
  const prefix = token.slice(0, -1);
  const found = [];
  for (const [key, list] of index.raws) {
    if (key.startsWith(prefix)) {
      found.push(...list);
    }
  }
  return found;
}

// Does the phrase appear, all of its words within a small window?
function phraseMatches(phraseTokens, index) {
  if (phraseTokens.length === 0) {
    return false;
  }
  const window = Math.max(5, phraseTokens.length * 3);
  return positionsOf(phraseTokens[0], index).some((start) =>
    phraseTokens.slice(1).every((token) => positionsOf(token, index).some((position) => Math.abs(position - start) <= window))
  );
}

function indexPositions(list) {
  const stems = new Map();
  const raws = new Map();
  list.forEach((word, position) => {
    for (const [map, key] of [[stems, word.stem], [raws, word.raw]]) {
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(position);
    }
  });
  return { stems, raws };
}

// concepts: [{ label, any: ["phrase", "re:regex", ...] }]
export function gradeText(response, concepts, pass = null) {
  const positions = indexPositions(words(response));
  const lowered = String(response ?? "").toLowerCase();

  const hits = concepts.map((concept) => {
    for (const alternative of concept.any || []) {
      if (alternative.startsWith("re:")) {
        try {
          if (new RegExp(alternative.slice(3), "i").test(lowered)) {
            return { label: concept.label, hit: true, via: alternative };
          }
        } catch {
          // An invalid pattern simply never matches; the validator flags it.
        }
        continue;
      }
      if (phraseMatches(words(alternative, true).map((word) => word.stem), positions)) {
        return { label: concept.label, hit: true, via: alternative };
      }
    }
    return { label: concept.label, hit: false, via: null };
  });

  const needed = pass ?? Math.max(1, Math.ceil(concepts.length * 0.6));
  const count = hits.filter((entry) => entry.hit).length;
  return {
    hits,
    count,
    needed,
    score: concepts.length ? count / concepts.length : 0,
    passed: count >= needed
  };
}

// For answers with no concept list (imported question banks): treat the model
// answer's key terms as concepts.
export function conceptsFromModel(model, limit = 8) {
  const seen = new Set();
  const concepts = [];
  for (const word of String(model).split(/[^A-Za-z0-9-]+/)) {
    const lower = word.toLowerCase();
    if (lower.length < 4 || STOPWORDS.has(lower) || seen.has(stem(lower))) {
      continue;
    }
    seen.add(stem(lower));
    concepts.push({ label: word, any: [lower] });
    if (concepts.length >= limit) {
      break;
    }
  }
  return concepts;
}

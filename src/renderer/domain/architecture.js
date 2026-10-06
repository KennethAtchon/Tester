// System-design building blocks for the architecture canvas, plus the grader
// that checks a learner's diagram against a step's rules. Pure: no DOM.
//
// A graph is { nodes: [{ id, type, label? }], edges: [{ from, to }] }. Edges
// are drawn with a direction but graded as connections (undirected), so a
// learner isn't marked wrong for drawing an arrow "backwards".

export const COMPONENTS = {
  client: { label: "Clients", icon: "monitor", hue: "slate", description: "Web browsers and mobile apps making requests." },
  dns: { label: "DNS", icon: "globe", hue: "slate", description: "Resolves a domain name to the IP of your entry point." },
  cdn: { label: "CDN", icon: "cloud", hue: "sky", description: "Edge caches close to users for static and cacheable content." },
  lb: { label: "Load balancer", icon: "split", hue: "violet", description: "Spreads incoming requests across a pool of servers and routes around failures." },
  gateway: { label: "API gateway", icon: "door", hue: "violet", description: "Single front door for services: auth, routing, rate limits, TLS." },
  app: { label: "App servers", icon: "server", hue: "blue", description: "Stateless servers that run the application logic. Scale horizontally." },
  service: { label: "Service", icon: "box", hue: "blue", description: "A separate service with its own responsibility. Rename it to say what it does." },
  cache: { label: "Cache", icon: "zap", hue: "amber", description: "In-memory key-value store (Redis, Memcached) for hot reads." },
  db_sql: { label: "SQL database", icon: "database", hue: "green", description: "Relational database with transactions and joins (Postgres, MySQL)." },
  db_nosql: { label: "NoSQL store", icon: "database", hue: "teal", description: "Key-value, wide-column, or document store (DynamoDB, Cassandra, MongoDB)." },
  replica: { label: "Read replicas", icon: "copy", hue: "green", description: "Copies of a database that serve reads and take over on failure." },
  object_store: { label: "Object storage", icon: "archive", hue: "teal", description: "Cheap, durable blob storage for files, images, and video (S3, GCS)." },
  queue: { label: "Message queue", icon: "inbox", hue: "orange", description: "Durable buffer between producers and consumers (Kafka, SQS, RabbitMQ)." },
  worker: { label: "Workers", icon: "settings", hue: "orange", description: "Background consumers that process jobs from a queue." },
  search: { label: "Search index", icon: "search", hue: "pink", description: "Inverted index for full-text and filtered search (Elasticsearch)." },
  id_gen: { label: "ID generator", icon: "hash", hue: "pink", description: "Issues unique IDs without collisions (Snowflake, ticket server, key range)." },
  rate_limiter: { label: "Rate limiter", icon: "gauge", hue: "red", description: "Rejects or delays callers that exceed their quota." },
  ws: { label: "WebSocket servers", icon: "radio", hue: "sky", description: "Hold long-lived connections to push events to clients in real time." },
  notify: { label: "Notification service", icon: "bell", hue: "red", description: "Sends push notifications, email, or SMS." },
  stream: { label: "Stream processor", icon: "waves", hue: "orange", description: "Consumes event streams continuously (Flink, Spark Streaming, Kafka Streams)." },
  warehouse: { label: "Data warehouse", icon: "insights", hue: "slate", description: "Columnar analytics store for offline queries (BigQuery, Redshift)." },
  auth: { label: "Auth service", icon: "key", hue: "violet", description: "Issues and validates identity tokens." },
  coordinator: { label: "Coordination service", icon: "target", hue: "slate", description: "Consensus-backed config, locks, and leader election (ZooKeeper, etcd)." }
};

// Aliases usable in rules wherever a component type is expected.
export const ALIASES = {
  db: ["db_sql", "db_nosql"],
  datastore: ["db_sql", "db_nosql", "replica"],
  storage: ["db_sql", "db_nosql", "replica", "object_store"],
  entry: ["lb", "gateway"],
  compute: ["app", "service", "worker"],
  async: ["queue", "stream"]
};

export function isKnownType(type) {
  return Object.prototype.hasOwnProperty.call(COMPONENTS, type);
}

// "a|b|db" → Set of concrete types. Unknown names throw so authoring errors
// surface in the validator instead of silently never matching.
export function expandSpec(spec) {
  const parts = Array.isArray(spec) ? spec : String(spec).split("|");
  const types = new Set();
  for (const raw of parts) {
    const name = String(raw).trim();
    if (ALIASES[name]) {
      ALIASES[name].forEach((type) => types.add(type));
    } else if (isKnownType(name)) {
      types.add(name);
    } else {
      throw new Error(`Unknown component type "${name}"`);
    }
  }
  return types;
}

export function specLabel(spec) {
  const parts = Array.isArray(spec) ? spec : String(spec).split("|");
  return parts
    .map((name) => {
      const trimmed = String(name).trim();
      if (ALIASES[trimmed]) {
        return { db: "a database", datastore: "a datastore", storage: "storage", entry: "a load balancer or gateway", compute: "servers", async: "a queue or stream" }[trimmed];
      }
      return COMPONENTS[trimmed]?.label || trimmed;
    })
    .join(" or ");
}

// Grades a learner graph against rules:
//   nodes:     [{ type, min = 1, why, label? }]
//   edges:     [{ from, to, why, label? }]              — a direct connection
//   paths:     [{ through: [spec, ...], why, label? }]   — a route visiting these in order
//   forbidden: [{ from, to, why, label? }]              — a direct connection that must NOT exist
//   connected: true                                     — every component is wired in
//   pass:      0.75                                     — share of weight needed to pass
export function gradeGraph(graph, rules = {}) {
  const nodes = graph.nodes || [];
  // Edges may be written { from, to } or ["from", "to", "label"].
  const edges = (graph.edges || [])
    .map((edge) => (Array.isArray(edge) ? { from: edge[0], to: edge[1] } : edge))
    .filter((edge) => edge.from !== edge.to);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = new Map(nodes.map((node) => [node.id, new Set()]));
  for (const edge of edges) {
    if (adjacency.has(edge.from) && adjacency.has(edge.to)) {
      adjacency.get(edge.from).add(edge.to);
      adjacency.get(edge.to).add(edge.from);
    }
  }
  const ofTypes = (types) => nodes.filter((node) => types.has(node.type));
  const checks = [];

  for (const rule of rules.nodes || []) {
    const types = expandSpec(rule.type);
    const min = rule.min ?? 1;
    const count = ofTypes(types).length;
    checks.push({
      kind: "node",
      ok: count >= min,
      weight: 1,
      text: rule.label || (min > 1 ? `At least ${min} × ${specLabel(rule.type)}` : `Includes ${specLabel(rule.type)}`),
      why: rule.why || ""
    });
  }

  for (const rule of rules.edges || []) {
    const from = expandSpec(rule.from);
    const to = expandSpec(rule.to);
    const ok = edges.some((edge) => {
      const a = byId.get(edge.from);
      const b = byId.get(edge.to);
      return a && b && ((from.has(a.type) && to.has(b.type)) || (from.has(b.type) && to.has(a.type)));
    });
    checks.push({ kind: "edge", ok, weight: 1.5, text: rule.label || `${specLabel(rule.from)} ↔ ${specLabel(rule.to)}`, why: rule.why || "" });
  }

  for (const rule of rules.paths || []) {
    const stages = rule.through.map((spec) => expandSpec(spec));
    checks.push({
      kind: "path",
      ok: hasOrderedPath(stages, nodes, adjacency, byId),
      weight: 2,
      text: rule.label || `A request can flow ${rule.through.map((spec) => specLabel(spec)).join(" → ")}`,
      why: rule.why || ""
    });
  }

  for (const rule of rules.forbidden || []) {
    const from = expandSpec(rule.from);
    const to = expandSpec(rule.to);
    const violated = edges.some((edge) => {
      const a = byId.get(edge.from);
      const b = byId.get(edge.to);
      return a && b && ((from.has(a.type) && to.has(b.type)) || (from.has(b.type) && to.has(a.type)));
    });
    checks.push({ kind: "forbidden", ok: !violated, weight: 1, text: rule.label || `No direct ${specLabel(rule.from)} ↔ ${specLabel(rule.to)}`, why: rule.why || "" });
  }

  if (rules.connected) {
    const orphans = nodes.filter((node) => adjacency.get(node.id).size === 0);
    checks.push({
      kind: "connected",
      ok: nodes.length > 0 && orphans.length === 0,
      weight: 0.5,
      text: "Every component is connected",
      why: orphans.length ? `Not wired in: ${orphans.map((node) => node.label || COMPONENTS[node.type]?.label || node.type).join(", ")}.` : "Unconnected boxes don't do anything."
    });
  }

  const total = checks.reduce((sum, check) => sum + check.weight, 0);
  const earned = checks.reduce((sum, check) => sum + (check.ok ? check.weight : 0), 0);
  const score = total ? earned / total : 0;
  return { score, passed: score >= (rules.pass ?? 0.75), checks };
}

// Is there a simple path that visits a node of each stage's types, in order?
// Other components may sit between stages (app → cache → db is fine). Graphs
// are small, so a bounded depth-first search is plenty.
function hasOrderedPath(stages, nodes, adjacency, byId) {
  let budget = 50000;
  const visit = (id, stage, seen) => {
    budget -= 1;
    if (budget < 0) {
      return false;
    }
    let next = stage;
    if (stages[next].has(byId.get(id).type)) {
      next += 1;
    }
    if (next === stages.length) {
      return true;
    }
    for (const neighbor of adjacency.get(id) || []) {
      if (!seen.has(neighbor)) {
        seen.add(neighbor);
        if (visit(neighbor, next, seen)) {
          return true;
        }
        seen.delete(neighbor);
      }
    }
    return false;
  };
  return nodes
    .filter((node) => stages[0].has(node.type))
    .some((node) => visit(node.id, 0, new Set([node.id])));
}

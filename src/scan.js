/**
 * Map a codebase without a model: units (deployable services and packages),
 * their notable dependencies, routes, tables, topics, and the infrastructure
 * that wires them — docker compose, Kubernetes manifests, Helm charts, and
 * Terraform — including the network and trust boundaries those files declare.
 *
 * The result feeds catch-up (building the diagram from code) and turn-end
 * reviews (what changed in the architecture this turn). It never runs code.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseAllDocuments } from "yaml";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next", "vendor", "target", ".venv", "venv", "__pycache__", ".smartypants", ".turbo", ".cache"]);
const SOURCE_EXT = /\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|rb|php|cs|scala|ex|exs|swift)$/i;
const MANIFESTS = ["package.json", "go.mod", "pyproject.toml", "requirements.txt", "Cargo.toml", "pom.xml", "build.gradle", "build.gradle.kts", "Gemfile", "composer.json", "mix.exs"];

/** Dependency name → what it tells us about the architecture. */
const NOTABLE = [
  [/^(express|fastify|koa|hapi|@nestjs\/core|hono|gin-gonic\/gin|labstack\/echo|gofiber|fastapi|flask|django|spring-boot|rails|sinatra|actix-web|axum|laravel)/i, "http api"],
  [/^(next|react|vue|svelte|@angular\/core|nuxt|remix|astro|solid-js)$/i, "web frontend"],
  [/^(graphql|@apollo\/server|apollo-server|graphql-yoga|strawberry|graphene)/i, "graphql"],
  [/^(@grpc\/grpc-js|grpc|google.golang.org\/grpc|grpcio)/i, "grpc"],
  [/^(pg|postgres|pgx|jackc\/pgx|psycopg|psycopg2|asyncpg|@prisma\/client|prisma|typeorm|sequelize|knex|drizzle-orm|sqlalchemy|gorm|lib\/pq)/i, "sql database"],
  [/^(mysql|mysql2|go-sql-driver\/mysql|pymysql)/i, "mysql"],
  [/^(mongodb|mongoose|pymongo|motor|mongo-driver)/i, "mongodb"],
  [/^(redis|ioredis|go-redis|redis-py|@upstash\/redis)/i, "redis"],
  [/^(kafkajs|sarama|segmentio\/kafka-go|confluent-kafka|kafka-python|@confluentinc)/i, "kafka"],
  [/^(amqplib|amqp|pika|streadway\/amqp|rabbitmq)/i, "rabbitmq"],
  [/^(bullmq|bull|bee-queue|celery|rq|sidekiq|asynq)/i, "job queue"],
  [/^(@aws-sdk\/client-s3|aws-sdk|boto3|@google-cloud\/storage|minio|azure-storage-blob|@azure\/storage-blob)/i, "object storage"],
  [/^(@aws-sdk\/client-sqs|@aws-sdk\/client-sns|@google-cloud\/pubsub|nats|@azure\/service-bus)/i, "cloud messaging"],
  [/^(@aws-sdk\/client-dynamodb|@aws-sdk\/lib-dynamodb)/i, "dynamodb"],
  [/^(cassandra-driver|gocql|scylla)/i, "cassandra"],
  [/^(@elastic\/elasticsearch|elasticsearch|opensearch|@opensearch-project|meilisearch|typesense)/i, "search index"],
  [/^(stripe|braintree|@paypal)/i, "payments provider"],
  [/^(twilio|@sendgrid|nodemailer|postmark|@aws-sdk\/client-ses)/i, "messaging provider"],
  [/^(passport|next-auth|@auth0|jsonwebtoken|jose|oauth2|authlib|@clerk)/i, "auth"],
  [/^(@opentelemetry|prom-client|prometheus|datadog|dd-trace|@sentry)/i, "observability"],
  [/^(socket\.io|ws|gorilla\/websocket|websockets)/i, "websocket"],
];

function run(root, args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 });
  } catch {
    return null;
  }
}

/** Tracked and untracked (not ignored) files when this is a git repo; a bounded walk otherwise. */
export function listFiles(root, max = 6000) {
  const git = run(root, ["ls-files", "--cached", "--others", "--exclude-standard"]);
  if (git != null) {
    return git.split("\n").filter(Boolean).filter((file) => !file.split("/").some((part) => SKIP_DIRS.has(part))).slice(0, max);
  }
  const found = [];
  function walk(dir, depth) {
    if (found.length >= max || depth > 8) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name) || (entry.name.startsWith(".") && entry.name !== ".github")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.isFile()) found.push(path.relative(root, full).split(path.sep).join("/"));
      if (found.length >= max) return;
    }
  }
  walk(root, 0);
  return found;
}

function read(root, file, limit = 200000) {
  try {
    const full = path.join(root, file);
    if (fs.statSync(full).size > limit) return "";
    return fs.readFileSync(full, "utf8");
  } catch {
    return "";
  }
}

export function sourceCount(root) {
  return listFiles(root).filter((file) => SOURCE_EXT.test(file)).length;
}

function notable(names) {
  const tags = new Set();
  for (const name of names) {
    for (const [pattern, tag] of NOTABLE) if (pattern.test(name)) tags.add(tag);
  }
  return [...tags];
}

function manifestDeps(file, text) {
  const base = path.basename(file);
  try {
    if (base === "package.json") {
      const pkg = JSON.parse(text);
      return { name: pkg.name, deps: Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }), scripts: Object.keys(pkg.scripts || {}) };
    }
  } catch {
    return { deps: [] };
  }
  if (base === "go.mod") {
    return { name: (text.match(/^module\s+(\S+)/m) || [])[1], deps: [...text.matchAll(/^\s*(?:require\s+)?([\w.-]+\/[\w./-]+)\s+v/gm)].map((m) => m[1].split("/").slice(1).join("/")) };
  }
  if (base === "requirements.txt") return { deps: text.split("\n").map((l) => l.trim().split(/[=<>~\[ ;]/)[0]).filter(Boolean) };
  if (base === "pyproject.toml") {
    const block = text.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
    return { name: (text.match(/^name\s*=\s*"([^"]+)"/m) || [])[1], deps: block ? [...block[1].matchAll(/"([A-Za-z0-9_.-]+)/g)].map((m) => m[1]) : [] };
  }
  if (base === "Cargo.toml") return { deps: [...text.matchAll(/^([a-z0-9_-]+)\s*=/gm)].map((m) => m[1]) };
  if (base === "Gemfile") return { deps: [...text.matchAll(/gem\s+['"]([^'"]+)/g)].map((m) => m[1]) };
  return { deps: [] };
}

const ROUTE = /\b(?:app|router|server|r|api|e|g|mux)\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]|@(?:app|router|bp)\.(get|post|put|patch|delete|route)\(\s*['"]([^'"]+)['"]|@(Get|Post|Put|Patch|Delete)Mapping\(\s*(?:value\s*=\s*)?"([^"]*)"|\.(GET|POST|PUT|PATCH|DELETE)\(\s*"([^"]+)"/g;
const TABLE = /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([A-Za-z_][\w.]*)|\bmodel\s+([A-Z]\w+)\s*\{|__tablename__\s*=\s*['"](\w+)|@Entity\(\s*(?:name\s*=\s*)?['"]?(\w+)?/gi;
const TOPIC = /\btopics?\s*[:=]\s*\[?\s*['"]([\w.-]+)['"]|\b(?:subscribe|publish|produce|send)\(\s*\{?\s*topic\s*:\s*['"]([\w.-]+)['"]|\bqueue(?:Name|Url)?\s*[:=]\s*['"]([\w.-]+)['"]/g;
const ENV = /\b(?:process\.env\.|os\.environ(?:\.get)?\(\s*['"]|os\.Getenv\(\s*"|getenv\(\s*['"]|ENV\[['"])([A-Z][A-Z0-9_]{2,})/g;
const HOST = /https?:\/\/([a-z0-9.-]+\.(?:com|io|net|org|dev|ai|co))\b/gi;

function unitOf(file, units) {
  let best = null;
  for (const unit of units) {
    if ((unit.path === "." || file === unit.path || file.startsWith(`${unit.path}/`)) && (!best || unit.path.length > best.path.length)) best = unit;
  }
  return best;
}

function yamlDocs(text) {
  try {
    return parseAllDocuments(text).map((doc) => doc.toJS()).filter((doc) => doc && typeof doc === "object");
  } catch {
    return [];
  }
}

function k8sObject(doc, file) {
  const kind = doc.kind;
  const meta = doc.metadata || {};
  const spec = doc.spec || {};
  const pod = spec.template?.spec || spec.jobTemplate?.spec?.template?.spec || {};
  const object = { file, kind, name: meta.name || "", namespace: meta.namespace || "" };
  if (/Deployment|StatefulSet|DaemonSet|Job|CronJob/.test(kind)) {
    object.images = (pod.containers || []).map((c) => c.image).filter(Boolean);
    object.ports = (pod.containers || []).flatMap((c) => (c.ports || []).map((p) => p.containerPort)).filter(Boolean);
    object.env = (pod.containers || []).flatMap((c) => (c.env || []).map((e) => e.name)).filter(Boolean).slice(0, 12);
    object.replicas = spec.replicas;
  }
  if (kind === "Service") {
    object.type = spec.type || "ClusterIP";
    object.ports = (spec.ports || []).map((p) => p.port).filter(Boolean);
    object.selector = spec.selector;
  }
  if (kind === "Ingress") {
    object.hosts = (spec.rules || []).map((r) => r.host).filter(Boolean);
    object.backends = (spec.rules || []).flatMap((r) => (r.http?.paths || []).map((p) => `${p.path || "/"}->${p.backend?.service?.name || p.backend?.serviceName || "?"}`));
  }
  if (kind === "NetworkPolicy") {
    object.podSelector = spec.podSelector?.matchLabels || {};
    object.from = (spec.ingress || []).flatMap((rule) => (rule.from || []).map((f) => JSON.stringify(f.podSelector?.matchLabels || f.namespaceSelector?.matchLabels || f.ipBlock?.cidr || {})));
    object.to = (spec.egress || []).flatMap((rule) => (rule.to || []).map((t) => JSON.stringify(t.podSelector?.matchLabels || t.namespaceSelector?.matchLabels || t.ipBlock?.cidr || {})));
  }
  if (kind === "Gateway" || kind === "HTTPRoute" || kind === "VirtualService") {
    object.hosts = spec.hostnames || spec.hosts || [];
  }
  return object;
}

function helmChart(root, dir, files) {
  const chart = yamlDocs(read(root, `${dir}/Chart.yaml`))[0] || {};
  const values = yamlDocs(read(root, `${dir}/values.yaml`))[0] || {};
  const templates = files.filter((f) => f.startsWith(`${dir}/templates/`) && /\.ya?ml$/.test(f));
  const kinds = [];
  for (const file of templates) {
    for (const m of read(root, file).matchAll(/^kind:\s*([A-Za-z]+)/gm)) kinds.push(m[1]);
  }
  const summary = {};
  if (values.image) summary.image = typeof values.image === "string" ? values.image : values.image.repository;
  if (values.service) summary.service = { type: values.service.type, port: values.service.port };
  if (values.ingress) summary.ingress = { enabled: values.ingress.enabled, hosts: (values.ingress.hosts || []).map((h) => (typeof h === "string" ? h : h.host)).filter(Boolean) };
  if (values.replicaCount != null) summary.replicas = values.replicaCount;
  if (values.networkPolicy) summary.networkPolicy = Boolean(values.networkPolicy.enabled ?? true);
  const subcharts = (chart.dependencies || []).map((d) => d.name);
  // Umbrella charts often configure each subchart under its own values key.
  for (const name of subcharts) {
    const sub = values[name];
    if (sub && typeof sub === "object") summary[name] = { enabled: sub.enabled, ingress: sub.ingress?.enabled, service: sub.service?.type };
  }
  return { dir, name: chart.name || path.basename(dir), version: chart.version, subcharts, kinds: [...new Set(kinds)], values: summary };
}

function composeFile(root, file) {
  const doc = yamlDocs(read(root, file))[0];
  if (!doc?.services) return null;
  const services = Object.entries(doc.services).map(([name, svc]) => ({
    name,
    image: svc.image || "",
    build: typeof svc.build === "string" ? svc.build : svc.build?.context || "",
    ports: (svc.ports || []).map(String),
    dependsOn: Array.isArray(svc.depends_on) ? svc.depends_on : Object.keys(svc.depends_on || {}),
    networks: Array.isArray(svc.networks) ? svc.networks : Object.keys(svc.networks || {}),
    env: Array.isArray(svc.environment) ? svc.environment.map((e) => String(e).split("=")[0]) : Object.keys(svc.environment || {}),
  }));
  return { file, services, networks: Object.keys(doc.networks || {}) };
}

const TF_NETWORK = /^(aws_vpc|aws_subnet|aws_security_group|aws_lb|aws_alb|aws_api_gateway|aws_apigatewayv2|aws_cloudfront|aws_route53|aws_wafv2|google_compute_network|google_compute_subnetwork|google_compute_firewall|azurerm_virtual_network|azurerm_subnet|azurerm_network_security_group|azurerm_application_gateway|azurerm_frontdoor)/;

export function scanProject(root, options = {}) {
  const files = listFiles(root, options.maxFiles || 6000);
  const languages = {};
  for (const file of files) {
    const ext = (file.match(/\.([a-z0-9]+)$/i) || [])[1];
    if (ext && SOURCE_EXT.test(file)) languages[ext] = (languages[ext] || 0) + 1;
  }
  const units = [];
  for (const file of files) {
    const base = path.basename(file);
    if (!MANIFESTS.includes(base)) continue;
    const dir = path.dirname(file) === "." ? "." : path.dirname(file);
    if (units.some((u) => u.path === dir)) continue;
    const parsed = manifestDeps(file, read(root, file));
    units.push({ path: dir, manifest: base, name: parsed.name || (dir === "." ? path.basename(root) : path.basename(dir)), tags: notable(parsed.deps || []), deps: (parsed.deps || []).slice(0, 40), files: 0, dockerfile: false, routes: [], tables: [], topics: [], env: [], hosts: [] });
  }
  if (!units.length) units.push({ path: ".", manifest: "", name: path.basename(root), tags: [], deps: [], files: 0, dockerfile: false, routes: [], tables: [], topics: [], env: [], hosts: [] });
  for (const file of files) {
    const unit = unitOf(file, units);
    if (!unit) continue;
    if (/(^|\/)Dockerfile[^/]*$/.test(file)) unit.dockerfile = true;
    if (!SOURCE_EXT.test(file) && !/\.(sql|prisma)$/i.test(file)) continue;
    unit.files += 1;
    if (/(^|\/)(test|tests|__tests__|spec)\//.test(file) || /\.(test|spec)\./.test(file)) continue;
    const text = read(root, file, 120000);
    for (const m of text.matchAll(ROUTE)) {
      const verb = (m[1] || m[3] || m[5] || m[7] || "").toUpperCase();
      const route = m[2] || m[4] || m[6] || m[8];
      if (route && unit.routes.length < 30) unit.routes.push(`${verb} ${route}`);
    }
    for (const m of text.matchAll(TABLE)) {
      const name = m[1] || m[2] || m[3] || m[4];
      if (name && unit.tables.length < 20 && !unit.tables.includes(name)) unit.tables.push(name);
    }
    for (const m of text.matchAll(TOPIC)) {
      const name = m[1] || m[2] || m[3];
      if (name && unit.topics.length < 15 && !unit.topics.includes(name)) unit.topics.push(name);
    }
    for (const m of text.matchAll(ENV)) if (!unit.env.includes(m[1]) && unit.env.length < 25) unit.env.push(m[1]);
    for (const m of text.matchAll(HOST)) {
      const host = m[1].toLowerCase();
      if (!/localhost|example\.(com|org)|schema|w3\.org|github\.com|npmjs/.test(host) && !unit.hosts.includes(host) && unit.hosts.length < 10) unit.hosts.push(host);
    }
  }

  const infra = { compose: [], k8s: [], helm: [], terraform: [], dockerfiles: files.filter((f) => /(^|\/)Dockerfile[^/]*$/.test(f)) };
  const chartDirs = files.filter((f) => path.basename(f) === "Chart.yaml").map((f) => path.dirname(f));
  for (const dir of chartDirs) infra.helm.push(helmChart(root, dir, files));
  for (const file of files) {
    if (/(^|\/)(docker-)?compose[^/]*\.ya?ml$/i.test(file)) {
      const compose = composeFile(root, file);
      if (compose) infra.compose.push(compose);
      continue;
    }
    if (/\.ya?ml$/i.test(file) && !chartDirs.some((dir) => file.startsWith(`${dir}/`))) {
      const text = read(root, file, 400000);
      if (!/^apiVersion:/m.test(text) || !/^kind:/m.test(text)) continue;
      for (const doc of yamlDocs(text)) if (doc.kind && doc.apiVersion) infra.k8s.push(k8sObject(doc, file));
    }
    if (/\.tf$/.test(file)) {
      const resources = [...read(root, file).matchAll(/^resource\s+"([\w-]+)"\s+"([\w-]+)"/gm)].map((m) => ({ type: m[1], name: m[2] }));
      if (resources.length) infra.terraform.push({ file, resources });
    }
  }
  return { root: path.basename(root), files: files.length, languages, units, infra };
}

/** Network and trust boundaries the infrastructure declares, one line each. */
export function boundaries(scan) {
  const lines = [];
  const namespaces = new Set(scan.infra.k8s.map((o) => o.namespace).filter(Boolean));
  if (namespaces.size) lines.push(`k8s namespaces: ${[...namespaces].join(", ")}`);
  for (const o of scan.infra.k8s) {
    if (o.kind === "Ingress") lines.push(`public entry: Ingress ${o.name}${o.namespace ? ` (ns ${o.namespace})` : ""} hosts ${o.hosts.join(",") || "*"} routes ${o.backends.join(" ")}`);
    if (o.kind === "Service" && /LoadBalancer|NodePort/.test(o.type)) lines.push(`exposed: Service ${o.name} type ${o.type} ports ${o.ports.join(",")}`);
    if (o.kind === "NetworkPolicy") lines.push(`network policy ${o.name}: pods ${JSON.stringify(o.podSelector)} from ${o.from.join(" ") || "-"} to ${o.to.join(" ") || "-"}`);
    if (o.kind === "Gateway" || o.kind === "HTTPRoute" || o.kind === "VirtualService") lines.push(`gateway ${o.kind} ${o.name} hosts ${o.hosts.join(",")}`);
  }
  for (const chart of scan.infra.helm) {
    if (chart.values.ingress?.enabled) lines.push(`public entry: helm ${chart.name} ingress ${chart.values.ingress.hosts?.join(",") || ""}`);
    if (chart.values.service?.type && /LoadBalancer|NodePort/.test(chart.values.service.type)) lines.push(`exposed: helm ${chart.name} service ${chart.values.service.type}`);
    if (chart.values.networkPolicy) lines.push(`network policy: helm ${chart.name}`);
  }
  for (const compose of scan.infra.compose) {
    if (compose.networks.length) lines.push(`compose networks (${compose.file}): ${compose.networks.join(", ")}`);
    for (const svc of compose.services) if (svc.ports.length) lines.push(`exposed: compose ${svc.name} ports ${svc.ports.join(",")}`);
  }
  for (const tf of scan.infra.terraform) {
    const net = tf.resources.filter((r) => TF_NETWORK.test(r.type));
    if (net.length) lines.push(`terraform network (${tf.file}): ${net.map((r) => `${r.type}.${r.name}`).join(" ")}`);
  }
  return lines;
}

/** Compact text for prompts. Bounded; every line is evidence, not instructions. */
export function renderScan(scan, maxChars = 14000) {
  const lines = [];
  const langs = Object.entries(scan.languages).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([ext, n]) => `${ext}:${n}`).join(" ");
  lines.push(`repo ${scan.root}: ${scan.files} files; languages ${langs || "-"}`);
  for (const unit of scan.units.slice(0, 30)) {
    lines.push(`unit ${unit.path} (${unit.name}) ${unit.manifest || ""} files:${unit.files}${unit.dockerfile ? " docker" : ""}${unit.tags.length ? ` uses:${unit.tags.join(",")}` : ""}`);
    if (unit.routes.length) lines.push(`  routes ${unit.routes.slice(0, 12).join("; ")}`);
    if (unit.tables.length) lines.push(`  tables ${unit.tables.slice(0, 12).join(", ")}`);
    if (unit.topics.length) lines.push(`  topics ${unit.topics.join(", ")}`);
    if (unit.env.length) lines.push(`  env ${unit.env.filter((e) => /URL|HOST|ADDR|DSN|BROKER|BUCKET|QUEUE|TOPIC|ENDPOINT|DATABASE|REDIS|KAFKA/.test(e)).slice(0, 12).join(", ")}`);
    if (unit.hosts.length) lines.push(`  calls ${unit.hosts.join(", ")}`);
  }
  for (const compose of scan.infra.compose) {
    for (const svc of compose.services) {
      lines.push(`compose ${svc.name}: ${svc.image || `build ${svc.build}`}${svc.ports.length ? ` ports ${svc.ports.join(",")}` : ""}${svc.dependsOn.length ? ` depends ${svc.dependsOn.join(",")}` : ""}${svc.networks.length ? ` nets ${svc.networks.join(",")}` : ""}`);
    }
  }
  for (const o of scan.infra.k8s.slice(0, 60)) {
    const extra = o.images ? ` images ${o.images.join(",")}` : o.type ? ` ${o.type} ports ${o.ports.join(",")}` : o.backends ? ` ${o.backends.join(" ")}` : "";
    lines.push(`k8s ${o.kind} ${o.name}${o.namespace ? ` ns:${o.namespace}` : ""}${extra}`);
  }
  for (const chart of scan.infra.helm) {
    lines.push(`helm chart ${chart.name} (${chart.dir}) templates ${chart.kinds.join(",") || "-"}${chart.subcharts.length ? ` subcharts ${chart.subcharts.join(",")}` : ""} values ${JSON.stringify(chart.values)}`);
  }
  for (const tf of scan.infra.terraform.slice(0, 20)) {
    lines.push(`terraform ${tf.file}: ${tf.resources.slice(0, 20).map((r) => `${r.type}.${r.name}`).join(" ")}`);
  }
  const bounds = boundaries(scan);
  if (bounds.length) {
    lines.push("boundaries:");
    lines.push(...bounds.map((line) => `  ${line}`));
  }
  let text = lines.join("\n");
  if (text.length > maxChars) text = `${text.slice(0, maxChars)}\n(truncated)`;
  return text;
}

export function isInfraFile(file) {
  return /(^|\/)(Chart\.yaml|values[^/]*\.ya?ml|Dockerfile[^/]*|(docker-)?compose[^/]*\.ya?ml)$|(^|\/)(templates|k8s|kubernetes|manifests|deploy|helm|charts|infra|terraform)\/.*\.(ya?ml|tf)$|\.tf$/i.test(file);
}

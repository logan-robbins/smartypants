/**
 * Map a codebase without a model: units (deployable services and packages),
 * their notable dependencies, routes, tables, topics, and the infrastructure
 * that wires them — docker compose, Kubernetes manifests, kustomize, Helm
 * charts, Terraform, and Procfiles — including the network and trust
 * boundaries those files declare.
 *
 * Each unit gets a role (service, worker, frontend, mobile, cli, app,
 * library, tooling, test, docs, example) so catch-up can read the parts that
 * run and fold the packages they import.
 *
 * The result feeds catch-up (building the diagram from code) and turn-end
 * reviews (what changed in the architecture this turn). It never runs code,
 * and the same tree always gives the same map.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseAllDocuments } from "yaml";

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "coverage", ".next", "vendor", "target", ".venv", "venv", "__pycache__", ".smartypants", ".turbo", ".cache",
  "bower_components", "jspm_packages", ".yarn", ".pnpm-store", "Pods", ".gradle", ".idea", ".vscode", ".dart_tool", ".terraform", ".svelte-kit", ".nuxt",
  ".output", ".serverless", ".angular", "site-packages", "__generated__", ".mypy_cache", ".pytest_cache", ".tox", ".nox", "third_party", "third-party",
  "DerivedData", ".expo", ".docusaurus", "storybook-static", ".parcel-cache", ".vercel", ".netlify", "elm-stuff", "deps", "_build",
]);
const SOURCE_EXT = /\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|kts|rb|php|cs|fs|scala|ex|exs|swift|dart|svelte|vue|astro|c|cc|cpp|cxx|h|hh|hpp|hxx|m|mm|zig|lua|clj|erl|hs|ml|nim|cr|groovy|pl|r)$/i;
/** Files that never carry architecture: media, archives, binaries, lockfiles, model weights. */
const BINARY_EXT = /\.(?:png|jpe?g|gif|webp|ico|icns|bmp|tiff?|svg|heic|avif|mp[34]|m4a|mov|avi|mkv|webm|wav|ogg|flac|woff2?|ttf|otf|eot|zip|tar|gz|tgz|bz2|xz|7z|rar|jar|war|ear|class|so|dylib|dll|exe|bin|o|a|lib|obj|pyc|pyo|wasm|pdf|psd|ai|sketch|fig|dat|db|sqlite3?|onnx|pt|pth|ckpt|safetensors|npy|npz|parquet|arrow|pkl|h5|tflite|mlmodel|lock|map|snap|keystore|jks|p12|pem|der|crt|key)$/i;
/** Generated or bundled sources: counted nowhere, read never. */
const GENERATED = /(?:\.min\.[cm]?js|\.bundle\.js|\.chunk\.js|\.pb\.go|\.pb\.gw\.go|_pb2(?:_grpc)?\.pyi?|_grpc\.pb\.go|\.g\.dart|\.freezed\.dart|\.gr\.dart|\.generated\.[a-z]+|\.gen\.[a-z]+|_generated\.[a-z]+|\.d\.ts|\.designer\.cs)$/i;
/** Paths that show how the code is tested, documented, or demonstrated, not how it runs. */
const AUX_SEGMENT = /^(?:examples?|samples?|demos?|fixtures?|__fixtures__|testdata|test-data|__mocks__|mocks?|e2e|tests?|testing|__tests__|spec|specs|integration[-_]?tests?|benchmarks?|benches|docs?|documentation|\.github|\.gitlab|\.circleci|\.devcontainer|fuzz|fuzzing)$/i;
const MAX_LIST = 60000;
const MAX_READ_PER_UNIT = 1500;
const MAX_READ_TOTAL = 12000;

const MANIFEST_NAMES = new Set(["package.json", "go.mod", "pyproject.toml", "requirements.txt", "setup.py", "Pipfile", "Cargo.toml", "pom.xml", "build.gradle", "build.gradle.kts", "Gemfile", "composer.json", "mix.exs", "pubspec.yaml", "deno.json", "deno.jsonc", "Package.swift", "project.json"]);
const MANIFEST_EXT = /\.(?:csproj|fsproj|vbproj)$/i;

export function isManifest(file) {
  const base = path.basename(file);
  return MANIFEST_NAMES.has(base) || MANIFEST_EXT.test(base);
}

const ECOSYSTEM = { "package.json": "npm", "project.json": "npm", "deno.json": "npm", "deno.jsonc": "npm", "Cargo.toml": "cargo", "pyproject.toml": "py", "setup.py": "py", "requirements.txt": "py", "Pipfile": "py", "go.mod": "go", "Gemfile": "ruby", "composer.json": "php", "mix.exs": "elixir", "pubspec.yaml": "dart", "pom.xml": "jvm", "build.gradle": "jvm", "build.gradle.kts": "jvm", "Package.swift": "swift" };
/** Build files that make the repository root a unit when its code has no package manifest (C, C++, Zig). */
const ROOT_BUILD = /^(?:Makefile|GNUmakefile|CMakeLists\.txt|meson\.build|configure\.ac|configure\.in|SConstruct|BUILD\.bazel|BUILD|WORKSPACE|MODULE\.bazel|build\.zig|premake5\.lua|Makefile\.am)$/;

const DOCKERFILE = /(^|\/)(?:Dockerfile|Containerfile)(?:\.[^/]*)?$|(^|\/)[^/]+\.Dockerfile$/;

/**
 * Dependency name → what it tells us about the architecture. A name matches
 * when it equals an alternative or continues it with a separator
 * ("flask-cors" is flask; "requests" is not rq).
 */
function lib(pattern, { exact = false } = {}) {
  return new RegExp(`^(?:${pattern})${exact ? "$" : "(?:$|[-_./:@\\[])"}`, "i");
}
const NOTABLE = [
  [lib("express|fastify|koa|@hapi/hapi|hapi|@nestjs/core|@nestjs/platform-express|hono|@hono/node-server|gin-gonic/gin|labstack/echo|gofiber/fiber|go-chi/chi|gorilla/mux|fastapi|flask|django|djangorestframework|starlette|sanic|aiohttp|tornado|litestar|spring-boot-starter-web|spring-boot-starter-webflux|spring-webmvc|rails|sinatra|hanami|actix-web|axum|rocket|warp|poem|laravel/framework|laravel|symfony/framework-bundle|slim/slim|phoenix|plug_cowboy|microsoft\\.aspnetcore|ktor-server-core|io\\.ktor|vapor|elysia|@trpc/server"), "http api"],
  [lib("next|react|react-dom|vue|svelte|@sveltejs/kit|@angular/core|nuxt|remix|@remix-run/react|astro|solid-js|preact|@builder\\.io/qwik|@tanstack/react-start|@tanstack/start|ember-source|lit|alpinejs", { exact: true }), "web frontend"],
  [lib("react-native|expo|flutter|@capacitor/core|@ionic/core|nativescript", { exact: true }), "mobile app"],
  [lib("electron|@tauri-apps/api|tauri", { exact: true }), "desktop app"],
  [lib("graphql|@apollo/server|apollo-server|apollo-server-express|graphql-yoga|@graphql-yoga/node|mercurius|strawberry-graphql|strawberry|graphene|ariadne|gqlgen|99designs/gqlgen|graphql-ruby|hotchocolate\\.aspnetcore|@nestjs/graphql"), "graphql"],
  [lib("@grpc/grpc-js|grpc|google\\.golang\\.org/grpc|grpcio|grpc-netty|grpc-netty-shaded|grpc-stub|grpc\\.aspnetcore|grpc\\.net\\.client|tonic|@connectrpc/connect|connectrpc|@bufbuild/connect|bufbuild/connect-go"), "grpc"],
  [lib("pg|postgres|pgx|jackc/pgx|psycopg|psycopg2|psycopg2-binary|asyncpg|@prisma/client|prisma|typeorm|sequelize|knex|kysely|drizzle-orm|@mikro-orm/core|objection|sqlalchemy|sqlmodel|alembic|tortoise-orm|peewee|gorm|gorm\\.io/gorm|lib/pq|sqlx|diesel|sea-orm|jmoiron/sqlx|spring-boot-starter-data-jpa|hibernate-core|npgsql|microsoft\\.entityframeworkcore|activerecord|ecto_sql|postgrex|doctrine/orm|pg-promise|better-sqlite3|sqlite3|libsql|@libsql/client|@neondatabase/serverless|@vercel/postgres|@planetscale/database|duckdb"), "sql database"],
  [lib("mysql|mysql2|go-sql-driver/mysql|pymysql|mysqlclient|aiomysql|mysql-connector-java|mysql-connector-python|mysql2-ruby"), "mysql"],
  [lib("mongodb|mongoose|pymongo|motor|mongo-driver|mongodb/mongo-go-driver|mongoid|spring-boot-starter-data-mongodb|mongodb\\.driver|@typegoose/typegoose|beanie"), "mongodb"],
  [lib("redis|ioredis|go-redis|redis-py|@upstash/redis|@redis/client|stackexchange\\.redis|spring-boot-starter-data-redis|redis-rb|hiredis|redix|valkey|@valkey/valkey-glide|aioredis|fred"), "redis"],
  [lib("memcached|pymemcache|pylibmc|dalli|memjs|bradfitz/gomemcache"), "cache"],
  [lib("kafkajs|sarama|IBM/sarama|Shopify/sarama|segmentio/kafka-go|confluent-kafka|confluentinc/confluent-kafka-go|kafka-python|aiokafka|@confluentinc/kafka-javascript|spring-kafka|kafka-clients|rdkafka|ruby-kafka|karafka|@nestjs/microservices"), "kafka"],
  [lib("amqplib|amqp|amqp-connection-manager|pika|aio-pika|aio_pika|streadway/amqp|rabbitmq/amqp091-go|rabbitmq|bunny|spring-boot-starter-amqp|rabbitmq\\.client|lapin|kombu"), "rabbitmq"],
  [lib("bullmq|bull|bee-queue|agenda|pg-boss|graphile-worker|@nestjs/bullmq|@nestjs/bull|celery|rq|dramatiq|huey|arq|sidekiq|resque|good_job|delayed_job|solid_queue|asynq|hibiken/asynq|machinery|oban|hangfire|quartz|temporalio|@temporalio/client|@temporalio/worker|go\\.temporal\\.io/sdk|inngest|trigger\\.dev|@trigger\\.dev/sdk"), "job queue"],
  [lib("@aws-sdk/client-s3|aws-sdk|boto3|aioboto3|aws-sdk-go|aws/aws-sdk-go|aws/aws-sdk-go-v2|@google-cloud/storage|cloud\\.google\\.com/go/storage|google-cloud-storage|minio|minio/minio-go|azure-storage-blob|@azure/storage-blob|aws-sdk-s3|activestorage|shrine|carrierwave|paperclip|aws-sdk-core|awssdk\\.s3|aws-sdk-rust|aws-sdk-s3"), "object storage"],
  [lib("@aws-sdk/client-sqs|@aws-sdk/client-sns|@aws-sdk/client-eventbridge|@google-cloud/pubsub|cloud\\.google\\.com/go/pubsub|google-cloud-pubsub|nats|nats\\.go|nats-io/nats\\.go|nats-py|@azure/service-bus|azure-servicebus|@azure/event-hubs|pulsar-client|apache/pulsar-client-go|mqtt|paho-mqtt|eclipse/paho\\.mqtt\\.golang|zeromq|pyzmq|nsqio/go-nsq"), "cloud messaging"],
  [lib("@aws-sdk/client-dynamodb|@aws-sdk/lib-dynamodb|dynamoose|pynamodb|guregu/dynamo"), "dynamodb"],
  [lib("cassandra-driver|gocql|gocql/gocql|scylla|scylla-driver"), "cassandra"],
  [lib("@elastic/elasticsearch|elasticsearch|elasticsearch-dsl|olivere/elastic|elastic/go-elasticsearch|opensearch|opensearch-py|@opensearch-project/opensearch|meilisearch|typesense|algoliasearch|searchkick|chewy|tantivy|@orama/orama"), "search index"],
  [lib("pgvector|@pinecone-database/pinecone|pinecone-client|pinecone|qdrant-client|@qdrant/js-client-rest|weaviate-client|weaviate-ts-client|chromadb|pymilvus|lancedb|faiss-cpu|faiss-gpu"), "vector store"],
  [lib("openai|@anthropic-ai/sdk|anthropic|@google/generative-ai|@google/genai|google-generativeai|langchain|@langchain/core|llama-index|llama_index|ollama|cohere|cohere-ai|mistralai|@mistralai/mistralai|transformers|torch|tensorflow|onnxruntime|onnxruntime-node|sentence-transformers|huggingface-hub|ai|@ai-sdk/openai|litellm", { exact: true }), "ml/llm"],
  [lib("stripe|stripe-go|stripe/stripe-go|braintree|@paypal/checkout-server-sdk|@paypal|paypal-rest-sdk|adyen|@adyen/api-library|square|mollie|@lemonsqueezy/lemonsqueezy\\.js|paddle"), "payments provider"],
  [lib("twilio|@sendgrid/mail|@sendgrid|sendgrid|nodemailer|postmark|@aws-sdk/client-ses|resend|mailgun|mailgun\\.js|@mailchimp/mailchimp_transactional|mailjet|smtplib|actionmailer|lettre|go-mail|gomail|firebase-admin|@novu/node|web-push|pywebpush|apns2|onesignal"), "messaging provider"],
  [lib("passport|next-auth|@auth/core|@auth0|auth0|jsonwebtoken|jose|oauth2|authlib|@clerk|@clerk/nextjs|better-auth|lucia|@supabase/auth-helpers|python-jose|pyjwt|djangorestframework-simplejwt|devise|omniauth|golang-jwt/jwt|coreos/go-oidc|keycloak|@keycloak|openid-client|passport-jwt|@nestjs/passport|@nestjs/jwt|firebase-auth|supertokens-node|@workos-inc/node|spring-boot-starter-security|spring-boot-starter-oauth2-client"), "auth"],
  [lib("@opentelemetry|opentelemetry|opentelemetry-api|opentelemetry-sdk|go\\.opentelemetry\\.io/otel|prom-client|prometheus|prometheus_client|prometheus-client|prometheus/client_golang|datadog|dd-trace|ddtrace|@sentry|sentry-sdk|sentry-ruby|getsentry/sentry-go|newrelic|@newrelic|elastic-apm-node|@grafana/faro-web-sdk|pino|winston|structlog|zap|go\\.uber\\.org/zap|sirupsen/logrus"), "observability"],
  [lib("socket\\.io|socket\\.io-client|ws|gorilla/websocket|nhooyr\\.io/websocket|coder/websocket|websockets|channels|django-channels|actioncable|@nestjs/websockets|@nestjs/platform-socket\\.io|uwebsockets\\.js|tokio-tungstenite|@fastify/websocket|pusher|ably|@supabase/realtime-js|centrifuge", { exact: true }), "websocket"],
  [lib("@supabase/supabase-js|supabase|firebase|@firebase/app|pocketbase|appwrite|convex"), "backend-as-a-service"],
];

function run(root, args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 });
  } catch {
    return null;
  }
}

/** A path worth mapping: not dependency, build, cache, or generated output, and not a binary. */
export function isScannable(file) {
  if (BINARY_EXT.test(file) || GENERATED.test(file)) return false;
  return !file.split("/").some((part) => SKIP_DIRS.has(part));
}

/** Manifests, Dockerfiles, and deploy files outrank everything else when a list must be capped. */
function structural(file) {
  return isManifest(file) || DOCKERFILE.test(file) || /\.(ya?ml|tf|toml)$|(^|\/)Procfile/.test(file);
}

function capList(files, max) {
  if (files.length <= max) return files;
  const keep = files.filter(structural);
  const rest = files.filter((file) => !structural(file));
  return [...keep.slice(0, max), ...rest.slice(0, Math.max(0, max - keep.length))].sort();
}

/**
 * Tracked (including initialized submodules) and untracked-but-not-ignored
 * files when this is a git work tree; a bounded, symlink-safe walk otherwise.
 * Sorted, so the same tree always gives the same list.
 */
export function listFiles(root, max = MAX_LIST) {
  const cached = run(root, ["ls-files", "-z", "--cached", "--recurse-submodules"]) ?? run(root, ["ls-files", "-z", "--cached"]);
  if (cached != null) {
    const others = run(root, ["ls-files", "-z", "--others", "--exclude-standard"]) || "";
    const all = [...new Set(`${cached}\0${others}`.split("\0").filter(Boolean))]
      .filter((file) => isScannable(file) && !isGitlink(root, file))
      .sort();
    if (all.length) return capList(all, max);
  }
  return capList(walk(root, Math.max(max * 2, MAX_LIST)).filter(isScannable).sort(), max);
}

/** An uninitialized submodule shows up as a directory entry, not a file. */
function isGitlink(root, file) {
  if (/\.[A-Za-z0-9]+$/.test(file) || isManifest(file)) return false;
  try {
    return fs.lstatSync(path.join(root, file)).isDirectory();
  } catch {
    return false;
  }
}

function walk(root, max) {
  const found = [];
  const queue = [[root, 0]];
  let visited = 0;
  while (queue.length && found.length < max && visited < max * 8) {
    const [dir, depth] = queue.shift();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    } catch {
      continue;
    }
    for (const entry of entries) {
      visited += 1;
      if (SKIP_DIRS.has(entry.name) || (entry.name.startsWith(".") && entry.name !== ".github")) continue;
      // Symlinks are skipped: they loop, and they point outside the project.
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < 24) queue.push([full, depth + 1]);
      } else if (entry.isFile()) found.push(path.relative(root, full).split(path.sep).join("/"));
      if (found.length >= max) break;
    }
  }
  return found;
}

function read(root, file, limit = 200000) {
  try {
    const full = path.join(root, file);
    const stat = fs.statSync(full);
    if (!stat.isFile() || stat.size > limit) return "";
    const text = fs.readFileSync(full, "utf8");
    // A NUL byte early on means a binary file with a source-like name.
    if (text.slice(0, 2000).includes("\u0000")) return "";
    return text;
  } catch {
    return "";
  }
}

export function sourceCount(root) {
  return listFiles(root).filter((file) => SOURCE_EXT.test(file)).length;
}

export function isInfraFile(file) {
  return /(^|\/)(Chart\.yaml|values[^/]*\.ya?ml|kustomization\.ya?ml|Dockerfile[^/]*|Containerfile[^/]*|Procfile[^/]*|(docker-|podman-)?compose[^/]*\.ya?ml|skaffold\.ya?ml|serverless\.ya?ml)$|(^|\/)(templates|k8s|kubernetes|kube|manifests|deploy|deployment|deployments|helm|charts|infra|infrastructure|terraform|kustomize|overlays|base)\/.*\.(ya?ml|tf|json)$|\.(tf|tfvars)$/i.test(file);
}

/** How big an existing project is: source files, and infrastructure files that describe a running system. */
export function projectSize(root) {
  const files = listFiles(root);
  return {
    files: files.length,
    source: files.filter((file) => SOURCE_EXT.test(file)).length,
    infra: files.filter((file) => isInfraFile(file) && !isAux(file)).length,
  };
}

function notable(names) {
  const tags = new Set();
  for (const name of names) {
    for (const [pattern, tag] of NOTABLE) if (pattern.test(name)) tags.add(tag);
  }
  return [...tags];
}

/** The list inside `key = [ ... ]`, honouring quotes so "uvicorn[standard]" does not end it. */
function tomlArray(text, key) {
  const start = text.search(new RegExp(`^\\s*${key}\\s*=\\s*\\[`, "m"));
  if (start < 0) return [];
  const open = text.indexOf("[", text.indexOf("=", start));
  const items = [];
  let quote = null;
  let current = "";
  for (let i = open + 1; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) {
        items.push(current);
        current = "";
        quote = null;
      } else current += ch;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "#") i = text.indexOf("\n", i) < 0 ? text.length : text.indexOf("\n", i);
    else if (ch === "]") break;
  }
  return items;
}

/** Keys of each TOML table whose header matches `pattern`, plus `[pattern.name]` sub-tables. */
function tomlTableKeys(text, pattern) {
  const keys = [];
  let active = false;
  for (const line of text.split("\n")) {
    const header = line.match(/^\s*\[{1,2}([^\]]+)\]{1,2}\s*$/);
    if (header) {
      const name = header[1].trim();
      active = pattern.test(name);
      const sub = name.match(/^(?:.*\.)?(?:dependencies|dev-dependencies|build-dependencies)\.([\w.-]+)$/);
      if (sub && pattern.test(name.slice(0, name.length - sub[1].length - 1))) keys.push(sub[1]);
      continue;
    }
    if (!active) continue;
    const key = line.match(/^\s*"?([A-Za-z0-9_.@/-]+)"?\s*=/);
    if (key) keys.push(key[1]);
  }
  return keys;
}

function pep508(spec) {
  return String(spec).trim().split(/[=<>~!;\s\[(]/)[0];
}

/** Name, dependencies, and the facts that tell an app from a library, per manifest type. */
function manifestInfo(file, text) {
  const base = path.basename(file);
  const info = { deps: [], devDeps: [], name: undefined, facts: {} };
  try {
    if (base === "package.json") {
      const pkg = JSON.parse(text);
      info.name = pkg.name;
      info.deps = Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies });
      info.devDeps = Object.keys(pkg.devDependencies || {});
      info.facts.scripts = Object.keys(pkg.scripts || {});
      info.facts.startScript = String(pkg.scripts?.start || pkg.scripts?.serve || "");
      info.facts.bin = Boolean(pkg.bin);
      info.facts.libraryFields = Boolean(pkg.exports || pkg.main || pkg.module || pkg.types || pkg.typings);
      info.facts.private = Boolean(pkg.private);
      info.facts.workspaces = Array.isArray(pkg.workspaces) ? pkg.workspaces : Array.isArray(pkg.workspaces?.packages) ? pkg.workspaces.packages : [];
      return info;
    }
    if (base === "project.json") {
      const project = JSON.parse(text);
      if (!project || typeof project !== "object" || !(project.projectType || project.targets || String(project.$schema || "").includes("nx"))) return null;
      info.name = project.name;
      info.facts.projectType = project.projectType;
      info.facts.scripts = Object.keys(project.targets || {});
      return info;
    }
    if (base === "deno.json" || base === "deno.jsonc") {
      const deno = JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""));
      info.name = deno.name;
      info.deps = Object.values(deno.imports || {}).map((spec) => String(spec).replace(/^(npm:|jsr:)/, "").replace(/@[^@/]*$/, ""));
      info.facts.scripts = Object.keys(deno.tasks || {});
      return info;
    }
    if (base === "composer.json") {
      const composer = JSON.parse(text);
      info.name = composer.name;
      info.deps = Object.keys(composer.require || {});
      info.devDeps = Object.keys(composer["require-dev"] || {});
      return info;
    }
  } catch {
    return info;
  }
  if (base === "go.mod") {
    const module = (text.match(/^module\s+(\S+)/m) || [])[1] || "";
    const segments = module.split("/");
    info.name = /^v\d+$/.test(segments.at(-1)) ? segments.at(-2) : segments.at(-1);
    info.facts.module = module;
    info.deps = text.split("\n")
      .filter((line) => !/\/\/\s*indirect/.test(line))
      .map((line) => line.match(/^\s*(?:require\s+)?([\w.-]+\.[\w-]+\/[\w./-]+|[\w.-]+\.(?:org|io|com|dev|in)\/[\w./-]+)\s+v/))
      .filter(Boolean)
      .map((m) => m[1].split("/").slice(1).join("/") || m[1]);
    info.facts.replaces = [...text.matchAll(/^\s*(?:replace\s+)?\S+(?:\s+v\S+)?\s+=>\s+(\.{1,2}\/\S+)/gm)].map((m) => m[1]);
    return info;
  }
  if (base === "requirements.txt") {
    info.deps = text.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && !line.startsWith("-")).map(pep508).filter(Boolean);
    return info;
  }
  if (base === "pyproject.toml") {
    info.name = (text.match(/^\s*name\s*=\s*["']([^"']+)["']/m) || [])[1];
    info.deps = [
      ...tomlArray(text, "dependencies").map(pep508),
      ...tomlTableKeys(text, /^tool\.poetry\.(?:group\.\w+\.)?dependencies$/).filter((name) => name !== "python"),
    ].filter(Boolean);
    info.facts.scripts = tomlTableKeys(text, /^(?:project\.scripts|tool\.poetry\.scripts)$/);
    return info;
  }
  if (base === "setup.py") {
    info.name = (text.match(/\bname\s*=\s*["']([^"']+)["']/) || [])[1];
    const block = text.match(/install_requires\s*=\s*\[([\s\S]*?)\]\s*[,)]/);
    info.deps = block ? [...block[1].matchAll(/["']([^"']+)["']/g)].map((m) => pep508(m[1])).filter(Boolean) : [];
    info.facts.scripts = /console_scripts|entry_points/.test(text) ? ["cli"] : [];
    return info;
  }
  if (base === "Pipfile") {
    info.deps = tomlTableKeys(text, /^packages$/);
    return info;
  }
  if (base === "Cargo.toml") {
    info.name = (text.match(/^\[package\][\s\S]*?^\s*name\s*=\s*"([^"]+)"/m) || [])[1];
    info.deps = tomlTableKeys(text, /(?:^|\.)(?:dependencies)$/);
    info.facts.bin = /^\[\[bin\]\]/m.test(text);
    info.facts.workspace = /^\[workspace\]/m.test(text);
    info.facts.members = tomlArray(text, "members");
    info.facts.pathDeps = [...text.matchAll(/path\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
    return info;
  }
  if (base === "Gemfile") {
    info.deps = [...text.matchAll(/^\s*gem\s+['"]([^'"]+)/gm)].map((m) => m[1]);
    return info;
  }
  if (base === "mix.exs") {
    info.name = (text.match(/app:\s*:(\w+)/) || [])[1];
    info.deps = [...text.matchAll(/\{\s*:(\w+)\s*,/g)].map((m) => m[1]);
    return info;
  }
  if (base === "pubspec.yaml") {
    const doc = yamlDocs(text)[0] || {};
    info.name = doc.name;
    info.deps = Object.keys(doc.dependencies || {});
    if (doc.dependencies?.flutter) info.deps.push("flutter");
    return info;
  }
  if (base === "pom.xml") {
    info.name = (text.replace(/<parent>[\s\S]*?<\/parent>/, "").match(/<artifactId>([^<]+)<\/artifactId>/) || [])[1];
    info.deps = [...text.matchAll(/<dependency>[\s\S]*?<artifactId>([^<]+)<\/artifactId>/g)].map((m) => m[1]);
    info.facts.modules = [...text.matchAll(/<module>([^<]+)<\/module>/g)].map((m) => m[1]);
    return info;
  }
  if (base === "build.gradle" || base === "build.gradle.kts") {
    info.deps = [...text.matchAll(/\b(?:implementation|api|compile|compileOnly|runtimeOnly|kapt|ksp)\s*\(?\s*(?:platform\()?\s*['"]([^:'"]+):([^:'"]+)/g)].flatMap((m) => [m[2], `${m[1]}.${m[2]}`]);
    info.facts.application = /\bapplication\b|org\.springframework\.boot|com\.android\.application|mainClass/.test(text);
    info.facts.projectDeps = [...text.matchAll(/project\(\s*['"]:([\w:-]+)['"]\s*\)/g)].map((m) => m[1].replaceAll(":", "/"));
    return info;
  }
  if (base === "Package.swift") {
    info.name = (text.match(/name:\s*"([^"]+)"/) || [])[1];
    info.deps = [...text.matchAll(/\.package\(\s*(?:name:\s*"[^"]+",\s*)?url:\s*"[^"]*\/([^/"]+?)(?:\.git)?"/g)].map((m) => m[1]);
    info.facts.bin = /\.executableTarget\(/.test(text);
    return info;
  }
  if (MANIFEST_EXT.test(base)) {
    info.name = base.replace(MANIFEST_EXT, "");
    info.deps = [...text.matchAll(/<PackageReference\s+Include="([^"]+)"/gi)].map((m) => m[1]);
    info.facts.application = /Sdk="Microsoft\.NET\.Sdk\.Web"|<OutputType>\s*Exe/i.test(text);
    info.facts.projectDeps = [...text.matchAll(/<ProjectReference\s+Include="([^"]+)"/gi)].map((m) => m[1].replaceAll("\\", "/"));
    return info;
  }
  return info;
}

/** Route patterns; each turns a match into "VERB /path" (or null to skip). */
const ROUTES = [
  // Express, Fastify, Hono, Koa routers, and the like.
  [/\b(?:app|router|server|r|api|e|g|mux|route|routes|fastify|hono|v1|v2|admin|public|private|protected|authed)\.(get|post|put|patch|delete|all)\(\s*['"`]([^'"`]+)['"`]/g, (m) => `${m[1].toUpperCase()} ${m[2]}`],
  // FastAPI, Flask, Sanic, Litestar decorators.
  [/@\w+\.(get|post|put|patch|delete|route|websocket|api_route)\(\s*['"]([^'"]*)['"]/g, (m) => `${m[1] === "route" || m[1] === "api_route" ? "ANY" : m[1].toUpperCase()} ${m[2] || "/"}`],
  // Spring.
  [/@(Get|Post|Put|Patch|Delete|Request)Mapping\(\s*(?:value\s*=\s*|path\s*=\s*)?\{?\s*"([^"]*)"/g, (m) => `${m[1] === "Request" ? "ANY" : m[1].toUpperCase()} ${m[2] || "/"}`],
  // NestJS (the controller prefix is added below).
  [/@(Get|Post|Put|Patch|Delete|All)\(\s*(?:['"`]([^'"`]*)['"`])?\s*[,)]/g, (m, prefix) => (prefix == null ? null : `${m[1].toUpperCase()} ${`/${[prefix, m[2]].filter(Boolean).join("/")}`.replace(/\/+/g, "/")}`)],
  // Gin, Echo, Fiber, chi.
  [/\.(GET|POST|PUT|PATCH|DELETE|Get|Post|Put|Patch|Delete)\(\s*"(\/[^"]*)"/g, (m) => `${m[1].toUpperCase()} ${m[2]}`],
  // net/http, gorilla/mux; Go 1.22 patterns may carry the method.
  [/\bHandle(?:Func)?\(\s*"((?:[A-Z]+\s+)?\/[^"]*)"/g, (m) => (/\s/.test(m[1]) ? m[1].replace(/\s+/, " ") : `ANY ${m[1]}`)],
  // ASP.NET minimal APIs and attribute routes.
  [/\bMap(Get|Post|Put|Patch|Delete)\(\s*"([^"]+)"/g, (m) => `${m[1].toUpperCase()} ${m[2]}`],
  [/\[Http(Get|Post|Put|Patch|Delete)\(\s*"([^"]*)"/g, (m) => `${m[1].toUpperCase()} ${m[2] || "/"}`],
];
const RAILS_ROUTES = [/^\s*(get|post|put|patch|delete|match)\s+['"]([^'"]+)['"]/gm, /^\s*(resources?)\s+:(\w+)/gm];
const DJANGO_ROUTES = /\b(?:re_)?path\(\s*r?['"]([^'"]*)['"]/g;

const TABLES = [
  [/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"[]?(?:\w+[`"\]]?\.[`"[]?)?([A-Za-z_]\w*)/gi, /\.(sql|[cm]?[jt]s|py|go|rb|java|kt|cs|rs|php|ex)$/i],
  [/^model\s+([A-Z]\w*)\s*\{/gm, /\.prisma$/i],
  [/__tablename__\s*=\s*['"](\w+)/g, /\.py$/i],
  [/\bclass\s+(\w+)\s*\([^)]*\bmodels\.Model\b/g, /\.py$/i],
  [/\bclass\s+(\w+)\s*\([^)]*\bSQLModel\b[^)]*\btable\s*=\s*True/g, /\.py$/i],
  [/@(?:Entity|Table)\(\s*(?:\{\s*name:\s*)?['"](\w+)['"]/g, /\.([cm]?[jt]s|java|kt)$/i],
  [/@Entity(?:\([^)]*\))?\s*(?:@\w+(?:\([^)]*\))?\s*)*(?:export\s+)?(?:public\s+)?(?:abstract\s+)?class\s+(\w+)/g, /\.([cm]?[jt]s|java|kt)$/i],
  [/\bcreate_table\s+[:'"]([\w.]+)/g, /\.rb$/i],
  [/\b(?:pg|mysql|sqlite)Table\(\s*['"](\w+)['"]/g, /\.[cm]?[jt]s$/i],
  [/\bschema\s+"(\w+)"\s*do/g, /\.exs?$/i],
];
const TOPIC = /\btopics?\s*[:=]\s*\[?\s*['"]([\w.-]+)['"]|\b(?:subscribe|publish|produce|send)\(\s*\{?\s*topic\s*:\s*['"]([\w.-]+)['"]|\bqueue(?:Name|Url)?\s*[:=]\s*['"]([\w.-]+)['"]|\bnew\s+(?:Queue|Worker|QueueEvents)\(\s*['"]([\w.:-]+)['"]|@Processor\(\s*['"]([\w.:-]+)['"]|\bsidekiq_options\s+queue:\s*:?['"]?(\w+)/g;
const ENV = /\b(?:process\.env\.|process\.env\[['"]|import\.meta\.env\.|Deno\.env\.get\(\s*['"]|os\.environ(?:\.get)?\(\s*['"]|os\.environ\[['"]|os\.getenv\(\s*['"]|os\.Getenv\(\s*"|os\.LookupEnv\(\s*"|getenv\(\s*['"]|System\.getenv\(\s*"|Environment\.GetEnvironmentVariable\(\s*"|env::var\(\s*"|ENV\[['"]|ENV\.fetch\(\s*['"])([A-Z][A-Z0-9_]{2,})/g;
const SETTINGS_FIELD = /^\s{4}([A-Z][A-Z0-9_]{2,})\s*:\s*[\w[|]/gm;
const ENDPOINT_ENV = /URL|URI|HOST|ADDR|ADDRESS|DSN|BROKER|BUCKET|QUEUE|TOPIC|ENDPOINT|DATABASE|REDIS|KAFKA|AMQP|RABBIT|NATS|MONGO|POSTGRES|MYSQL|ELASTIC|S3_|SMTP|_API$|_SERVICE|SERVER$|WEBHOOK|ISSUER|DOMAIN/;
const HOST = /https?:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|io|net|org|dev|ai|co|app|cloud|so|sh|me|us|eu|xyz|tech))\b/gi;
/** Links that document code rather than calling a service. */
const DOC_HOST = /(^|\.)(localhost|example\.(com|org|net)|schema\.org|schemas\.|w3\.org|github\.com|githubusercontent\.com|gitlab\.com|bitbucket\.org|npmjs\.(com|org)|pypi\.org|pkg\.go\.dev|golang\.org|go\.dev|apache\.org|opensource\.org|creativecommons\.org|gnu\.org|mozilla\.org|stackoverflow\.com|stackexchange\.com|wikipedia\.org|youtube\.com|youtu\.be|twitter\.com|x\.com|linkedin\.com|reddit\.com|facebook\.com|instagram\.com|medium\.com|dev\.to|readthedocs\.(io|org)|docs\.[a-z0-9-]+\.[a-z]+|developer\.[a-z0-9-]+\.[a-z]+|developers\.[a-z0-9-]+\.[a-z]+|jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|gstatic\.com|shields\.io|badge|vitejs\.dev|reactjs\.org|react\.dev|nextjs\.org|vercel\.com\/docs|swagger\.io|json-schema\.org|jsonschema|tailwindcss\.com|typescriptlang\.org|nodejs\.org|python\.org|rust-lang\.org|crates\.io|docs\.rs|kubernetes\.io|helm\.sh|docker\.com|playwright\.dev|jestjs\.io|vitest\.dev|eslint\.org|prettier\.io|googlesource\.com|git-scm\.com|semver\.org|spdx\.org|ietf\.org|rfc-editor\.org|iana\.org|unicode\.org|ecma-international\.org|whatwg\.org|caniuse\.com|mdn\.|svelte\.dev|kit\.svelte\.dev|vuejs\.org|angular\.io|djangoproject\.com|fastapi\.tiangolo\.com|rubyonrails\.org|ruby-doc\.org|apple\.com\/documentation|android\.com|zod\.dev|tanstack\.com|lodash\.com|momentjs\.com|gravatar\.com|placehold|picsum\.photos|via\.placeholder\.com|test\.com|foo\.com|bar\.com|acme\.com|your-?domain|mydomain|domain\.com)$/i;
const COMMENT_LINE = /^\s*(?:\/\/|#|\*|\/\*|<!--|--|;|%|"""|''')/;

function unitOf(file, units) {
  let best = null;
  for (const unit of units) {
    if ((unit.path === "." || file === unit.path || file.startsWith(`${unit.path}/`)) && (!best || unit.path.length > best.path.length)) best = unit;
  }
  return best;
}

export function isAux(file) {
  return file.split("/").slice(0, -1).some((part) => AUX_SEGMENT.test(part));
}

export function isTestFile(file) {
  return /(^|\/)(test|tests|__tests__|spec|specs|e2e|testing|__mocks__|fixtures?|testdata)\//.test(file) || /[._-](test|spec|e2e)\.[a-z]+$|_test\.go$|(^|\/)test_[^/]+\.py$|Tests?\.(cs|java|kt|swift)$/.test(file);
}

/** Each parsed YAML document on its own, so one broken document does not hide the rest. */
function yamlDocs(text) {
  let docs = [];
  try {
    docs = parseAllDocuments(text, { strict: false, uniqueKeys: false });
  } catch {
    return [];
  }
  if (!Array.isArray(docs)) docs = [docs];
  const out = [];
  for (const doc of docs) {
    // A document the parser could not read cleanly is dropped; its neighbours still count.
    if (doc?.errors?.length) continue;
    try {
      const value = doc.toJS({ maxAliasCount: 1000 });
      if (value && typeof value === "object") out.push(value);
    } catch {
      // A document with an unresolved alias or template syntax is skipped.
    }
  }
  return out;
}

function shortImage(image) {
  const text = String(image || "").split("@")[0];
  return text.split("/").at(-1) || text;
}

function endpointEnv(list) {
  const out = [];
  for (const [name, raw] of list) {
    if (!name || !ENDPOINT_ENV.test(name) || /PASSWORD|SECRET|TOKEN|KEY$|PASS$/.test(name)) continue;
    let value = raw == null ? "" : String(raw);
    // Credentials never leave the machine in prompts.
    value = value.replace(/\/\/[^/@\s]*@/, "//").slice(0, 70);
    out.push(value ? `${name}=${value}` : name);
  }
  return out.slice(0, 12);
}

const WORKLOAD = /^(Deployment|StatefulSet|DaemonSet|Job|CronJob|ReplicaSet|Rollout|DeploymentConfig)$/;

function k8sObject(doc, file) {
  const kind = String(doc.kind);
  const meta = doc.metadata && typeof doc.metadata === "object" ? doc.metadata : {};
  const spec = doc.spec && typeof doc.spec === "object" ? doc.spec : {};
  const object = { file, kind, name: String(meta.name || meta.generateName || ""), namespace: String(meta.namespace || "") };
  if (WORKLOAD.test(kind) || kind === "Service" && doc.apiVersion?.startsWith?.("serving.knative")) {
    const pod = spec.template?.spec || spec.jobTemplate?.spec?.template?.spec || {};
    const containers = Array.isArray(pod.containers) ? pod.containers : [];
    object.workload = true;
    object.images = containers.map((c) => c?.image).filter(Boolean).map(String);
    object.ports = containers.flatMap((c) => (Array.isArray(c?.ports) ? c.ports : []).map((p) => p?.containerPort)).filter(Boolean);
    object.env = endpointEnv(containers.flatMap((c) => (Array.isArray(c?.env) ? c.env : []).map((e) => [e?.name, e?.value])));
    object.replicas = spec.replicas;
    if (kind === "CronJob") object.schedule = spec.schedule;
    object.labels = spec.selector?.matchLabels || spec.template?.metadata?.labels || meta.labels || {};
    return object;
  }
  if (kind === "Service") {
    object.type = spec.type || (spec.clusterIP === "None" ? "Headless" : "ClusterIP");
    object.ports = (Array.isArray(spec.ports) ? spec.ports : []).map((p) => p?.port).filter(Boolean);
    object.selector = spec.selector;
    if (spec.externalName) object.externalName = spec.externalName;
  }
  if (kind === "Ingress") {
    const rules = Array.isArray(spec.rules) ? spec.rules : [];
    object.hosts = rules.map((r) => r?.host).filter(Boolean);
    object.backends = rules.flatMap((r) => (Array.isArray(r?.http?.paths) ? r.http.paths : []).map((p) => `${p?.path || "/"}->${p?.backend?.service?.name || p?.backend?.serviceName || "?"}`));
    const fallback = spec.defaultBackend?.service?.name || spec.backend?.serviceName;
    if (fallback) object.backends.push(`*->${fallback}`);
    object.className = spec.ingressClassName || meta.annotations?.["kubernetes.io/ingress.class"] || "";
  }
  if (kind === "NetworkPolicy") {
    const label = (peer) => {
      const labels = peer?.podSelector?.matchLabels || peer?.namespaceSelector?.matchLabels;
      if (labels) return Object.entries(labels).map(([k, v]) => `${k}=${v}`).join(",") || "*";
      if (peer?.ipBlock?.cidr) return peer.ipBlock.cidr;
      return "*";
    };
    object.podSelector = spec.podSelector?.matchLabels || {};
    object.from = (Array.isArray(spec.ingress) ? spec.ingress : []).flatMap((rule) => (Array.isArray(rule?.from) ? rule.from : [{}]).map(label));
    object.to = (Array.isArray(spec.egress) ? spec.egress : []).flatMap((rule) => (Array.isArray(rule?.to) ? rule.to : [{}]).map(label));
    object.policyTypes = spec.policyTypes || [];
  }
  if (kind === "Gateway" || kind === "HTTPRoute" || kind === "GRPCRoute" || kind === "VirtualService" || kind === "IngressRoute") {
    object.hosts = [spec.hostnames, spec.hosts, (spec.listeners || []).map?.((l) => l?.hostname)].flat().filter(Boolean).map(String);
    const refs = [];
    for (const rule of Array.isArray(spec.rules) ? spec.rules : []) for (const ref of rule?.backendRefs || []) if (ref?.name) refs.push(ref.name);
    for (const route of Array.isArray(spec.http) ? spec.http : []) for (const dest of route?.route || []) if (dest?.destination?.host) refs.push(dest.destination.host);
    for (const route of Array.isArray(spec.routes) ? spec.routes : []) for (const svc of route?.services || []) if (svc?.name) refs.push(svc.name);
    object.backends = [...new Set(refs)];
  }
  return object;
}

function kustomization(doc, file) {
  const list = (value) => (Array.isArray(value) ? value.map((item) => (typeof item === "string" ? item : item?.path || item?.name || "")).filter(Boolean) : []);
  return {
    file,
    dir: path.dirname(file),
    namespace: doc.namespace || "",
    resources: list(doc.resources).concat(list(doc.bases)),
    components: list(doc.components),
    images: list(doc.images),
    patches: list(doc.patches).length + list(doc.patchesStrategicMerge).length + list(doc.patchesJson6902).length,
  };
}

/** Top-level values keys that configure a deployable component (umbrella charts, per-service blocks). */
function helmComponents(values) {
  const out = [];
  for (const [key, value] of Object.entries(values || {})) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const image = value.image?.repository || (typeof value.image === "string" ? value.image : "") || value.image?.name || "";
    const looksDeployable = image || "replicaCount" in value || "replicas" in value || value.service || value.deployment || "resources" in value || "create" in value && Object.keys(value).length > 2;
    if (!looksDeployable) continue;
    const enabled = value.enabled ?? value.create;
    out.push(`${key}${image ? `(${shortImage(image)})` : ""}${enabled === false ? "[off]" : ""}`);
  }
  return out.slice(0, 24);
}

function helmChart(root, dir, files) {
  const chart = yamlDocs(read(root, `${dir}/Chart.yaml`))[0] || {};
  const values = yamlDocs(read(root, `${dir}/values.yaml`))[0] || {};
  const templates = files.filter((f) => f.startsWith(`${dir}/templates/`) && /\.(ya?ml|tpl)$/.test(f));
  const kinds = [];
  const names = [];
  for (const file of templates) {
    // Templates are Go text/template, not YAML: read kinds and literal names by line.
    const text = read(root, file);
    for (const m of text.matchAll(/^\s*kind:\s*["']?([A-Za-z]+)/gm)) kinds.push(m[1]);
    for (const m of text.matchAll(/^\s{2}name:\s*["']?([a-z0-9][a-z0-9.-]*)["']?\s*$/gm)) names.push(m[1]);
  }
  const summary = {};
  const image = values.image;
  if (image) summary.image = typeof image === "string" ? image : image.repository;
  if (values.service && typeof values.service === "object") summary.service = { type: values.service.type, port: values.service.port };
  const ingress = values.ingress;
  if (ingress && typeof ingress === "object") summary.ingress = { enabled: ingress.enabled, hosts: (Array.isArray(ingress.hosts) ? ingress.hosts : []).map((h) => (typeof h === "string" ? h : h?.host)).filter(Boolean) };
  if (values.replicaCount != null) summary.replicas = values.replicaCount;
  if (values.networkPolicy || values.networkPolicies) summary.networkPolicy = Boolean((values.networkPolicy || values.networkPolicies).enabled ?? (values.networkPolicy || values.networkPolicies).create ?? true);
  const subcharts = (Array.isArray(chart.dependencies) ? chart.dependencies : []).map((d) => d?.name).filter(Boolean);
  for (const name of subcharts) {
    const sub = values[name];
    if (sub && typeof sub === "object") summary[name] = { enabled: sub.enabled, ingress: sub.ingress?.enabled, service: sub.service?.type };
  }
  return {
    dir,
    name: String(chart.name || path.basename(dir)),
    version: chart.version,
    subcharts,
    kinds: [...new Set(kinds)],
    names: [...new Set(names)].slice(0, 20),
    components: helmComponents(values),
    values: summary,
  };
}

const COMPOSE_FILE = /(^|\/)(?:docker-|podman-)?compose[^/]*\.ya?ml$/i;
const COMPOSE_BASE = /(^|\/)(?:docker-|podman-)?compose\.ya?ml$/i;
const COMPOSE_OVERRIDE = /(^|\/)(?:docker-|podman-)?compose\.override\.ya?ml$/i;

function composeServices(doc, file) {
  const services = [];
  for (const [name, raw] of Object.entries(doc.services || {})) {
    const svc = raw && typeof raw === "object" ? raw : {};
    const env = Array.isArray(svc.environment)
      ? svc.environment.map((e) => { const [k, ...v] = String(e).split("="); return [k, v.join("=")]; })
      : Object.entries(svc.environment || {});
    const labels = Array.isArray(svc.labels) ? svc.labels.map(String) : Object.entries(svc.labels || {}).map(([k, v]) => `${k}=${v}`);
    const routers = labels.map((l) => l.match(/^traefik\.http\.routers\.[\w-]+\.rule=(.+)$/)).filter(Boolean).map((m) => m[1].replace(/`/g, ""));
    const command = Array.isArray(svc.command) ? svc.command.join(" ") : String(svc.command || "");
    const build = typeof svc.build === "string" ? svc.build : svc.build ? String(svc.build.context || ".") : "";
    services.push({
      name,
      file,
      image: svc.image ? String(svc.image) : "",
      build,
      dockerfile: typeof svc.build === "object" && svc.build ? String(svc.build.dockerfile || "") : "",
      extends: svc.extends ? String(svc.extends.service || svc.extends) : "",
      command: command.slice(0, 80),
      ports: (Array.isArray(svc.ports) ? svc.ports : []).map((p) => (typeof p === "object" && p ? `${p.published || ""}:${p.target || ""}` : String(p))),
      expose: (Array.isArray(svc.expose) ? svc.expose : []).map(String),
      dependsOn: Array.isArray(svc.depends_on) ? svc.depends_on.map(String) : Object.keys(svc.depends_on || {}),
      networks: Array.isArray(svc.networks) ? svc.networks.map(String) : Object.keys(svc.networks || {}),
      profiles: Array.isArray(svc.profiles) ? svc.profiles.map(String) : [],
      env: env.map(([k]) => k).filter(Boolean),
      endpoints: endpointEnv(env),
      routers,
    });
  }
  return services;
}

/** Compose files in one directory, the base merged with its override; other files stay variants. */
function composeProjects(root, files) {
  const byDir = new Map();
  for (const file of files.filter((f) => COMPOSE_FILE.test(f))) {
    const dir = path.dirname(file);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(file);
  }
  const out = [];
  for (const [, group] of [...byDir.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const ordered = group.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    let merged = null;
    for (const file of ordered) {
      const doc = yamlDocs(read(root, file))[0];
      if (!doc?.services || typeof doc.services !== "object") continue;
      const networks = Object.entries(doc.networks || {}).map(([name, net]) => (net?.external ? `${name}(external)` : net?.internal ? `${name}(internal)` : name));
      const services = composeServices(doc, file);
      if (merged && COMPOSE_OVERRIDE.test(file)) {
        for (const svc of services) {
          const base = merged.services.find((s) => s.name === svc.name);
          if (!base) merged.services.push(svc);
          else for (const key of ["image", "build", "dockerfile", "command"]) if (svc[key]) base[key] = svc[key];
          if (base) for (const key of ["ports", "expose", "dependsOn", "networks", "env", "endpoints", "routers"]) base[key] = [...new Set([...base[key], ...svc[key]])];
        }
        merged.networks = [...new Set([...merged.networks, ...networks])];
        merged.files.push(file);
        continue;
      }
      const project = { file, files: [file], services, networks, variant: variantOf(file) };
      if (!merged && COMPOSE_BASE.test(file)) merged = project;
      out.push(project);
    }
  }
  return out;
}

function rank(file) {
  return COMPOSE_BASE.test(file) ? 0 : COMPOSE_OVERRIDE.test(file) ? 1 : 2;
}

/** dev, test, e2e, ci, prod... from the file name; "" for the main file. */
function variantOf(file) {
  if (isAux(file)) return "test";
  const base = path.basename(file).replace(/\.ya?ml$/i, "").replace(/^(docker-|podman-)?compose\.?/i, "");
  return base.replace(/^override$/, "");
}

const TF_NETWORK = /^(aws_vpc|aws_subnet|aws_security_group|aws_lb|aws_alb|aws_api_gateway|aws_apigatewayv2|aws_cloudfront|aws_route53|aws_wafv2|aws_nat_gateway|aws_internet_gateway|aws_vpc_endpoint|google_compute_network|google_compute_subnetwork|google_compute_firewall|google_compute_global_address|google_compute_url_map|google_compute_backend_service|google_dns|azurerm_virtual_network|azurerm_subnet|azurerm_network_security_group|azurerm_application_gateway|azurerm_frontdoor|azurerm_private_endpoint|cloudflare_record|cloudflare_zone|digitalocean_vpc|digitalocean_loadbalancer)/;

function terraformFile(root, file) {
  const text = read(root, file);
  const resources = [...text.matchAll(/^resource\s+"([\w-]+)"\s+"([\w-]+)"/gm)].map((m) => ({ type: m[1], name: m[2] }));
  const modules = [...text.matchAll(/^module\s+"([\w-]+)"\s*\{[\s\S]*?\bsource\s*=\s*"([^"]+)"/gm)].map((m) => ({ name: m[1], source: m[2].replace(/^.*\/\/?/, "").slice(0, 60) }));
  return resources.length || modules.length ? { file, resources, modules } : null;
}

function procfile(root, file) {
  const processes = read(root, file).split("\n").map((line) => line.match(/^([\w-]+):\s*(.+)$/)).filter(Boolean).map((m) => ({ name: m[1], command: m[2].trim().slice(0, 80) }));
  return processes.length ? { file, processes, variant: /Procfile\.(\w+)/.exec(file)?.[1] || "" } : null;
}

const norm = (value) => String(value || "").toLowerCase().replace(/^@[^/]+\//, "").replace(/[^a-z0-9]/g, "");

/** Does a compose service, k8s workload, or image name refer to this unit? */
function namesUnit(name, unit) {
  const candidate = norm(shortImage(name).split(":")[0]);
  if (candidate.length < 3) return false;
  const keys = [norm(path.basename(unit.path === "." ? "" : unit.path)), norm(unit.name)].filter((key) => key.length >= 3);
  return keys.some((key) => candidate === key || (candidate.endsWith(key) && key.length >= 4) || (key.endsWith(candidate) && candidate.length >= 4));
}

const AUX_SERVICE = /(^|[-_])(playwright|cypress|selenium|e2e|tests?|testing|mock|mocks|fixtures?|loadtest|k6|locust)($|[-_])/i;

function exactName(name, unit) {
  const candidate = norm(shortImage(name).split(":")[0]);
  return candidate.length >= 3 && [norm(path.basename(unit.path === "." ? "" : unit.path)), norm(unit.name)].includes(candidate);
}

/**
 * Give each compose service, k8s workload, and Procfile process to the one unit
 * it runs: by name first, then by image, then by the Dockerfile or build
 * context. Objects sharing an image with an attributed one follow it (a worker
 * that runs the server image with another command).
 */
function attributeDeploys(units, infra) {
  const candidates = units.filter((unit) => unit.files > 0 && !isAux(`${unit.path}/x`));
  const deepest = (file) => unitOf(file, candidates);
  const byImage = new Map();
  const pick = ({ name, images, dockerfile, context }) => {
    const all = [name, ...images].filter(Boolean);
    let unit = candidates.find((u) => all.some((n) => exactName(n, u)))
      || candidates.find((u) => u.path !== "." && all.some((n) => namesUnit(n, u)));
    if (!unit && !AUX_SERVICE.test(name)) {
      if (dockerfile) unit = deepest(dockerfile);
      if (!unit && context) unit = candidates.find((u) => u.path === context);
    }
    return unit || null;
  };
  const jobs = [];
  for (const project of infra.compose) {
    const dir = path.dirname(project.file);
    for (const svc of project.services) {
      const context = svc.build ? path.posix.normalize(path.posix.join(dir, svc.build)) : "";
      const dockerfile = context ? path.posix.normalize(path.posix.join(context, svc.dockerfile || "Dockerfile")) : "";
      jobs.push({ label: `compose ${svc.name}`, name: svc.name, images: svc.image ? [svc.image] : [], dockerfile, context: context.replace(/^\.\/?$/, ".") });
    }
  }
  for (const object of infra.k8s) if (object.workload) jobs.push({ label: `k8s ${object.kind} ${object.name}`, name: object.name, images: object.images || [], dockerfile: "", context: "" });
  const pending = [];
  for (const job of jobs) {
    const unit = pick(job);
    if (!unit) {
      pending.push(job);
      continue;
    }
    unit.deployedAs.push(job.label);
    for (const image of job.images) byImage.set(norm(shortImage(image).split(":")[0]), unit);
  }
  for (const job of pending) {
    const unit = job.images.map((image) => byImage.get(norm(shortImage(image).split(":")[0]))).find(Boolean);
    if (unit) unit.deployedAs.push(job.label);
  }
  const rootUnit = candidates.find((unit) => unit.path === ".");
  if (rootUnit) {
    for (const proc of infra.procfiles.filter((p) => path.dirname(p.file) === "." && !p.variant)) for (const p of proc.processes) rootUnit.deployedAs.push(`procfile ${p.name}`);
  }
  for (const unit of units) unit.deployedAs = [...new Set(unit.deployedAs)].slice(0, 8);
}

function globMatch(pattern, dir) {
  const clean = pattern.replace(/^\.\//, "").replace(/\/$/, "");
  if (clean === "." || clean === "") return dir === ".";
  const regex = new RegExp(`^${clean.split("/").map((part) => (part === "**" ? ".*" : part.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*"))).join("/")}$`);
  return regex.test(dir);
}

const LIB_DIR = /^(packages|libs?|crates|pkg|shared|common|modules|components|sdk|sdks|plugins)$/i;
const APP_DIR = /^(apps?|services?|servers?|cmd|workers?|functions|lambdas?|microservices|backend|frontend|api|web|site)$/i;
const TOOL_NAME = /(^|[-_/.])(eslint|prettier|tsconfig|oxlint|stylelint|lint-rules|linter|babel-config|jest-config|vitest-config|tailwind-config|tailwind|commitlint|renovate|config-typescript|typescript-config|eslint-config|biome|codemods?|generators?|scripts|devtools|tooling|storybook)($|[-_/.])/i;

/**
 * What the unit is for a diagram. Runtime parts: service, worker, frontend,
 * mobile, desktop, cli, app. Imported code: library. Not drawn: tooling,
 * test, docs, example.
 */
function roleOf(unit, facts, entries) {
  const segs = unit.path === "." ? [] : unit.path.split("/");
  const base = (segs.at(-1) || "").toLowerCase();
  const name = String(unit.name || "").toLowerCase();
  const tags = new Set(unit.tags);
  const deployed = unit.dockerfile || unit.deployedAs.length > 0;
  if (segs.some((s) => /^(examples?|samples?|demos?|fixtures?|__fixtures__|testdata|templates?|boilerplates?|starters?|playground)$/i.test(s))) return "example";
  if (segs.some((s) => /^(e2e|tests?|testing|__tests__|spec|specs|integration[-_]?tests?|benchmarks?|bench|load[-_]?tests?|perf|fuzz|fuzzing)$/i.test(s)) || /(^|[-_.])(e2e|tests?|testing|playwright|cypress)($|[-_.])/.test(base) || /(^|[-_./])(e2e|playwright|cypress)($|[-_./])/.test(name)) return "test";
  if (/^\.(github|gitlab|circleci|devcontainer|husky)$/.test(segs[0] || "") || /^(tooling|tools|hack|ci|build-tools|scripts)$/i.test(segs[0] || "") && !deployed || TOOL_NAME.test(base) || TOOL_NAME.test(name)) return "tooling";
  if (segs.some((s) => /^(docs?|documentation|website|www|storybook|landing|marketing)$/i.test(s)) || /(^|[-_])(docs?|documentation|website|storybook|landing)$/.test(base) || /(^|[-_/])(docs?|documentation|website)$/.test(name)) return "docs";
  if (tags.has("mobile app") || unit.manifests.includes("pubspec.yaml") || segs.some((s) => /^(mobile|ios|android)$/i.test(s)) && !deployed) return "mobile";
  if (tags.has("desktop app")) return "desktop";
  const workerish = /(^|[-_])(worker|workers|consumer|consumers|jobs?|queue|cron|scheduler|processor|ingest(or|er)?|daemon)($|[-_])/.test(base) || /(^|[-_./])(worker|consumer|scheduler)($|[-_])/.test(name);
  const server = tags.has("http api") || tags.has("grpc") || tags.has("graphql") || unit.routes.length > 0;
  const frontend = tags.has("web frontend") && (!tags.has("http api") || facts.fullstack);
  const scripts = new Set(facts.scripts || []);
  // index.ts and lib.rs start a package, not a process.
  const strong = entries.filter((entry) => !/(^|\/)(?:index\.[cm]?[jt]sx?|lib\.rs)$/.test(entry) && !/(^|\/)(?:\+?layout|\+?page|_app)\.[a-z]+$/.test(entry));
  // A "dev" script on a package with exports is a watch build, not a server.
  const devServer = scripts.has("dev") && (!facts.libraryFields || facts.frontendFramework);
  const runnable = deployed || strong.length > 0 || unit.routes.length > 0 || scripts.has("start") || scripts.has("serve") || devServer || scripts.has("preview") || facts.projectType === "application" || facts.application || facts.bin;
  if (facts.projectType === "library" && !deployed) return "library";
  if (!deployed && /(^|[-_])(sdk|lib|libs|shared|common|core|utils?|types|client|helpers|kit|ui|components|validators?|schemas?|config|e?mails?|email-templates)$/.test(base) && !server) return "library";
  if (deployed && (facts.bin || facts.cli) && !server) return "cli";
  if (deployed || runnable && (server || frontend || workerish)) {
    if (workerish && !frontend) return "worker";
    if (frontend) return "frontend";
    if (server) return "service";
    if (frontend) return "frontend";
    if (tags.has("job queue") || tags.has("kafka") || tags.has("rabbitmq") || tags.has("cloud messaging")) return "worker";
    return deployed ? "service" : "app";
  }
  if (facts.bin || facts.cli) return "cli";
  if (facts.libraryFields && !runnable) return "library";
  if (segs.length && LIB_DIR.test(segs[0]) && !runnable) return "library";
  if (segs.length && APP_DIR.test(segs[0])) return "app";
  if (!runnable && unit.path !== "." && unit.manifests.some((m) => /package\.json|Cargo\.toml|go\.mod|pyproject|setup\.py|csproj|pom\.xml|gradle/.test(m))) return "library";
  return runnable ? "app" : unit.path === "." ? "app" : "library";
}

const ENTRY = [
  /^(?:src\/)?(?:main|index|server|app|cli|worker)\.[cm]?[jt]sx?$/,
  /^bin\/[\w.-]+\.[cm]?[jt]s$/,
  /^(?:src\/)?(?:app|pages)\/(?:layout|page|_app|index)\.[jt]sx?$/,
  /^src\/routes\/\+(?:layout|page)\.(?:svelte|ts)$/,
  /^(?:src\/)?(?:[\w-]+\/)?(?:main|app|server|wsgi|asgi|__main__|manage|run|worker|celery)\.py$/,
  /^(?:main|server)\.go$/,
  /^cmd\/[\w.-]+\/main\.go$/,
  /^src\/(?:main|lib)\.rs$|^src\/bin\/[\w-]+\.rs$/,
  /^(?:src\/)?Program\.cs$|^Startup\.cs$/,
  /^src\/main\/(?:java|kotlin)\/.*(?:Application|Main|Server)\.(?:java|kt)$/,
  /^config\/(?:routes|application)\.rb$|^config\.ru$/,
  /^lib\/main\.dart$/,
  /^(?:mix\.exs|lib\/[\w]+\/application\.ex)$/,
  /^(?:src\/)?main\.(?:c|cc|cpp)$/,
];

/** Entry points relative to the unit, the files a reader should open first. */
function entryFiles(unit, files) {
  const prefix = unit.path === "." ? "" : `${unit.path}/`;
  return files
    .map((file) => file.slice(prefix.length))
    .filter((rel) => ENTRY.some((pattern) => pattern.test(rel)))
    .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))
    .slice(0, 8);
}

function commentFree(text) {
  return text.split("\n").filter((line) => !COMMENT_LINE.test(line)).join("\n");
}

function extractFromFile(unit, file, text) {
  const add = (list, value, cap) => { if (value && list.length < cap && !list.includes(value)) list.push(value); };
  const nest = /@Controller\(/.test(text) ? (text.match(/@Controller\(\s*(?:\{\s*path:\s*)?['"`]([^'"`]*)['"`]/) || [])[1] ?? "" : null;
  for (const [pattern, format] of ROUTES) {
    for (const m of text.matchAll(pattern)) add(unit.routes, format(m, nest), 40);
  }
  if (/(^|\/)routes\.rb$/.test(file)) {
    for (const pattern of RAILS_ROUTES) for (const m of text.matchAll(pattern)) add(unit.routes, /^resources?$/.test(m[1]) ? `RESOURCES /${m[2]}` : `${m[1].toUpperCase()} ${m[2]}`, 40);
  }
  if (/(^|\/)urls\.py$/.test(file)) for (const m of text.matchAll(DJANGO_ROUTES)) add(unit.routes, `ANY /${m[1].replace(/^\^|\$$/g, "")}`, 40);
  for (const [pattern, ext] of TABLES) {
    if (!ext.test(file)) continue;
    for (const m of text.matchAll(pattern)) add(unit.tables, m[1], 24);
  }
  for (const m of text.matchAll(TOPIC)) add(unit.topics, m[1] || m[2] || m[3] || m[4] || m[5] || m[6], 15);
  for (const m of text.matchAll(ENV)) add(unit.env, m[1], 30);
  if (/BaseSettings|pydantic_settings/.test(text)) for (const m of text.matchAll(SETTINGS_FIELD)) add(unit.env, m[1], 30);
  if (/https?:\/\//.test(text)) {
    for (const m of commentFree(text).matchAll(HOST)) {
      const host = m[1].toLowerCase();
      if (!DOC_HOST.test(host) && !host.includes("${")) add(unit.hosts, host, 10);
    }
  }
}

function protoServices(root, files) {
  const services = [];
  for (const file of files.filter((f) => f.endsWith(".proto") && !isAux(f)).slice(0, 60)) {
    const text = read(root, file, 300000);
    for (const m of text.matchAll(/^\s*service\s+(\w+)\s*\{([\s\S]*?)^\s*\}/gm)) {
      const rpcs = [...m[2].matchAll(/\brpc\s+(\w+)/g)].map((r) => r[1]);
      services.push({ file, name: m[1], rpcs: rpcs.slice(0, 10) });
    }
  }
  // Each service once: generated copies of a shared .proto live in every service directory.
  const seen = new Set();
  return services.filter((svc) => !seen.has(svc.name) && seen.add(svc.name)).slice(0, 40);
}

function workspaceGlobs(root, files) {
  const globs = [];
  if (files.includes("package.json")) {
    try {
      const pkg = JSON.parse(read(root, "package.json"));
      globs.push(...(Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages || []));
    } catch {
      // A broken root manifest has no workspaces.
    }
  }
  const pnpm = files.find((f) => f === "pnpm-workspace.yaml");
  if (pnpm) globs.push(...((yamlDocs(read(root, pnpm))[0] || {}).packages || []).map(String));
  if (files.includes("lerna.json")) {
    try {
      globs.push(...(JSON.parse(read(root, "lerna.json")).packages || []));
    } catch {
      // ignore
    }
  }
  if (files.includes("Cargo.toml")) globs.push(...tomlArray(read(root, "Cargo.toml"), "members"));
  if (files.includes("go.work")) globs.push(...[...read(root, "go.work").matchAll(/^\s*(?:use\s+)?(\.\/?[\w./-]*)\s*$/gm)].map((m) => m[1]));
  return globs.filter((g) => typeof g === "string" && !g.startsWith("!"));
}

function monorepoTool(files) {
  const tools = [];
  if (files.includes("turbo.json")) tools.push("turborepo");
  if (files.includes("nx.json")) tools.push("nx");
  if (files.includes("pnpm-workspace.yaml")) tools.push("pnpm workspaces");
  if (files.includes("lerna.json")) tools.push("lerna");
  if (files.includes("go.work")) tools.push("go workspace");
  if (files.includes("rush.json")) tools.push("rush");
  return tools;
}

function emptyUnit(dir, name) {
  return { path: dir, manifest: "", manifests: [], name, role: "", tags: [], deps: [], links: [], entries: [], deployedAs: [], files: 0, dockerfile: false, routes: [], tables: [], topics: [], env: [], hosts: [] };
}

export function scanProject(root, options = {}) {
  const started = Date.now();
  const files = listFiles(root, options.maxFiles || MAX_LIST);
  const fileSet = new Set(files);
  const languages = {};
  // Languages of the system itself: examples, fixtures, and docs do not count unless they are all there is.
  const counted = files.filter((file) => !isAux(file));
  for (const file of counted.length ? counted : files) {
    const ext = (file.match(/\.([a-z0-9]+)$/i) || [])[1];
    if (ext && SOURCE_EXT.test(file)) languages[ext.toLowerCase()] = (languages[ext.toLowerCase()] || 0) + 1;
  }

  // 1. Units: one per directory with a manifest (several manifests in one directory merge).
  const byDir = new Map();
  const facts = new Map();
  for (const file of files) {
    if (!isManifest(file)) continue;
    const dir = path.dirname(file) === "." ? "." : path.dirname(file);
    const parsed = manifestInfo(file, read(root, file));
    if (!parsed) continue;
    if (!byDir.has(dir)) {
      byDir.set(dir, emptyUnit(dir, ""));
      facts.set(dir, { scripts: [] });
    }
    const unit = byDir.get(dir);
    const fact = facts.get(dir);
    const base = path.basename(file);
    unit.manifests.push(base);
    if (!unit.manifest || base === "package.json" && unit.manifest === "project.json") unit.manifest = base;
    if (!unit.name && parsed.name) unit.name = String(parsed.name);
    const deps = [...(parsed.deps || [])];
    const ecosystem = ECOSYSTEM[base] || (MANIFEST_EXT.test(base) ? "dotnet" : "other");
    unit.depsBy ||= {};
    unit.depsBy[ecosystem] = [...new Set([...(unit.depsBy[ecosystem] || []), ...deps, ...(parsed.devDeps || [])])];
    unit.deps = [...new Set([...unit.deps, ...deps])];
    unit.devDeps = [...new Set([...(unit.devDeps || []), ...(parsed.devDeps || [])])];
    fact.scripts = [...new Set([...(fact.scripts || []), ...(parsed.facts.scripts || [])])];
    for (const [key, value] of Object.entries(parsed.facts)) if (key !== "scripts" && value !== undefined && value !== "" && !(Array.isArray(value) && !value.length)) fact[key] = fact[key] || value;
  }
  // Directories with a Dockerfile and their own source, but no manifest, are units too (polyglot service dirs).
  for (const file of files) {
    if (!DOCKERFILE.test(file)) continue;
    const dir = path.dirname(file);
    if (dir === "." || byDir.has(dir)) continue;
    const owner = unitOf(file, [...byDir.values()]);
    if (owner && owner.path !== ".") continue;
    const hasSource = files.some((f) => f.startsWith(`${dir}/`) && SOURCE_EXT.test(f) && !isTestFile(f));
    if (!hasSource) continue;
    byDir.set(dir, { ...emptyUnit(dir, ""), manifest: "Dockerfile", manifests: ["Dockerfile"] });
    facts.set(dir, { scripts: [] });
  }
  let units = [...byDir.values()].sort((a, b) => a.path.localeCompare(b.path));
  const globs = workspaceGlobs(root, files);
  const members = (dir) => globs.some((glob) => globMatch(glob, dir));
  // A manifest nested inside another non-root unit is part of it (a Flutter app's android/ios shells,
  // a package's example or template), unless the workspace names it or it ships its own image.
  const folded = new Set();
  for (const unit of units) {
    if (unit.path === ".") continue;
    const parent = unitOf(unit.path, units.filter((u) => u !== unit && u.path !== "." && !folded.has(u.path) && unit.path.startsWith(`${u.path}/`)));
    if (!parent || members(unit.path) || files.some((f) => DOCKERFILE.test(f) && path.dirname(f) === unit.path)) continue;
    folded.add(unit.path);
    parent.deps = [...new Set([...parent.deps, ...unit.deps])];
    parent.manifests = [...new Set([...parent.manifests, ...unit.manifests])];
  }
  units = units.filter((unit) => !folded.has(unit.path));
  // Code at the root that no manifest claims (a C or C++ program with a Makefile) is the root unit.
  if (!units.some((unit) => unit.path === ".")) {
    const source = files.filter((file) => SOURCE_EXT.test(file) && !isTestFile(file) && !isAux(file));
    const orphans = source.filter((file) => !unitOf(file, units));
    if (!units.length || orphans.length >= 5 && orphans.length >= source.length * 0.2) {
      const build = files.filter((file) => !file.includes("/") && ROOT_BUILD.test(file));
      units.unshift({ ...emptyUnit(".", ""), manifest: build[0] || "", manifests: build.slice(0, 3) });
      facts.set(".", { scripts: [], cli: orphans.some((file) => /(^|\/)main\.(c|cc|cpp|zig)$/.test(file)) });
    }
  }
  for (const unit of units) {
    if (!unit.name) unit.name = unit.path === "." ? path.basename(path.resolve(root)) : path.basename(unit.path);
    const fact = facts.get(unit.path) || {};
    const allDeps = [...unit.deps, ...(unit.devDeps || [])];
    fact.frontendFramework = allDeps.some((dep) => /^(next|nuxt|@sveltejs\/kit|vite|@remix-run\/react|astro|@angular\/core|react-scripts|@tanstack\/react-start|gatsby)$/.test(dep));
    // Full-stack web frameworks serve their own API routes; a Rails or Django app with a Vite bundle is still a service.
    fact.fullstack = allDeps.some((dep) => /^(next|nuxt|@sveltejs\/kit|@remix-run\/react|@remix-run\/node|astro|@tanstack\/react-start|@tanstack\/start)$/.test(dep));
    // Frontend frameworks often sit in devDependencies (SvelteKit, Vite); servers do not.
    const frontendDev = (unit.devDeps || []).filter((dep) => NOTABLE[1][0].test(dep) || NOTABLE[2][0].test(dep));
    unit.tags = notable([...unit.deps, ...frontendDev]);
    unit.deps = unit.deps.slice(0, 40);
  }

  // 2. Files per unit: counts, Dockerfiles, and the code facts (bounded reads).
  const owner = new Map();
  const perUnit = new Map(units.map((unit) => [unit, []]));
  for (const file of files) {
    const unit = unitOf(file, units);
    if (!unit) continue;
    owner.set(file, unit);
    if (DOCKERFILE.test(file) && !isAux(file.slice(unit.path === "." ? 0 : unit.path.length + 1))) unit.dockerfile = true;
    if (!SOURCE_EXT.test(file) && !/\.(sql|prisma|proto)$/i.test(file)) continue;
    unit.files += 1;
    perUnit.get(unit).push(file);
  }
  let readTotal = 0;
  for (const unit of units) {
    const readable = perUnit.get(unit)
      .filter((file) => !isTestFile(file) && !(unit.path === "." ? isAux(file) : isAux(file.slice(unit.path.length + 1))))
      // Shallow files and route, schema, and config files first, so a capped read still sees them.
      .sort((a, b) => readPriority(a) - readPriority(b) || a.split("/").length - b.split("/").length || a.localeCompare(b));
    for (const file of readable.slice(0, MAX_READ_PER_UNIT)) {
      if (readTotal >= (options.maxRead || MAX_READ_TOTAL)) break;
      readTotal += 1;
      const text = read(root, file, 120000);
      if (text) extractFromFile(unit, file, text);
    }
    unit.unitFiles = perUnit.get(unit);
  }

  // 3. Infrastructure. Test, docs, example, and CI copies count only when nothing else is there.
  const infra = { compose: [], k8s: [], kustomize: [], helm: [], terraform: [], procfiles: [], dockerfiles: files.filter((f) => DOCKERFILE.test(f)), protos: protoServices(root, files) };
  const chartDirs = files.filter((f) => path.basename(f) === "Chart.yaml").map((f) => path.dirname(f));
  const inChart = (file) => chartDirs.some((dir) => file.startsWith(`${dir}/`));
  const all = { compose: composeProjects(root, files), helm: chartDirs.map((dir) => helmChart(root, dir, files)), k8s: [], kustomize: [], terraform: [], procfiles: [] };
  for (const file of files) {
    if (COMPOSE_FILE.test(file)) continue;
    if (/(^|\/)Procfile(\.\w+)?$/.test(file)) {
      const proc = procfile(root, file);
      if (proc) all.procfiles.push(proc);
      continue;
    }
    if (/\.ya?ml$/i.test(file) && !inChart(file)) {
      const text = read(root, file, 400000);
      if (!/^\s*kind:/m.test(text) || !/^\s*apiVersion:/m.test(text) && !/kustomization/i.test(file)) continue;
      for (const doc of yamlDocs(text)) {
        const items = doc.kind === "List" && Array.isArray(doc.items) ? doc.items : [doc];
        for (const item of items) {
          if (!item || typeof item !== "object" || !item.kind || typeof item.kind !== "string") continue;
          if (item.kind === "Kustomization" && String(item.apiVersion || "").includes("kustomize")) all.kustomize.push(kustomization(item, file));
          else if (item.apiVersion && item.metadata) all.k8s.push(k8sObject(item, file));
        }
      }
      continue;
    }
    if (/\.tf$/.test(file)) {
      const tf = terraformFile(root, file);
      if (tf) all.terraform.push(tf);
    }
  }
  // Infra under examples/, tests/, docs/, or CI describes something else when the project has its own code.
  const ownCode = units.some((unit) => unit.files > 0 && !isAux(`${unit.path}/x`));
  for (const key of ["compose", "helm", "k8s", "kustomize", "terraform", "procfiles"]) {
    const main = all[key].filter((item) => !isAux(item.file || `${item.dir}/x`));
    infra[key] = main.length || ownCode ? main : all[key];
  }
  // One copy of each k8s object: the same manifest often lives in base/, release/, and overlays/.
  const seen = new Map();
  infra.k8s = infra.k8s.filter((object) => {
    const key = `${object.kind}|${object.name}|${object.namespace}`;
    if (seen.has(key)) {
      seen.get(key).copies += 1;
      return false;
    }
    object.copies = 1;
    seen.set(key, object);
    return true;
  });

  // 4. Which deploy objects run which unit.
  attributeDeploys(units, infra);

  // 5. Links between units (workspace packages, path dependencies) and roles.
  const byName = new Map();
  for (const unit of units) for (const ecosystem of Object.keys(unit.depsBy || {})) byName.set(`${ecosystem}:${unit.name}`, unit);
  for (const unit of units) {
    const fact = facts.get(unit.path) || {};
    const links = new Set();
    // Names link only within one ecosystem: the python package "emails" is not the npm workspace "emails".
    for (const [ecosystem, deps] of Object.entries(unit.depsBy || {})) {
      for (const dep of deps) {
        const target = byName.get(`${ecosystem}:${dep}`);
        if (target && target !== unit) links.add(target.path);
      }
    }
    for (const rel of [...(fact.pathDeps || []), ...(fact.replaces || []), ...(fact.projectDeps || [])]) {
      const target = path.normalize(path.join(unit.path, rel)).split(path.sep).join("/").replace(/\/[^/]+\.(csproj|fsproj)$/, "");
      const found = units.find((u) => u !== unit && (u.path === target || u.path === rel));
      if (found) links.add(found.path);
    }
    unit.links = [...links];
    unit.entries = entryFiles(unit, unit.unitFiles);
    if (unit.routes.length && !unit.tags.includes("http api")) unit.tags.push("http api");
    unit.role = roleOf(unit, fact, unit.entries);
    unit.workspace = members(unit.path);
    delete unit.devDeps;
    delete unit.depsBy;
  }
  // The workspace root with packages under it is the monorepo shell, unless it holds the app.
  const root0 = units.find((unit) => unit.path === ".");
  if (root0 && units.length > 1) {
    const nested = units.filter((unit) => unit !== root0).reduce((sum, unit) => sum + unit.files, 0);
    if (root0.files < Math.max(5, nested * 0.1) && !root0.deployedAs.length) root0.role = "workspace";
  }
  for (const unit of units) {
    unit.usedBy = units.filter((other) => other.links.includes(unit.path)).map((other) => other.path);
    delete unit.unitFiles;
  }

  return {
    root: path.basename(path.resolve(root)),
    files: files.length,
    ms: Date.now() - started,
    languages,
    monorepo: monorepoTool(files),
    units,
    infra,
  };
}

function readPriority(file) {
  if (/(^|\/)(routes?|routers?|urls|controllers?|handlers?|api|endpoints?|views|resolvers?|schema|models?|entities|migrations?|db|config|settings)(\/|\.|$)/i.test(file)) return 0;
  return 1;
}

/** Units in the order a staff engineer would draw them: running parts first, packages they import next, the rest last. */
export const ROLE_WEIGHT = { service: 100, worker: 95, frontend: 90, mobile: 80, desktop: 75, app: 70, cli: 60, library: 30, workspace: 8, docs: 6, tooling: 4, test: 3, example: 2 };
export const RUNTIME_ROLES = new Set(["service", "worker", "frontend", "mobile", "desktop", "app", "cli"]);

export function unitScore(unit) {
  return (ROLE_WEIGHT[unit.role] ?? 50)
    + (unit.dockerfile ? 25 : 0)
    + Math.min(40, unit.deployedAs.length * 20)
    + Math.min(20, unit.tags.length * 4)
    + (unit.routes.length ? 10 : 0)
    + (unit.tables.length ? 8 : 0)
    + Math.min(15, (unit.usedBy?.length || 0) * 5)
    + Math.min(20, Math.log2(1 + unit.files) * 2.5);
}

export function rankUnits(units) {
  return [...units].sort((a, b) => unitScore(b) - unitScore(a) || a.path.localeCompare(b.path));
}

/** Network and trust boundaries the infrastructure declares, one line each. */
export function boundaries(scan) {
  const lines = [];
  const add = (line) => { if (!lines.includes(line)) lines.push(line); };
  const namespaces = new Set([...scan.infra.k8s.map((o) => o.namespace), ...scan.infra.k8s.filter((o) => o.kind === "Namespace").map((o) => o.name), ...(scan.infra.kustomize || []).map((k) => k.namespace)].filter(Boolean));
  if (namespaces.size) add(`k8s namespaces: ${[...namespaces].join(", ")}`);
  for (const o of scan.infra.k8s) {
    if (o.kind === "Ingress") add(`public entry: Ingress ${o.name}${o.namespace ? ` (ns ${o.namespace})` : ""} hosts ${o.hosts.join(",") || "*"} routes ${o.backends.join(" ")}`);
    if (o.kind === "Service" && /LoadBalancer|NodePort/.test(o.type)) add(`exposed: Service ${o.name}${o.namespace ? ` (ns ${o.namespace})` : ""} type ${o.type} ports ${o.ports.join(",")}`);
    if (o.kind === "Service" && o.externalName) add(`external: Service ${o.name} -> ${o.externalName}`);
    if (o.kind === "NetworkPolicy") {
      const pods = Object.entries(o.podSelector).map(([k, v]) => `${k}=${v}`).join(",") || "all pods";
      add(`network policy ${o.name}: ${pods}${o.from.length ? ` <- ${o.from.join(" ")}` : o.policyTypes.includes("Ingress") || !o.to.length ? " <- none" : ""}${o.to.length ? ` -> ${o.to.join(" ")}` : ""}`);
    }
    if (/^(Gateway|HTTPRoute|GRPCRoute|VirtualService|IngressRoute)$/.test(o.kind)) add(`gateway ${o.kind} ${o.name}${o.hosts.length ? ` hosts ${o.hosts.join(",")}` : ""}${o.backends.length ? ` -> ${o.backends.join(",")}` : ""}`);
    if (o.kind === "ServiceEntry") add(`egress allowed: ServiceEntry ${o.name}`);
  }
  for (const chart of scan.infra.helm) {
    if (chart.values.ingress?.enabled) add(`public entry: helm ${chart.name} ingress ${chart.values.ingress.hosts?.join(",") || ""}`);
    if (chart.values.service?.type && /LoadBalancer|NodePort/.test(chart.values.service.type)) add(`exposed: helm ${chart.name} service ${chart.values.service.type}`);
    if (chart.values.networkPolicy || chart.kinds.includes("NetworkPolicy")) add(`network policy: helm ${chart.name}${chart.values.networkPolicy === false ? " (off by default)" : ""}`);
    if (chart.kinds.includes("Ingress")) add(`public entry: helm ${chart.name} templates an Ingress`);
  }
  for (const compose of scan.infra.compose) {
    const where = compose.variant ? ` [${compose.variant}]` : "";
    if (compose.networks.length) add(`compose networks (${compose.file}): ${compose.networks.join(", ")}`);
    if (compose.variant) continue;
    for (const svc of compose.services) {
      if (svc.ports.length) add(`exposed: compose ${svc.name} ports ${svc.ports.join(",")}${where}`);
      for (const rule of svc.routers) add(`public entry: compose ${svc.name} via traefik ${rule}`);
    }
  }
  for (const tf of scan.infra.terraform) {
    const net = tf.resources.filter((r) => TF_NETWORK.test(r.type));
    if (net.length) add(`terraform network (${tf.file}): ${net.map((r) => `${r.type}.${r.name}`).join(" ")}`);
  }
  return lines;
}

/** Lines until the budget runs out, then one line saying how many were left out. */
function budgeted(lines, budget) {
  const out = [];
  let used = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (used + lines[i].length + 1 > budget) {
      out.push(`  (+${lines.length - i} more)`);
      break;
    }
    out.push(lines[i]);
    used += lines[i].length + 1;
  }
  return out;
}

function unitLines(unit, hidden = new Set()) {
  const lines = [];
  const bits = [
    `unit ${unit.path} (${unit.name}) [${unit.role}]`,
    unit.manifests.length ? unit.manifests.join("+") : "",
    `files:${unit.files}`,
    unit.dockerfile ? "docker" : "",
    unit.tags.length ? `uses:${unit.tags.join(",")}` : "",
  ].filter(Boolean);
  lines.push(bits.join(" "));
  if (unit.deployedAs.length) lines.push(`  runs as ${unit.deployedAs.join(", ")}`);
  const links = unit.links.filter((link) => !hidden.has(link));
  if (links.length) lines.push(`  imports units ${links.join(", ")}`);
  const users = (unit.usedBy || []).filter((user) => !hidden.has(user));
  if (unit.role === "library" && users.length) lines.push(`  imported by ${users.join(", ")}`);
  if (unit.entries.length) lines.push(`  entry ${unit.entries.slice(0, 5).join(", ")}`);
  if (unit.routes.length) lines.push(`  routes ${unit.routes.slice(0, 12).join("; ")}${unit.routes.length > 12 ? ` (+${unit.routes.length - 12})` : ""}`);
  if (unit.tables.length) lines.push(`  tables ${unit.tables.slice(0, 14).join(", ")}${unit.tables.length > 14 ? ` (+${unit.tables.length - 14})` : ""}`);
  if (unit.topics.length) lines.push(`  topics ${unit.topics.join(", ")}`);
  const env = unit.env.filter((e) => ENDPOINT_ENV.test(e) && !/PASSWORD|SECRET|TOKEN/.test(e)).slice(0, 12);
  if (env.length) lines.push(`  env ${env.join(", ")}`);
  if (unit.hosts.length) lines.push(`  calls ${unit.hosts.join(", ")}`);
  return lines;
}

/**
 * Compact text for prompts. Bounded per section, so a long unit list cannot
 * push the boundaries out; every line is evidence, not instructions.
 */
export function renderScan(scan, maxChars = 14000) {
  const head = [];
  const langs = Object.entries(scan.languages).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([ext, n]) => `${ext}:${n}`).join(" ");
  head.push(`repo ${scan.root}: ${scan.files} files; languages ${langs || "-"}${scan.monorepo?.length ? `; monorepo ${scan.monorepo.join(", ")}` : ""}`);

  const ranked = rankUnits(scan.units);
  const drawn = ranked.filter((unit) => !["tooling", "test", "docs", "example", "workspace"].includes(unit.role) || ranked.length === 1);
  const other = ranked.filter((unit) => !drawn.includes(unit));
  const hidden = new Set(other.map((unit) => unit.path));
  const units = drawn.slice(0, 30).flatMap((unit) => unitLines(unit, hidden));
  if (drawn.length > 30) units.push(`  (+${drawn.length - 30} more units: ${drawn.slice(30, 50).map((u) => u.path).join(", ")})`);
  if (other.length) units.push(`not runtime parts: ${other.slice(0, 12).map((u) => `${u.path} [${u.role}]`).join(", ")}${other.length > 12 ? ` (+${other.length - 12})` : ""}`);

  const deploy = [];
  for (const compose of scan.infra.compose) {
    const label = `compose ${compose.files.join("+")}${compose.variant ? ` [${compose.variant}]` : ""}`;
    if (compose.variant && scan.infra.compose.some((c) => !c.variant)) {
      const main = new Set(scan.infra.compose.filter((c) => !c.variant).flatMap((c) => c.services.map((s) => s.name)));
      const extra = compose.services.filter((s) => !main.has(s.name));
      deploy.push(`${label}: ${compose.services.length} services${extra.length ? `; adds ${extra.map((s) => `${s.name}(${shortImage(s.image) || `build ${s.build}`})`).join(", ")}` : ""}`);
      continue;
    }
    deploy.push(`${label}:`);
    for (const svc of compose.services) {
      deploy.push(`  ${svc.name}: ${svc.image ? shortImage(svc.image) : svc.build ? `build ${svc.build}${svc.dockerfile ? `/${svc.dockerfile}` : ""}` : svc.extends ? `extends ${svc.extends}` : "-"}${svc.command ? ` cmd "${svc.command.slice(0, 40)}"` : ""}${svc.ports.length ? ` ports ${svc.ports.join(",")}` : ""}${svc.dependsOn.length ? ` depends ${svc.dependsOn.join(",")}` : ""}${svc.networks.length ? ` nets ${svc.networks.join(",")}` : ""}${svc.profiles.length ? ` profiles ${svc.profiles.join(",")}` : ""}${svc.endpoints.length ? ` env ${svc.endpoints.slice(0, 5).join(" ")}` : ""}`);
    }
  }
  for (const proc of scan.infra.procfiles || []) deploy.push(`procfile ${proc.file}: ${proc.processes.map((p) => `${p.name}="${p.command.slice(0, 50)}"`).join("; ")}`);

  const k8s = [];
  const objects = scan.infra.k8s;
  const primary = objects.filter((o) => o.workload || /^(Service|Ingress|Gateway|HTTPRoute|GRPCRoute|VirtualService|IngressRoute|Namespace|ServiceEntry)$/.test(o.kind));
  for (const o of primary.filter((o) => o.workload)) {
    k8s.push(`k8s ${o.kind} ${o.name}${o.namespace ? ` ns:${o.namespace}` : ""} images ${o.images.map(shortImage).join(",") || "-"}${o.ports.length ? ` ports ${o.ports.join(",")}` : ""}${o.schedule ? ` schedule "${o.schedule}"` : ""}${o.env.length ? ` env ${o.env.slice(0, 6).join(" ")}` : ""}`);
  }
  for (const o of primary.filter((o) => o.kind === "Service")) k8s.push(`k8s Service ${o.name}${o.namespace ? ` ns:${o.namespace}` : ""} ${o.type} ports ${o.ports.join(",")}`);
  const rest = {};
  for (const o of objects.filter((o) => !primary.includes(o) && o.kind !== "NetworkPolicy")) rest[o.kind] = (rest[o.kind] || 0) + 1;
  if (Object.keys(rest).length) k8s.push(`k8s other objects: ${Object.entries(rest).sort((a, b) => b[1] - a[1]).map(([kind, n]) => `${kind} x${n}`).join(", ")}`);
  for (const k of scan.infra.kustomize || []) k8s.push(`kustomize ${k.dir}${k.namespace ? ` ns:${k.namespace}` : ""}: resources ${k.resources.slice(0, 12).join(",") || "-"}${k.components.length ? ` components ${k.components.slice(0, 8).join(",")}` : ""}`);
  for (const chart of scan.infra.helm) {
    k8s.push(`helm chart ${chart.name} (${chart.dir}) templates ${chart.kinds.join(",") || "-"}${chart.subcharts.length ? ` subcharts ${chart.subcharts.join(",")}` : ""}${chart.components.length ? ` components ${chart.components.join(",")}` : ""}${Object.keys(chart.values).length ? ` values ${JSON.stringify(chart.values)}` : ""}`);
  }
  const tf = [];
  for (const file of scan.infra.terraform) {
    tf.push(`terraform ${file.file}: ${file.resources.slice(0, 16).map((r) => `${r.type}.${r.name}`).join(" ")}${file.resources.length > 16 ? ` (+${file.resources.length - 16})` : ""}${file.modules.length ? ` modules ${file.modules.map((m) => `${m.name}(${m.source})`).join(" ")}` : ""}`);
  }
  const protos = (scan.infra.protos || []).map((p) => `grpc ${p.name} (${p.file}): ${p.rpcs.join(",")}`);
  const bounds = boundaries(scan).map((line) => `  ${line}`);

  // Units and boundaries matter most; deploy objects next; Terraform and protos last.
  // Headers and "(+N more)" markers need a little room of their own.
  const budget = Math.max(2000, maxChars - head.join("\n").length - 120);
  const shares = { units: 0.38, bounds: 0.17, deploy: 0.2, k8s: 0.13, tf: 0.06, protos: 0.06 };
  const sections = { units, bounds, deploy, k8s, tf, protos };
  let spare = 0;
  for (const [key, lines] of Object.entries(sections)) {
    const size = lines.reduce((sum, line) => sum + line.length + 1, 0);
    spare += Math.max(0, budget * shares[key] - size);
  }
  const need = Object.fromEntries(Object.entries(sections).map(([key, lines]) => [key, Math.max(0, lines.reduce((sum, line) => sum + line.length + 1, 0) - budget * shares[key])]));
  const over = Object.values(need).reduce((sum, n) => sum + n, 0) || 1;
  // A section that fits keeps what it needs; the rest of its share goes to the sections that overflow.
  const size = (key) => sections[key].reduce((sum, line) => sum + line.length + 1, 0);
  const allowed = Object.fromEntries(Object.keys(sections).map((key) => [key, need[key] > 0 ? budget * shares[key] + spare * (need[key] / over) : size(key)]));
  const out = [
    ...head,
    ...budgeted(units, allowed.units),
    ...budgeted(deploy, allowed.deploy),
    ...budgeted(k8s, allowed.k8s),
    ...budgeted(tf, allowed.tf),
    ...budgeted(protos, allowed.protos),
  ];
  if (bounds.length) out.push("boundaries:", ...budgeted(bounds, allowed.bounds));
  let text = out.join("\n");
  if (text.length > maxChars) text = `${text.slice(0, text.lastIndexOf("\n", maxChars - 12))}\n(truncated)`;
  return text;
}

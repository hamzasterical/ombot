// Deploy the OmBot workflows to fastn from this repo (the repo is the source of truth).
// Usage: node fastn/deploy.mjs [--dry-run]
//   1. builds fastn/dist (inlines shared helpers)
//   2. for each workflow in workflows.json: updates code + inputSchema when they differ from fastn
//   3. publishes every workflow that changed, so x-fastn-env "test" runs the new code
// Reads FASTN_API_KEY and FASTN_GATEWAY_URL from the repo-root .env (or the environment).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes("--dry-run");

function loadEnv() {
  const env = { ...process.env };
  const file = join(root, "..", ".env");
  if (!existsSync(file)) return env;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2];
  }
  return env;
}

const env = loadEnv();
const base = (env.FASTN_GATEWAY_URL || "https://api.fastn.dev/api/v1/workflows").replace(/\/+$/, "");
if (!env.FASTN_API_KEY) {
  console.error("FASTN_API_KEY is not set (.env or environment)");
  process.exit(1);
}
const headers = { Authorization: `Bearer ${env.FASTN_API_KEY}`, "Content-Type": "application/json" };
if (env.FASTN_API_KEY.startsWith("fsk_test_")) headers["X-fastn-Test-Mode"] = "true";

async function call(method, path, body) {
  const res = await fetch(`${base}${path}`, { method, headers, body: body && JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

// fastn stores JSON with its keys reordered, so compare key-order-independently
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]))
      : v;
const sameJson = (a, b) => JSON.stringify(canonical(a ?? null)) === JSON.stringify(canonical(b ?? null));

execFileSync(process.execPath, [join(root, "build.mjs")], { stdio: "inherit" });
const manifest = JSON.parse(readFileSync(join(root, "workflows.json"), "utf8"));

let failed = false;
for (const [name, { id, inputSchema }] of Object.entries(manifest)) {
  try {
    const code = readFileSync(join(root, "dist", `${name}.js`), "utf8");
    const current = (await call("GET", `/${id}`)).data;
    const changes = {};
    if (current.code !== code) changes.code = code;
    if (!sameJson(current.inputSchema, inputSchema)) changes.inputSchema = inputSchema;
    const unpublished = !current.devVersion || current.draftCode;
    if (!Object.keys(changes).length && !unpublished) {
      console.log(`${name}: up to date`);
      continue;
    }
    console.log(`${name}: ${Object.keys(changes).join(" + ") || "unpublished draft"}${dryRun ? " (dry run)" : ""}`);
    if (dryRun) continue;
    if (Object.keys(changes).length) await call("PUT", `/${id}`, changes);
    if (changes.code || unpublished) {
      const pub = await call("POST", `/${id}/publish`, { message: "deployed from repo (fastn/deploy.mjs)" });
      console.log(`${name}: published v${pub.data?.version?.versionNumber ?? "?"}`);
    }
  } catch (err) {
    failed = true;
    console.error(`${name}: FAILED ${err.message}`);
  }
}
process.exit(failed ? 1 : 0);

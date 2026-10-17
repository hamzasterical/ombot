// Inline the shared helpers into each workflow (the fastn sandbox has no imports).
// Usage: node fastn/build.mjs   ->  fastn/dist/<workflow>.js, the code pasted into fastn.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, "workflows");
const out = join(root, "dist");
const helpers = readFileSync(join(src, "_crypto.js"), "utf8");
mkdirSync(out, { recursive: true });

for (const file of readdirSync(src).filter((f) => f.endsWith(".js") && !f.startsWith("_"))) {
  const code = readFileSync(join(src, file), "utf8");
  const needsHelpers = /sha256Hex|hmacSha256Hex|base64Url|safeEqual/.test(code);
  writeFileSync(join(out, file), needsHelpers ? `${helpers}\n${code}` : code);
  console.log(`built ${file}${needsHelpers ? " (+helpers)" : ""}`);
}

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(resolve(root, "src/i18n.ts"), "utf8");

const enStart = source.indexOf("const en = {");
const enEnd = source.indexOf("export type TranslationKey");
const zhStart = source.indexOf("const zh:");
const zhEnd = source.indexOf("const knownText");

if (enStart === -1 || enEnd === -1 || zhStart === -1 || zhEnd === -1) {
  fail("Unable to locate i18n dictionaries.");
}

const enKeys = extractKeys(source.slice(enStart, enEnd));
const zhKeys = extractKeys(source.slice(zhStart, zhEnd));

const missingZh = enKeys.unique.filter((key) => !zhKeys.set.has(key));
const extraZh = zhKeys.unique.filter((key) => !enKeys.set.has(key));
const duplicated = [...enKeys.duplicates, ...zhKeys.duplicates];

if (missingZh.length || extraZh.length || duplicated.length) {
  if (missingZh.length) console.error(`Missing zh keys:\n${missingZh.map((key) => `  - ${key}`).join("\n")}`);
  if (extraZh.length) console.error(`Extra zh keys:\n${extraZh.map((key) => `  - ${key}`).join("\n")}`);
  if (duplicated.length) console.error(`Duplicate keys:\n${duplicated.map((key) => `  - ${key}`).join("\n")}`);
  process.exit(1);
}

console.log(`i18n check passed: ${enKeys.unique.length} keys`);

function extractKeys(block) {
  const keys = [...block.matchAll(/^\s*"([^"]+)":/gm)].map((match) => match[1]);
  const counts = new Map();
  keys.forEach((key) => counts.set(key, (counts.get(key) ?? 0) + 1));
  return {
    unique: [...counts.keys()].sort(),
    set: new Set(counts.keys()),
    duplicates: [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key),
  };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_DIRS = ["src/components", "src/hooks", "src/lib", "src/stores"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const IGNORE_FILES = [
  ".test.",
  ".spec.",
  "src/lib/i18n.ts",
  "src/lib/languages.ts",
  "src/lib/syntax-highlight.tsx",
  "src/lib/dev-seeding/",
];
const IGNORE_PATTERNS = [
  /^[A-Z0-9_:-]+$/,
  /^[a-z0-9_.:/-]+$/,
  /^[\w.-]+@[\w.-]+$/,
  /^settings\./,
  /^#[0-9a-fA-F]{3,8}$/,
  /^https?:\/\//,
  /^data:/,
  /^harnss-/,
  /^\.[\w-]+$/,
  /^--/,
  /^node_modules/,
  /^@[\w/-]+$/,
  /^npx\s/,
  /&&/,
  /=/,
  /^\[.*\]/,
];
const UI_ATTRS = new Set([
  "aria-label",
  "description",
  "label",
  "placeholder",
  "subtitle",
  "title",
  "tooltip",
  "confirmLabel",
  "cancelLabel",
  "emptyText",
]);
const UI_CALLS = new Set(["toast", "error", "success", "info", "warning"]);
const ALLOWLIST = new Set([
  "Harnss",
  "Claude",
  "Codex",
  "Jira",
  "ChatGPT",
  "MCP",
  "ACP",
  "Cursor",
  "VS Code",
  "Zed",
  "Promise",
  "Tab",
]);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      out.push(...walk(full));
      continue;
    }
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
    if (IGNORE_FILES.some((item) => rel.includes(item))) continue;
    out.push(full);
  }
  return out;
}

function loadDictionary() {
  const source = fs.readFileSync(path.join(ROOT, "src/lib/i18n.ts"), "utf8");
  const entries = new Set();
  const objectMatch = source.match(/export const UI_TEXT_ZH_CN:[\s\S]*?= \{([\s\S]*?)\};/);
  if (!objectMatch) throw new Error("Unable to locate UI_TEXT_ZH_CN");

  const regex = /"((?:\\"|[^"])*)"\s*:/g;
  let match;
  while ((match = regex.exec(objectMatch[1]))) {
    entries.add(match[1].replace(/\\"/g, '"'));
  }
  return entries;
}

function isLikelyUiText(value) {
  const text = value.replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
  if (text.length < 3) return false;
  if (!/[A-Za-z]/.test(text)) return false;
  if (ALLOWLIST.has(text)) return false;
  if (IGNORE_PATTERNS.some((pattern) => pattern.test(text))) return false;
  if (/^[A-Z][a-z]+[A-Z]/.test(text) && !text.includes(" ")) return false;
  return true;
}

function addCandidate(candidates, text, file, lineno) {
  const value = text.replace(/\\u2026/g, "…").replace(/\s+/g, " ").trim();
  if (!isLikelyUiText(value)) return;
  if (!candidates.has(value)) candidates.set(value, []);
  candidates.get(value).push(`${path.relative(ROOT, file).replace(/\\/g, "/")}:${lineno}`);
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

function isCoveredByRuntimePhrases(text, dictionary) {
  if (dictionary.has(text)) return true;
  for (const source of dictionary) {
    if (source.length >= 3 && text.includes(source)) return true;
  }
  return false;
}

function scanFile(file, candidates) {
  const source = fs.readFileSync(file, "utf8");

  const jsxTextRegex = />\s*([A-Z][^<>{}\n]{2,})\s*</g;
  let match;
  while ((match = jsxTextRegex.exec(source))) {
    addCandidate(candidates, match[1], file, lineNumberAt(source, match.index));
  }

  const attrRegex = /(\w[\w-]*)=\{?["']([^"'{}\n]{3,})["']\}?/g;
  while ((match = attrRegex.exec(source))) {
    if (!UI_ATTRS.has(match[1])) continue;
    addCandidate(candidates, match[2], file, lineNumberAt(source, match.index));
  }

  const objectPropRegex = /(\w[\w-]*)\s*:\s*["']([^"'{}\n]{3,})["']/g;
  while ((match = objectPropRegex.exec(source))) {
    if (!UI_ATTRS.has(match[1])) continue;
    addCandidate(candidates, match[2], file, lineNumberAt(source, match.index));
  }

  const callRegex = /\b(\w+)\.(error|success|info|warning)\(\s*["']([^"'{}\n]{3,})["']/g;
  while ((match = callRegex.exec(source))) {
    if (!UI_CALLS.has(match[2])) continue;
    addCandidate(candidates, match[3], file, lineNumberAt(source, match.index));
  }
}

function main() {
  const dictionary = loadDictionary();
  const candidates = new Map();
  for (const dir of SOURCE_DIRS) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const file of walk(abs)) scanFile(file, candidates);
  }

  const missing = Array.from(candidates.keys())
    .filter((text) => !isCoveredByRuntimePhrases(text, dictionary))
    .sort((a, b) => a.localeCompare(b));

  if (missing.length > 0) {
    console.error(`Missing i18n UI text entries: ${missing.length}`);
    for (const text of missing) {
      console.error(`- ${JSON.stringify(text)}`);
      for (const location of candidates.get(text).slice(0, 3)) {
        console.error(`  ${location}`);
      }
    }
    process.exit(1);
  }

  console.log("i18n UI text coverage OK");
}

main();

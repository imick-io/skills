#!/usr/bin/env node
// Keeps .claude-plugin/plugin.json's version equal to package.json's.
// `npm run version` runs it right after `changeset version`; with --check it
// only reports a mismatch (exit 1).

import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const pluginUrl = new URL(".claude-plugin/plugin.json", root);

const { version } = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const text = readFileSync(pluginUrl, "utf8");
const current = JSON.parse(text).version;

if (current === version) {
  console.log(`plugin.json is at ${version}`);
  process.exit(0);
}
if (process.argv.includes("--check")) {
  console.error(`plugin.json is at ${current}, package.json at ${version}: run npm run version`);
  process.exit(1);
}

// Replace only the version value, so key order and formatting survive.
writeFileSync(pluginUrl, text.replace(/("version"\s*:\s*")[^"]*"/, `$1${version}"`));
console.log(`plugin.json ${current} -> ${version}`);

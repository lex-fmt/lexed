#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const configPath = path.join(repoRoot, 'shared', 'lex-deps.json');

// Usage: node read-lex-config.mjs <dep> <field>
// Example: node read-lex-config.mjs lex-lsp version  → "v0.4.0"
const dep = process.argv[2];
const field = process.argv[3];

if (!dep || !field) {
  console.error('Usage: read-lex-config.mjs <dep> <field>');
  console.error('Example: read-lex-config.mjs lex-lsp version');
  process.exit(1);
}

try {
  const raw = readFileSync(configPath, 'utf8');
  const config = JSON.parse(raw);
  const depConfig = config.deps?.[dep];
  if (!depConfig) {
    console.error(`Dep "${dep}" not found in ${path.relative(repoRoot, configPath)}`);
    process.exit(1);
  }
  const value = depConfig[field];
  if (value === undefined) {
    console.error(`Field "${field}" not found for dep "${dep}"`);
    process.exit(1);
  }
  if (typeof value !== 'string') {
    console.error(`Value for "${dep}.${field}" must be a string`);
    process.exit(1);
  }
  process.stdout.write(value);
} catch (error) {
  console.error(`Unable to read lex deps config: ${(error && error.message) || error}`);
  process.exit(1);
}

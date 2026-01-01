#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const configPath = path.join(repoRoot, 'shared', 'lex-deps.json');

// Map old key names to new ones for backwards compatibility during migration
const keyMap = {
  lexLspVersion: 'lex-lsp',
  lexLspRepo: 'lex-lsp-repo',
};

const requestedKey = process.argv[2] ?? 'lex-lsp';
const key = keyMap[requestedKey] ?? requestedKey;

try {
  const raw = readFileSync(configPath, 'utf8');
  const config = JSON.parse(raw);
  if (!(key in config)) {
    console.error(`Key "${key}" not found in ${path.relative(repoRoot, configPath)}`);
    process.exit(1);
  }
  const value = config[key];
  if (typeof value !== 'string') {
    console.error(`Value for "${key}" must be a string`);
    process.exit(1);
  }
  process.stdout.write(value);
} catch (error) {
  console.error(`Unable to read lex deps config: ${(error && error.message) || error}`);
  process.exit(1);
}

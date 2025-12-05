#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const configPath = path.join(repoRoot, 'shared', 'src', 'lex-version.json');
const key = process.argv[2] ?? 'lexLspVersion';

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
  console.error(`Unable to read lex version config: ${(error && error.message) || error}`);
  process.exit(1);
}

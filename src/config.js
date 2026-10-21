import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

try {
  const values = parseEnv(readFileSync('.env', 'utf8'));
  for (const [key, value] of Object.entries(values)) process.env[key] ??= value;
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

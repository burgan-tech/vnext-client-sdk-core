/**
 * Tiny helper to load a JSON fixture from `fixtures/`.
 *
 * Tests use this so that fixture authoring stays decoupled from `import`
 * statements scattered across files.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..');

export function loadFixture<T = unknown>(relativePath: string): T {
  const full = resolve(ROOT, 'fixtures', relativePath);
  const raw = readFileSync(full, 'utf-8');
  return JSON.parse(raw) as T;
}

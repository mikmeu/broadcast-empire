import { readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// A Mac and Windows don't tell `BuildTray.tsx` from `buildTray.ts`: an import of './BuildTray' finds the .ts first
// there, and the type check fails on the Mac that builds the installer (0.21.0), though Linux finds nothing wrong.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const code = /\.(ts|tsx|js|mjs|cjs|json)$/;

function clashes(folder: string): string[][] {
  const entries = readdirSync(folder, { withFileTypes: true });
  const byName = new Map<string, string[]>();
  for (const entry of entries) {
    if (!code.test(entry.name)) continue;
    const key = entry.name.replace(code, '').toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), entry.name]);
  }
  const found = [...byName.values()]
    // Two files of one name in different casings; layout.fixture.ts beside layout.fixture.json is fine.
    .filter((names) => new Set(names.map((name) => name.replace(code, ''))).size > 1)
    .map((names) => names.map((name) => relative(root, join(folder, name))));
  for (const entry of entries) if (entry.isDirectory()) found.push(...clashes(join(folder, entry.name)));
  return found;
}

describe('the file names', () => {
  it('never differ only in casing, which a Mac or Windows would mix up', () => {
    expect([...clashes(join(root, 'src')), ...clashes(join(root, 'electron')), ...clashes(join(root, 'scripts'))]).toEqual([]);
  });
});

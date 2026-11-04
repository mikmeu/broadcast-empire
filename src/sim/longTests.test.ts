import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The long tests (*.long.test.ts) run in a job of their own, only when a change touches what they run on
// (.github/long-tests-paths.txt). These two checks keep that list and test.yml true as the code grows.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');

const longTests = readdirSync(join(root, 'src/sim'))
  .filter((f) => f.endsWith('.long.test.ts'))
  .map((f) => `src/sim/${f}`)
  .sort();

/** The paths a change must touch for the long tests to run. */
const watched = read('.github/long-tests-paths.txt')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.startsWith('#'));

const watches = (file: string) => watched.some((path) => file === path || file.startsWith(`${path}/`));

/** The files a source file imports for real: `import type` and a type-only name list run nothing. */
function importsOf(file: string): string[] {
  const text = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const found: string[] = [];
  const pattern = /(?:^|[\n;])\s*(import|export)\s+(type\s+)?([^'";]*?\bfrom\s*)?['"]([^'"]+)['"]/g;
  for (const [, , typeOnly, , from] of text.matchAll(pattern)) {
    if (typeOnly || !from!.startsWith('.')) continue;
    const base = relative(root, resolve(root, dirname(file), from!.replace(/\?.*$/, '')));
    const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`];
    const hit = candidates.find((c) => existsSync(join(root, c)) && statSync(join(root, c)).isFile());
    if (hit) found.push(hit);
  }
  return found;
}

describe('the long tests', () => {
  it('are each named once on a machine of the long job in test.yml', () => {
    expect(longTests.length).toBeGreaterThan(0);
    const workflow = read('.github/workflows/test.yml');
    const named = [...workflow.matchAll(/^\s+files:\s*(.+)$/gm)].flatMap((m) => m[1]!.trim().split(/\s+/)).sort();
    expect(named).toEqual(longTests);
  });

  it('run only on files that a change to the paths in long-tests-paths.txt reaches', () => {
    const seen = new Set<string>();
    const outside: string[] = [];
    const queue = [...longTests];
    while (queue.length > 0) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      // A test file is itself under a watched folder; what matters is what it pulls in.
      if (!file.endsWith('.test.ts') && !watches(file)) outside.push(file);
      if (/\.tsx?$/.test(file)) queue.push(...importsOf(file));
    }
    // A file here is one the test players run on but a change to it would not run the long tests:
    // add it to .github/long-tests-paths.txt.
    expect(outside.sort()).toEqual([]);
    // The reading found the files the long tests are known to need.
    expect(seen.has('src/sim/bots.ts')).toBe(true);
    expect(seen.has('src/mods/mapFile.ts')).toBe(true);
  });
});

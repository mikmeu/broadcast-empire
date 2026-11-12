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

/** Every test file under a folder, as a path from src/. */
function testsIn(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? testsIn(join(folder, entry.name)) : /\.test\.tsx?$/.test(entry.name) ? [relative(join(root, 'src'), join(folder, entry.name))] : [],
  );
}

// Tests named after their subject from before the rule, with no file of that name beside them. Nothing is added
// here: a new test is named after the file that holds what it tests.
const OLDER = [
  'config/roomGroups.test.ts', 'fileNames.test.ts', 'mods/editor.test.ts', 'mods/folder.test.ts', 'mods/forestAndBoats.test.ts',
  'mods/mapEditor.test.ts', 'mods/townRoadsOverGround.test.ts', 'office/office3d.test.ts', 'office/routine.test.ts',
  'office/spotsInUse.test.ts', 'office/streetscape.test.ts', 'office/view.test.ts', 'office/ways.test.ts',
  'sim/furnitureRegistry.test.ts', 'sim/longTests.test.ts', 'sim/lore.test.ts', 'ui/cursors.test.ts', 'ui/garage.test.ts',
  'ui/staffGroups.test.ts', 'ui/window.test.ts', 'wiki/wiki.test.ts',
];

describe('the names of the tests', () => {
  const tests = testsIn(join(root, 'src'));

  it('are never a phase, a version or an issue: the number goes in the describe title', () => {
    expect(tests.filter((file) => /(^|\/)(phase|version|issue|v)[-_]?\d/i.test(file))).toEqual([]);
  });

  // src/sim/licenses.ts -> licenses.test.ts, licenses.renewals.test.ts; a whole game: bots.<what it guards>.long.test.ts.
  it('start with the name of the file beside them that holds what they test', () => {
    const lost = tests.filter((file) => {
      const folder = join(root, 'src', dirname(file));
      const subject = file.slice(dirname(file) === '.' ? 0 : dirname(file).length + 1).split('.')[0]!;
      return !OLDER.includes(file) && !readdirSync(folder).some((name) => !/\.test\.tsx?$/.test(name) && name.split('.')[0] === subject);
    });
    expect(lost).toEqual([]);
  });
});

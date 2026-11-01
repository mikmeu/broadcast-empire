import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parseSettings } from '../persistence/settings';

const css = readFileSync('src/ui/styles.css', 'utf8');

/** The `--cursor-…` definitions on :root, and the rest of the stylesheet apart from them. */
const definitions = css.split('\n').filter((line) => /^\s*--cursor-[a-z-]+:/.test(line));
const rules = css.split('\n').filter((line) => /^\s*cursor:/.test(line));

describe('the cursors of the game (0.21.0, #311)', () => {
  it('has one variable for each cursor of the plan', () => {
    const names = definitions.map((line) => /--cursor-([a-z-]+):/.exec(line)![1]);
    for (const name of ['default', 'pointer', 'grab', 'grabbing', 'not-allowed', 'help', 'building', 'placing', 'resize-ew', 'resize-ns', 'resize-nwse']) {
      expect(names, name).toContain(name);
    }
  });

  it('has every rule use a variable, never a keyword', () => {
    expect(rules.length).toBeGreaterThan(15);
    for (const line of rules) expect(line.trim(), line).toMatch(/^cursor: var\(--cursor-[a-z-]+\);$/);
  });

  it('names only files that are in public/cursors, each with its double-size image', () => {
    const files = new Set(definitions.flatMap((line) => [...line.matchAll(/url\('\/cursors\/([^']+)'\)/g)].map((m) => m[1]!)));
    expect(files.size).toBeGreaterThan(0);
    for (const file of files) expect(existsSync(`public/cursors/${file}`), file).toBe(true);
    for (const file of files) if (!file.includes('@2x')) expect(files, file).toContain(file.replace('.png', '@2x.png'));
  });

  it('keeps a hotspot and the system cursor as the fallback on each image', () => {
    const images = definitions.filter((line) => line.includes('url('));
    expect(images.length).toBe(11);
    for (const line of images) expect(line, line).toMatch(/\) \d+ \d+, [a-z-]+;$/);
  });

  it('puts the hotspot inside the 32px image', () => {
    for (const line of definitions) {
      const spot = /\) (\d+) (\d+), /.exec(line);
      if (spot) expect(Math.max(Number(spot[1]), Number(spot[2])), line).toBeLessThan(32);
    }
  });

  it('has a plain keyword for each variable under the system cursor setting', () => {
    const system = /:root\[data-cursors='system'\] \{([^}]*)\}/.exec(css)![1]!;
    const plain = system.split('\n').filter((line) => line.includes('--cursor-'));
    expect(plain.length).toBe(definitions.filter((line) => line.includes('url(')).length);
    for (const line of plain) expect(line, line).not.toContain('url(');
  });

  it('keeps bare cursor keywords out of the code', () => {
    for (const file of ['src/office/scene/frame.ts', 'src/ui/mapEditor/PlanView.tsx']) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/cursor\s*[:=]\s*['"`]([^'"`]*)['"`]/g)) {
        expect(match[1], `${file}: ${match[0]}`).toMatch(/^(var\(--cursor-[a-z-]+\))?$/);
      }
    }
  });

  it('is switched off by a setting, kept in the settings of the browser', () => {
    expect(parseSettings(null).systemCursor).toBe(false);
    expect(parseSettings({ systemCursor: true }).systemCursor).toBe(true);
    expect(parseSettings({ systemCursor: 'yes' }).systemCursor).toBe(false);
  });
});

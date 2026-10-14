import { existsSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FURNITURE, type FurnitureType } from '../config/office';
import { PLACE_SOUND, SOUNDS, clickSound, type Sound } from './sounds';

const FOLDER = 'public/sounds';
const all = Object.entries(SOUNDS) as [string, Sound][];

describe('sounds (Phase 8c)', () => {
  it('every sound has its clips in public/sounds, and a sensible loudness', () => {
    for (const [id, sound] of all) {
      expect(sound.files.length, id).toBeGreaterThan(0);
      expect(sound.gain, id).toBeGreaterThan(0);
      expect(sound.gain, id).toBeLessThanOrEqual(1);
      for (const file of sound.files) expect(existsSync(`${FOLDER}/${file}`), file).toBe(true);
    }
  });

  it('ships no clip that nothing plays, and the license of every pack', () => {
    const used = new Set(all.flatMap(([, sound]) => sound.files));
    for (const pack of ['ui', 'impact', 'jingles']) {
      const files = readdirSync(`${FOLDER}/${pack}`);
      expect(files).toContain('License.txt');
      for (const file of files.filter((f) => f.endsWith('.ogg'))) expect(used.has(`${pack}/${file}`), file).toBe(true);
    }
  });

  it('gives every piece of furniture an impact sound of its own kind', () => {
    for (const type of Object.keys(FURNITURE) as FurnitureType[]) {
      const sound: Sound = SOUNDS[PLACE_SOUND[type]];
      expect(sound.files.every((f) => f.startsWith('impact/')), type).toBe(true);
      // Several takes, so placing a row of desks does not sound like a stamp.
      expect(sound.files.length, type).toBeGreaterThan(1);
    }
    // Heavier pieces get the heavier sound.
    expect(PLACE_SOUND.set).toBe('woodHeavy');
    expect(PLACE_SOUND.microphone).toBe('metalLight');
  });

  it('picks the sound of a control from what it is', () => {
    const button = (classes: string[] = [], more = {}) => ({ tag: 'button', classes, ...more });
    expect(clickSound(button())).toBe('click');
    expect(clickSound(button(['primary']))).toBe('confirm');
    expect(clickSound(button([], { role: 'tab' }))).toBe('tab');
    expect(clickSound(button([], { role: 'radio' }))).toBe('tab');
    expect(clickSound(button(['tab'], { inDock: true }))).toBe('open');
    expect(clickSound(button(['tab', 'settings-button']))).toBe('open');
    expect(clickSound(button(['window-button'], { label: 'Close' }))).toBe('close');
    expect(clickSound(button(['window-button'], { label: 'Minimize' }))).toBe('toggle');
    // Closing wins over what kind of button it is.
    expect(clickSound(button(['primary'], { label: 'Close' }))).toBe('close');
    expect(clickSound({ tag: 'input', type: 'checkbox', classes: [] })).toBe('toggle');
    expect(clickSound({ tag: 'path', role: 'button', classes: ['map-region', 'coast'] })).toBe('tab');
  });

  it('keeps text fields, sliders and lists quiet when they are clicked', () => {
    expect(clickSound({ tag: 'input', type: 'text', classes: [] })).toBeNull();
    expect(clickSound({ tag: 'input', classes: [] })).toBeNull();
    expect(clickSound({ tag: 'input', type: 'range', classes: [] })).toBeNull();
    expect(clickSound({ tag: 'select', classes: [] })).toBeNull();
  });
});

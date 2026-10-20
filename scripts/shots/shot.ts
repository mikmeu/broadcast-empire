// What a file of shots for scripts/screenshot.ts is made of. Kept apart from the script, which runs as soon as it is imported.

import type { Page } from 'playwright-core';
import type { useOfficeView } from '../../src/ui/officeView';
import type { useGameStore } from '../../src/ui/store';
import type { useWiki } from '../../src/ui/wiki';

/** What a shot's functions get in the page: the game's stores. */
export interface Stores {
  game: typeof useGameStore;
  office: typeof useOfficeView;
  wiki: typeof useWiki;
}

/** For a shot's css: everything but the 3D view of the office is made invisible. */
export const HIDE_OVERLAYS = '#root * { visibility: hidden !important; } #root .office3d canvas { visibility: visible !important; }';

/** Runs a function in the page with the stores and a value that can be sent as JSON. */
export type InPage = <T, A = undefined>(fn: (be: Stores, arg: A) => T | Promise<T>, arg?: A) => Promise<Awaited<T>>;

export interface Shot {
  /** To pick it on the command line. */
  name: string;
  /** Where the picture goes, from the project's folder: .png, .jpg or .webp. */
  file: string;
  /** The size of the browser window in CSS pixels; 1280×800 when left out. */
  viewport?: { width: number; height: number };
  /** What to capture: a CSS selector (the office's 3D view is '.office3d canvas'), or the whole window. What lies over it is captured too. */
  selector?: string;
  /** Styles for the moment of the capture: HIDE_OVERLAYS leaves only the 3D view, without the menus and labels over it. */
  css?: string;
  /** The size of the picture. The capture is scaled to fill it, and cut at the sides if it has another shape. */
  size?: { width: number; height: number };
  /** Quality of a .webp or .jpg, 0 to 1; 0.85 when left out. */
  quality?: number;
  /** Sets the scene: start a game, open a window, turn or zoom the view. */
  prepare?: (page: Page, game: InPage) => Promise<void>;
  /** Milliseconds to wait after prepare, for the models to load and the scene to settle; 2000 when left out. */
  settle?: number;
}

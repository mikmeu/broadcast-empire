// What the desktop app offers the game on top of a browser. The Electron
// preload script (electron/preload.cjs) puts this object on the window; in a
// browser it is absent and the game falls back to the browser's own storage.

export interface DesktopBridge {
  /** 'darwin', 'win32' or 'linux'. */
  platform: string;
  /** The version of the application. */
  version: string;
  saves: {
    /** The folder the save files are in. */
    folder(): Promise<string>;
    /** Opens that folder in the file manager. */
    showFolder(): Promise<void>;
    /** The ids of all save files. */
    list(): Promise<string[]>;
    /** The text of a save file, or null when there is none. */
    read(id: string): Promise<string | null>;
    write(id: string, text: string): Promise<void>;
    remove(id: string): Promise<void>;
  };
  /** Calls back when the player closes the window, so the game can save first; it must end with `close()`. */
  onClosing(callback: () => void): void;
  /** Closes the window for good. */
  close(): void;
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

/** The desktop app's bridge, or undefined when the game runs in a browser. */
export const desktop: DesktopBridge | undefined = typeof window === 'undefined' ? undefined : window.desktop;

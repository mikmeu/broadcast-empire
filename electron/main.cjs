// The desktop app (prompt.md Phase 7): one window around the built game.
// The game itself is the same web page as in a browser; this file adds what a
// browser can't give it: a window of its own, save files in the player's own
// folder, and a moment to save when that window is closed.

const { app, BrowserWindow, Menu, ipcMain, net, protocol, session, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

/** The built game (`npm run build`). */
const GAME = path.join(__dirname, '..', 'dist');
/** Where the game is served inside the app. A scheme of its own keeps paths like /models/… working. */
const ORIGIN = 'app://game';
/** For development: a running Vite server to show instead of the built game. */
const DEV_URL = process.env.BROADCAST_EMPIRE_DEV_URL;

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

// --- Save files: one JSON file per save, in the folder the system keeps for this app ---

const savesFolder = () => path.join(app.getPath('userData'), 'saves');
/** Save ids become file names, so they are limited to what is safe as one. */
const SAVE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

function saveFile(id) {
  if (typeof id !== 'string' || !SAVE_ID.test(id)) throw new Error('Not a save id.');
  return path.join(savesFolder(), `${id}.json`);
}

const saves = {
  folder: async () => savesFolder(),
  show: async () => {
    await fs.mkdir(savesFolder(), { recursive: true });
    await shell.openPath(savesFolder());
  },
  list: async () => {
    const files = await fs.readdir(savesFolder()).catch(() => []);
    return files.filter((file) => file.endsWith('.json') && SAVE_ID.test(file.slice(0, -5))).map((file) => file.slice(0, -5));
  },
  read: async (id) => fs.readFile(saveFile(id), 'utf8').catch((error) => (error.code === 'ENOENT' ? null : Promise.reject(error))),
  write: async (id, text) => {
    if (typeof text !== 'string') throw new Error('A save is text.');
    const file = saveFile(id);
    await fs.mkdir(savesFolder(), { recursive: true });
    // Written beside the save and then moved over it, so a crash halfway never leaves half a save.
    await fs.writeFile(`${file}.tmp`, text, 'utf8');
    await fs.rename(`${file}.tmp`, file);
  },
  remove: async (id) => {
    await fs.rm(saveFile(id), { force: true });
  },
};

/** Only the game's own page may use the save files. */
const fromGame = (event) => {
  const url = event.senderFrame?.url ?? '';
  return url.startsWith(`${ORIGIN}/`) || (DEV_URL !== undefined && url.startsWith(DEV_URL));
};

for (const [name, handler] of Object.entries(saves)) {
  ipcMain.handle(`saves:${name}`, (event, ...args) => {
    if (!fromGame(event)) throw new Error('Not allowed.');
    return handler(...args);
  });
}

// --- The window ---

let win = null;
/** Whether the game has asked for a moment to save before its window closes. */
let savesOnClose = false;

/**
 * What the game's page may load: only what ships with the game. The inline
 * script is the one in index.html that sets the color scheme; WebAssembly,
 * blob: and data: are how the 3D models are unpacked and bring their pictures
 * along.
 */
const CONTENT_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
].join('; ');

function serveGame() {
  protocol.handle('app', async (request) => {
    const { host, pathname } = new URL(request.url);
    const file = path.normalize(path.join(GAME, decodeURIComponent(pathname)));
    if (host !== 'game' || (file !== GAME && !file.startsWith(GAME + path.sep))) return new Response('Not found', { status: 404 });
    const page = pathname === '/' || pathname === '/index.html';
    try {
      const response = await net.fetch(pathToFileURL(page ? path.join(GAME, 'index.html') : file).toString());
      if (!page) return response;
      const headers = new Headers(response.headers);
      headers.set('Content-Security-Policy', CONTENT_POLICY);
      return new Response(response.body, { status: response.status, headers });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'Broadcast Empire',
    backgroundColor: '#3c199b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [`--game-version=${app.getVersion()}`],
    },
  });
  win.once('ready-to-show', () => win.show());

  // The game never leaves its own page: links open in the browser, and nothing else may navigate.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  // Closing the window first gives the game a moment to save, and a few seconds at most.
  win.on('close', (event) => {
    if (!savesOnClose) return;
    event.preventDefault();
    savesOnClose = false;
    win.webContents.send('closing');
    setTimeout(() => win?.destroy(), 4000);
  });
  win.on('closed', () => {
    win = null;
  });

  void win.loadURL(DEV_URL ?? `${ORIGIN}/`);
}

ipcMain.on('saves-on-close', (event) => {
  if (fromGame(event)) savesOnClose = true;
});
ipcMain.on('close', (event) => {
  if (fromGame(event)) win?.destroy();
});

function buildMenu() {
  const mac = process.platform === 'darwin';
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(mac ? [{ role: 'appMenu' }] : []),
      { label: 'Game', submenu: [{ role: 'togglefullscreen' }, { type: 'separator' }, mac ? { role: 'close' } : { role: 'quit' }] },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, ...(app.isPackaged ? [] : [{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }])],
      },
      { role: 'windowMenu' },
    ]),
  );
}

// One copy of the game at a time: two would write over each other's saves.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  void app.whenReady().then(() => {
    // The game needs no camera, microphone, location or notifications.
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, allow) => allow(false));
    serveGame();
    buildMenu();
    createWindow();
  });

  // A game with one window ends when that window closes, on every system.
  app.on('window-all-closed', () => app.quit());
}

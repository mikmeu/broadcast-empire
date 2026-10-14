// What the game's page may ask of the desktop app (see electron/main.cjs).
// It runs before the page, in a sandbox: the page gets these functions and
// nothing else of the system. The shape is `DesktopBridge` in
// src/persistence/desktop.ts.

const { contextBridge, ipcRenderer } = require('electron');

const version = process.argv.find((arg) => arg.startsWith('--game-version='))?.slice('--game-version='.length) ?? '';

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  version,
  saves: {
    folder: () => ipcRenderer.invoke('saves:folder'),
    showFolder: () => ipcRenderer.invoke('saves:show'),
    list: () => ipcRenderer.invoke('saves:list'),
    read: (id) => ipcRenderer.invoke('saves:read', id),
    write: (id, text) => ipcRenderer.invoke('saves:write', id, text),
    remove: (id) => ipcRenderer.invoke('saves:remove', id),
  },
  onClosing: (callback) => {
    ipcRenderer.on('closing', () => callback());
    ipcRenderer.send('saves-on-close');
  },
  close: () => ipcRenderer.send('close'),
});

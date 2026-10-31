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
  mods: {
    folder: () => ipcRenderer.invoke('mods:folder'),
    showFolder: () => ipcRenderer.invoke('mods:show'),
    list: (kind) => ipcRenderer.invoke('mods:list', kind),
    read: (kind, id) => ipcRenderer.invoke('mods:read', kind, id),
    write: (kind, id, text, glb) => ipcRenderer.invoke('mods:write', kind, id, text, glb),
    remove: (kind, id) => ipcRenderer.invoke('mods:remove', kind, id),
    importFile: (kind) => ipcRenderer.invoke('mods:import', kind),
    exportFile: (kind, suggestedName, text) => ipcRenderer.invoke('mods:export', kind, suggestedName, text),
  },
  onClosing: (callback) => {
    ipcRenderer.on('closing', () => callback());
    ipcRenderer.send('saves-on-close');
  },
  close: () => ipcRenderer.send('close'),
  latestVersion: () => ipcRenderer.invoke('updates:latest'),
});

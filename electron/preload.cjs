// Preload runs in the renderer just before the page scripts, but it has
// access to a limited Node API. We don't expose anything for now —
// the game is pure browser code. Keep this file as the bridge for the
// future (e.g. native file dialogs, OS notifications, save files on disk).
//
// Example for later:
//   const { contextBridge, ipcRenderer } = require('electron');
//   contextBridge.exposeInMainWorld('api', {
//     saveProfile: (data) => ipcRenderer.invoke('save-profile', data),
//   });

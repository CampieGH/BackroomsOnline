// Electron MAIN process. Runs in Node.js context.
// Job: create the BrowserWindow and load index.html. Nothing else.
//
// The renderer (the actual game) runs in a sandboxed Chromium with no
// Node access — exactly like a normal browser. The game already uses
// CDN imports for Three.js + PeerJS, so it works unchanged.

const { app, BrowserWindow, Menu, shell, session } = require('electron');
const path = require('node:path');

// Helpful: expose a `--dev` flag so we can open DevTools while iterating.
const isDev = process.argv.includes('--dev') || !app.isPackaged;

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#000000',
    title: 'Backrooms Online',
    autoHideMenuBar: true,         // hide the File/Edit/… bar
    webPreferences: {
      // No Node in the renderer — game is pure browser code.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
      // Helpful background-throttling defaults for a game.
      backgroundThrottling: false,
    },
  });

  // Strip the application menu entirely in production. In dev keep the
  // default so View → Toggle DevTools is one click away.
  if (!isDev) Menu.setApplicationMenu(null);

  // Load the local HTML — no http server needed, file:// works fine
  // because the import-map dependencies are CDN-hosted https URLs.
  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });

  // Open external links (e.g. accidental anchors) in the OS browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  // Allow microphone access for voice chat
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });

  createWindow();

  // macOS convention: re-create window when dock icon is clicked
  // and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// On Windows / Linux, quit when all windows are closed.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

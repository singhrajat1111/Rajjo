const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const isDev = !app.isPackaged;
let mainWindow = null;
let pythonProcess = null;

function findPythonExecutable() {
  const rootDir = path.join(__dirname, '..');
  const winVenvPy = path.join(rootDir, 'backend', 'venv', 'Scripts', 'python.exe');
  const unixVenvPy = path.join(rootDir, 'backend', 'venv', 'bin', 'python');

  if (process.platform === 'win32' && fs.existsSync(winVenvPy)) {
    return winVenvPy;
  }
  if (fs.existsSync(unixVenvPy)) {
    return unixVenvPy;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

function checkBackendHealth(retries = 30, interval = 500) {
  return new Promise((resolve) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const req = http.get('http://127.0.0.1:8000/health', (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else if (attempts < retries) {
          setTimeout(check, interval);
        } else {
          resolve(false);
        }
      });
      req.on('error', () => {
        if (attempts < retries) {
          setTimeout(check, interval);
        } else {
          resolve(false);
        }
      });
      req.setTimeout(1000, () => {
        req.destroy();
        if (attempts < retries) {
          setTimeout(check, interval);
        } else {
          resolve(false);
        }
      });
    };
    check();
  });
}

function spawnPythonBackend() {
  console.log('[Electron] Starting Python backend...');

  let scriptPath;
  let args = [];
  let options = {};

  if (isDev) {
    scriptPath = findPythonExecutable();
    args = ['main.py'];
    options = {
      cwd: path.join(__dirname, '..', 'backend'),
      env: {
        ...process.env,
        PYTHONPATH: path.join(__dirname, '..'),
        PYTHONUNBUFFERED: '1'
      }
    };
    console.log(`[Electron] Using Python interpreter: ${scriptPath}`);
  } else {
    // Packaged production binary
    scriptPath = path.join(process.resourcesPath, 'bin', 'rajjo_backend.exe');
    args = [];
    options = {
      cwd: path.dirname(scriptPath)
    };
    console.log(`[Electron] Using packaged backend binary: ${scriptPath}`);
  }

  try {
    pythonProcess = spawn(scriptPath, args, options);

    pythonProcess.stdout.on('data', (data) => {
      console.log(`[Python stdout] ${data.toString().trim()}`);
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`[Python stderr] ${data.toString().trim()}`);
    });

    pythonProcess.on('error', (err) => {
      console.error('[Electron] Failed to spawn Python backend process:', err);
    });

    pythonProcess.on('close', (code) => {
      console.log(`[Electron] Python backend process exited with code ${code}`);
      pythonProcess = null;
    });
  } catch (err) {
    console.error('[Electron] Exception while spawning backend:', err);
  }
}

function killPythonBackend() {
  if (pythonProcess) {
    console.log('[Electron] Terminating Python backend...');
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', pythonProcess.pid, '/f', '/t']);
      } else {
        pythonProcess.kill('SIGTERM');
      }
    } catch (e) {
      console.error('[Electron] Error terminating backend:', e);
    }
    pythonProcess = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: '#090A0F',
    title: 'Rajjo - Local Autonomous AI Agent'
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ----------------- IPC Handlers -----------------

ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('dialog-select-gguf', async () => {
  if (!mainWindow) return null;
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Select GGUF Model File',
    properties: ['openFile'],
    filters: [
      { name: 'GGUF Models (*.gguf)', extensions: ['gguf'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (!res.canceled && res.filePaths.length > 0) {
    return res.filePaths[0];
  }
  return null;
});

// ----------------- App Lifecycle -----------------

app.whenReady().then(async () => {
  // In development, if backend is already running (e.g. started via npm run dev), check health first
  const alreadyRunning = await checkBackendHealth(2, 200);
  if (!alreadyRunning) {
    spawnPythonBackend();
  }

  // Wait for health check before opening UI
  console.log('[Electron] Awaiting backend health check...');
  const isHealthy = await checkBackendHealth(30, 500);
  console.log(`[Electron] Backend health status: ${isHealthy ? 'READY' : 'TIMEOUT'}`);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  killPythonBackend();
});

app.on('window-all-closed', () => {
  killPythonBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

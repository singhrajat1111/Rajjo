const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

const isDev = !app.isPackaged;
let mainWindow = null;
let pythonProcess = null;
let backendPort = 8000;
let backendBaseUrl = 'http://127.0.0.1:8000';
let isShuttingDown = false;

// ----------------- Data Directory & Logging -----------------

function getDataDir() {
  if (process.env.RAJJO_DATA_DIR && process.env.RAJJO_DATA_DIR.trim()) {
    return path.resolve(process.env.RAJJO_DATA_DIR.trim());
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Rajjo');
  }
  return path.join(os.homedir(), '.rajjo');
}

function getLogFile() {
  const dataDir = getDataDir();
  const logsDir = path.join(dataDir, 'logs');
  if (!fs.existsSync(logsDir)) {
    try {
      fs.mkdirSync(logsDir, { recursive: true });
    } catch (e) {
      // Fallback
    }
  }
  return path.join(logsDir, 'rajjo_electron.log');
}

function log(level, message, error = null) {
  const ts = new Date().toISOString();
  const errStr = error ? ` - ${error.stack || error}` : '';
  const line = `[${ts}] [${level.toUpperCase()}] ${message}${errStr}\n`;
  console.log(`[Electron ${level.toUpperCase()}] ${message}${errStr}`);
  try {
    fs.appendFileSync(getLogFile(), line, 'utf-8');
  } catch (e) {
    // Ignore logging write failures
  }
}

// ----------------- Session Token Management -----------------

function getOrCreateApiToken() {
  if (process.env.RAJJO_API_TOKEN && process.env.RAJJO_API_TOKEN.trim()) {
    return process.env.RAJJO_API_TOKEN.trim();
  }
  const dataDir = getDataDir();
  const tokenFile = path.join(dataDir, '.session_token');
  try {
    if (fs.existsSync(tokenFile)) {
      const stored = fs.readFileSync(tokenFile, 'utf-8').trim();
      if (stored.length >= 32) {
        process.env.RAJJO_API_TOKEN = stored;
        return stored;
      }
    }
  } catch (e) {
    log('error', 'Error reading existing session token', e);
  }

  const generated = crypto.randomBytes(32).toString('hex');
  process.env.RAJJO_API_TOKEN = generated;
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(tokenFile, generated, { encoding: 'utf-8' });
  } catch (e) {
    log('error', 'Error writing new session token', e);
  }
  return generated;
}

// ----------------- Port Probing -----------------

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findAvailablePort(startPort = 8000, maxAttempts = 50) {
  for (let i = 0; i < maxAttempts; i++) {
    const p = startPort + i;
    if (await isPortAvailable(p)) {
      return p;
    }
  }
  return startPort;
}

// ----------------- Backend Process Lifecycle -----------------

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

function checkBackendHealth(port, retries = 70, interval = 500) {
  return new Promise((resolve) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
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
      req.setTimeout(1200, () => {
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

function spawnPythonBackend(port) {
  backendPort = port;
  backendBaseUrl = `http://127.0.0.1:${port}`;
  log('info', `Spawning backend on port ${port} (mode: ${isDev ? 'development' : 'production'})`);

  const apiToken = getOrCreateApiToken();
  let scriptPath;
  let args = [];
  let options = {};

  if (isDev) {
    scriptPath = findPythonExecutable();
    const runScript = path.join(__dirname, '..', 'backend', 'run.py');
    args = [runScript, '--port', String(port), '--host', '127.0.0.1'];
    options = {
      cwd: path.join(__dirname, '..', 'backend'),
      env: {
        ...process.env,
        RAJJO_PORT: String(port),
        RAJJO_HOST: '127.0.0.1',
        RAJJO_API_TOKEN: apiToken,
        PYTHONPATH: path.join(__dirname, '..'),
        PYTHONUNBUFFERED: '1'
      }
    };
    log('info', `Using dev Python: ${scriptPath} with args: ${args.join(' ')}`);
  } else {
    // Packaged standalone executable
    const binaryName = process.platform === 'win32' ? 'rajjo_backend.exe' : 'rajjo_backend';
    const primaryPath = path.join(process.resourcesPath, 'bin', binaryName);
    const fallbackDistPath = path.join(__dirname, '..', 'backend', 'dist', binaryName);
    scriptPath = fs.existsSync(primaryPath) ? primaryPath : fallbackDistPath;
    args = ['--port', String(port), '--host', '127.0.0.1'];
    options = {
      cwd: path.dirname(scriptPath),
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        RAJJO_PORT: String(port),
        RAJJO_HOST: '127.0.0.1',
        RAJJO_API_TOKEN: apiToken
      }
    };
    log('info', `Using packaged executable: ${scriptPath} with args: ${args.join(' ')}`);
  }

  if (isDev && process.platform !== 'win32') {
    options.detached = true;
  }

  try {
    pythonProcess = spawn(scriptPath, args, options);
    log('info', `Backend process spawned with PID: ${pythonProcess.pid}`);

    pythonProcess.stdout.on('data', (data) => {
      const line = data.toString().trim();
      if (line) log('info', `[Backend stdout] ${line}`);
    });

    pythonProcess.stderr.on('data', (data) => {
      const line = data.toString().trim();
      if (line) log('warn', `[Backend stderr] ${line}`);
    });

    pythonProcess.on('error', (err) => {
      log('error', 'Backend process spawn error', err);
    });

    pythonProcess.on('close', (code) => {
      log('info', `Backend process closed with exit code ${code}`);
      pythonProcess = null;
    });
  } catch (err) {
    log('error', 'Exception occurred while spawning backend', err);
  }
}

function killPythonBackend() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  if (pythonProcess && pythonProcess.pid) {
    const pid = pythonProcess.pid;
    log('info', `Terminating backend process tree (PID: ${pid})...`);
    try {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(pid), '/f', '/t'], { windowsHide: true, stdio: 'ignore' });
      } else {
        // Unix: Kill entire process group (negative PID) to avoid orphan child processes (e.g. Playwright)
        try {
          process.kill(-pid, 'SIGTERM');
          // Escalate to SIGKILL if processes remain active after grace period
          setTimeout(() => {
            try {
              process.kill(-pid, 'SIGKILL');
            } catch (_) {}
          }, 1500).unref();
        } catch (groupErr) {
          // Fallback to tree pkill and direct process signal
          try {
            spawnSync('pkill', ['-TERM', '-P', String(pid)], { stdio: 'ignore' });
          } catch (_) {}
          try {
            pythonProcess.kill('SIGTERM');
          } catch (_) {}
        }
      }
    } catch (e) {
      log('error', 'Error killing backend process tree', e);
    }
    pythonProcess = null;
  }
}

// ----------------- Window Creation -----------------

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
      sandbox: true
    },
    backgroundColor: '#090A0F',
    title: 'Rajjo - Local Autonomous AI Agent'
  });

  if (isDev) {
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      log('debug', `[Renderer L${level}] ${message} (${sourceId}:${line})`);
    });
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      log('error', `Renderer failed to load ${validatedURL}: ${errorCode} - ${errorDescription}`);
      const distIndex = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
      if (fs.existsSync(distIndex)) {
        log('info', 'Dev server unreachable; falling back to packaged dist/index.html');
        mainWindow.loadFile(distIndex);
      }
    });
    mainWindow.loadURL('http://localhost:5173');
  } else {
    const prodIndex = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
    mainWindow.loadFile(prodIndex);
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

ipcMain.on('window-fullscreen', () => {
  if (mainWindow) {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
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

ipcMain.handle('get-api-token', async () => {
  return getOrCreateApiToken();
});

ipcMain.handle('get-api-base', async () => {
  return backendBaseUrl;
});

ipcMain.handle('get-api-port', async () => {
  return backendPort;
});

// ----------------- App Lifecycle -----------------

app.whenReady().then(async () => {
  log('info', `Rajjo application starting (v${app.getVersion()}, isPackaged: ${app.isPackaged})`);

  // 1. Determine available port
  let chosenPort = 8000;
  if (isDev) {
    // In dev, check if 8000 is already running and healthy (e.g. launched via npm run dev)
    const is8000Healthy = await checkBackendHealth(8000, 2, 200);
    if (is8000Healthy) {
      log('info', 'Existing backend service detected on port 8000 in dev mode');
      chosenPort = 8000;
    } else {
      chosenPort = await findAvailablePort(8000, 30);
      spawnPythonBackend(chosenPort);
    }
  } else {
    // In production, find available port and spawn bundled binary
    chosenPort = await findAvailablePort(8000, 30);
    spawnPythonBackend(chosenPort);
  }

  backendPort = chosenPort;
  backendBaseUrl = `http://127.0.0.1:${chosenPort}`;

  // 2. Wait for backend health check
  log('info', `Awaiting backend readiness at ${backendBaseUrl}/health...`);
  const isHealthy = await checkBackendHealth(chosenPort, 70, 500);

  if (!isHealthy) {
    log('error', `Backend failed to become healthy at ${backendBaseUrl} within 35s`);
    dialog.showErrorBox(
      'Rajjo Backend Startup Failure',
      `The local Rajjo AI backend service failed to respond at ${backendBaseUrl}.\n\nPlease check the logs at:\n${getLogFile()}`
    );
  } else {
    log('info', `Backend confirmed healthy at ${backendBaseUrl}!`);
  }

  // 3. Create window
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  log('info', 'App before-quit triggered; cleaning up backend...');
  killPythonBackend();
});

app.on('window-all-closed', () => {
  log('info', 'All windows closed; cleaning up backend...');
  killPythonBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

process.on('exit', () => {
  killPythonBackend();
});

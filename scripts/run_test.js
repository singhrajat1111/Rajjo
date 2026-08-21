const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.join(__dirname, '..');
const winVenv = path.join(rootDir, 'backend', 'venv', 'Scripts', 'python.exe');
const unixVenv = path.join(rootDir, 'backend', 'venv', 'bin', 'python');

let pythonCmd = 'python';
if (process.platform === 'win32' && fs.existsSync(winVenv)) {
  pythonCmd = winVenv;
} else if (fs.existsSync(unixVenv)) {
  pythonCmd = unixVenv;
} else {
  pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
}

const child = spawn(pythonCmd, ['scripts/test_suite.py'], {
  cwd: rootDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    PYTHONPATH: rootDir
  }
});

child.on('close', (code) => {
  process.exit(code || 0);
});

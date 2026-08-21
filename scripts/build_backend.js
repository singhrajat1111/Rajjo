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

console.log(`[Rajjo Packaging] Building backend executable with: ${pythonCmd}...`);

const distDir = path.join(rootDir, 'backend', 'dist');
const buildDir = path.join(rootDir, 'backend', 'build');
const entryPoint = path.join(rootDir, 'backend', 'run.py');

const args = [
  '-m', 'PyInstaller',
  '--noconsole',
  '--onefile',
  '--name', 'rajjo_backend',
  '--distpath', distDir,
  '--workpath', buildDir,
  '--clean',
  entryPoint
];

const child = spawn(pythonCmd, args, {
  cwd: rootDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    PYTHONPATH: rootDir
  }
});

child.on('close', (code) => {
  if (code === 0) {
    console.log(`[Rajjo Packaging] Backend executable built successfully at ${path.join(distDir, 'rajjo_backend.exe')}`);
  } else {
    console.error(`[Rajjo Packaging] PyInstaller exited with code ${code}`);
  }
  process.exit(code || 0);
});

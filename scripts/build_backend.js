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

console.log(`\n==================================================`);
console.log(` 📦 [Rajjo Packaging] Building Self-Contained Backend`);
console.log(` Interpreter: ${pythonCmd}`);
console.log(`==================================================\n`);

const distDir = path.join(rootDir, 'backend', 'dist');
const buildDir = path.join(rootDir, 'backend', 'build');
const entryPoint = path.join(rootDir, 'backend', 'run.py');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const hiddenImports = [
  'uvicorn.logging',
  'uvicorn.loops',
  'uvicorn.loops.auto',
  'uvicorn.protocols',
  'uvicorn.protocols.http',
  'uvicorn.protocols.http.auto',
  'uvicorn.protocols.http.h11_impl',
  'uvicorn.protocols.websockets',
  'uvicorn.protocols.websockets.auto',
  'uvicorn.lifespans',
  'uvicorn.lifespans.on',
  'uvicorn.lifespans.auto',
  'keyring.backends',
  'keyring.backends.Windows',
  'pydantic',
  'pydantic_core',
  'fastapi',
  'starlette',
  'anyio',
  'anyio._backends._asyncio',
  'langgraph',
  'langchain',
  'langchain_core',
  'langchain_community',
  'langchain_openai',
  'chromadb',
  'chromadb.telemetry.product.posthog',
  'sqlite3',
  'duckduckgo_search',
  'playwright',
  'httpx',
  'aiofiles',
  'dotenv'
];

const args = [
  '-m', 'PyInstaller',
  '--noconsole',
  '--onefile',
  '--name', 'rajjo_backend',
  '--distpath', distDir,
  '--workpath', buildDir,
  '--clean',
  '--paths', rootDir,
  '--paths', path.join(rootDir, 'backend')
];

for (const hi of hiddenImports) {
  args.push('--hidden-import', hi);
}

// Add copy metadata for packages that rely on entrypoints/metadata
const metadataPackages = ['pydantic', 'keyring', 'langchain', 'langgraph', 'chromadb'];
for (const pkg of metadataPackages) {
  args.push('--copy-metadata', pkg);
}

args.push(entryPoint);

console.log('[Rajjo Packaging] Running PyInstaller build process...');

const child = spawn(pythonCmd, args, {
  cwd: rootDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    PYTHONPATH: `${rootDir}${path.delimiter}${path.join(rootDir, 'backend')}`,
    PYTHONUNBUFFERED: '1'
  }
});

child.on('close', (code) => {
  const binaryPath = path.join(distDir, process.platform === 'win32' ? 'rajjo_backend.exe' : 'rajjo_backend');
  if (code === 0 && fs.existsSync(binaryPath)) {
    const stats = fs.statSync(binaryPath);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`\n✅ [Rajjo Packaging] Standalone backend executable built successfully!`);
    console.log(`   Location: ${binaryPath}`);
    console.log(`   Size: ${sizeMb} MB\n`);
  } else {
    console.error(`\n❌ [Rajjo Packaging] PyInstaller exited with code ${code}`);
  }
  process.exit(code || 0);
});

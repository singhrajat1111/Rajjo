const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');
const backendDir = path.join(rootDir, 'backend');
const isWin = process.platform === 'win32';

console.log('\n========================================');
console.log('   🚀 Rajjo Setup & Dependency Installer');
console.log('========================================\n');

function runCommand(title, commandStr, cwd) {
  console.log(`\n▶ [Step] ${title}...`);
  const res = spawnSync(commandStr, {
    cwd,
    stdio: 'inherit',
    shell: true,
    env: process.env
  });
  if (res.status !== 0) {
    console.error(`\n❌ Failed at: ${title}`);
    process.exit(res.status || 1);
  }
}

// 1. Check or copy .env file
const envFile = path.join(rootDir, '.env');
const envExample = path.join(rootDir, '.env.example');
if (!fs.existsSync(envFile) && fs.existsSync(envExample)) {
  fs.copyFileSync(envExample, envFile);
  console.log('✅ Created .env from template .env.example');
}

// 2. Install Root NPM packages if needed
if (!fs.existsSync(path.join(rootDir, 'node_modules'))) {
  runCommand('Installing Root NPM dependencies', 'npm install', rootDir);
} else {
  console.log('✅ Root node_modules already installed.');
}

// 2b. Verify Electron binary is properly extracted
const electronDir = path.join(rootDir, 'node_modules', 'electron');
if (fs.existsSync(electronDir)) {
  let electronValid = false;
  try {
    require(electronDir);
    electronValid = true;
  } catch (_) {}

  if (!electronValid) {
    console.log('\n▶ [Step] Repairing Electron binary installation...');
    const electronInstallScript = path.join(electronDir, 'install.js');
    if (fs.existsSync(electronInstallScript)) {
      runCommand('Downloading/Extracting Electron binary', `node "${electronInstallScript}"`, rootDir);
    }
  } else {
    console.log('✅ Electron binary verified.');
  }
}

// 3. Install Frontend NPM packages
if (!fs.existsSync(path.join(frontendDir, 'node_modules'))) {
  runCommand('Installing Frontend React dependencies', 'npm install', frontendDir);
} else {
  console.log('✅ Frontend node_modules already installed.');
}

// 4. Setup Python Virtual Environment
function getBestPythonCommand() {
  const candidates = [];

  // Check uv installed pythons (common on Windows)
  if (isWin && process.env.APPDATA) {
    const uvPythonDir = path.join(process.env.APPDATA, 'uv', 'python');
    if (fs.existsSync(uvPythonDir)) {
      try {
        const dirs = fs.readdirSync(uvPythonDir);
        for (const target of ['cpython-3.12', 'cpython-3.11', 'cpython-3.13', 'cpython-3.10', 'cpython-3.14']) {
          const match = dirs.find(d => d.startsWith(target));
          if (match) {
            const pyPath = path.join(uvPythonDir, match, 'python.exe');
            if (fs.existsSync(pyPath)) {
              candidates.push(`"${pyPath}"`);
            }
          }
        }
      } catch (_) {}
    }
  }

  // Windows Python Launcher candidates
  if (isWin) {
    candidates.push('py -3.12', 'py -3.11', 'py -3.13', 'py -3.10', 'py -3.14', 'py -3');
  }

  // Standard commands
  candidates.push(isWin ? 'python' : 'python3');
  if (isWin) candidates.push('python3');

  for (const cmd of candidates) {
    try {
      const res = spawnSync(`${cmd} -c "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}')"`, {
        shell: true,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      if (res.status === 0 && res.stdout) {
        const parts = res.stdout.trim().split('.').map(Number);
        if (parts.length >= 2) {
          const [major, minor] = parts;
          // Prefer Python 3.10 to 3.14 where pre-built binary wheels exist for ML/C-extensions
          if (major === 3 && minor >= 10 && minor <= 14) {
            console.log(`ℹ️ Selected compatible Python interpreter (${major}.${minor}): ${cmd}`);
            return cmd;
          }
        }
      }
    } catch (_) {}
  }

  return isWin ? 'python' : 'python3';
}

const venvDir = path.join(backendDir, 'venv');
const venvPython = isWin
  ? path.join(venvDir, 'Scripts', 'python.exe')
  : path.join(venvDir, 'bin', 'python');

if (!fs.existsSync(venvPython)) {
  console.log('\n▶ [Step] Creating Python virtual environment in backend/venv...');
  const pythonCmd = getBestPythonCommand();
  runCommand('Creating virtual environment', `${pythonCmd} -m venv venv`, backendDir);
  console.log('✅ Virtual environment created at backend/venv');
} else {
  try {
    const venvVerCheck = spawnSync(`"${venvPython}" -c "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}')"`, {
      shell: true,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    if (venvVerCheck.status === 0 && venvVerCheck.stdout) {
      console.log(`✅ Python virtual environment already exists at backend/venv (Python ${venvVerCheck.stdout.trim()}).`);
    } else {
      console.log('✅ Python virtual environment already exists at backend/venv.');
    }
  } catch (_) {
    console.log('✅ Python virtual environment already exists at backend/venv.');
  }
}

// 5. Upgrade pip & Install Backend requirements.txt
const quotedPython = `"${venvPython}"`;
runCommand('Upgrading pip in virtual environment', `${quotedPython} -m pip install --upgrade pip`, backendDir);

console.log('\n▶ [Step] Installing Python dependencies from requirements.txt...');
const installRes = spawnSync(`${quotedPython} -m pip install -r requirements.txt`, {
  cwd: backendDir,
  stdio: 'inherit',
  shell: true,
  env: process.env
});

if (installRes.status !== 0) {
  console.warn('\n⚠️ Direct pip install encountered a warning/error (often due to optional llama-cpp-python or missing precompiled wheels on non-wheel Python versions).');
  console.log('Attempting resilient installation of core dependencies...');
  const coreDeps = [
    'fastapi', 'uvicorn', 'langgraph', 'langchain', 'langchain-openai',
    'langchain-community', 'pydantic', 'python-dotenv', 'duckduckgo-search',
    'playwright', 'chromadb', 'httpx', 'aiofiles', 'keyring', 'pytest'
  ].join(' ');
  const coreRes = spawnSync(`${quotedPython} -m pip install ${coreDeps}`, {
    cwd: backendDir,
    stdio: 'inherit',
    shell: true,
    env: process.env
  });
  if (coreRes.status !== 0) {
    console.error('\n❌ Failed to install core backend dependencies.');
    console.error('💡 Tip: Ensure you are using Python 3.10-3.14 (where precompiled binary wheels for C extensions like zstandard and chromadb are available on Windows) or install Microsoft C++ Build Tools.');
    process.exit(coreRes.status || 1);
  }
  console.log('✅ Core dependencies successfully installed! (Note: Direct GGUF engine is optional and requires C++ build tools on some platforms).');
} else {
  console.log('✅ Python dependencies installed successfully.');
}

// 6. Install Playwright Chromium browser binary
console.log('\n▶ [Step] Installing Playwright Chromium browser binary...');
try {
  runCommand('Installing Playwright Chromium', `${quotedPython} -m playwright install chromium`, backendDir);
  console.log('✅ Playwright Chromium browser installed successfully.');
} catch (e) {
  console.warn('⚠️ Playwright install chromium notice:', e.message);
}

console.log('\n======================================================');
console.log('🎉 Setup Complete! You can now start Rajjo:');
console.log('');
console.log('    npm run dev');
console.log('');
console.log('This will start the Backend, Frontend, and Electron app.');
console.log('======================================================\n');

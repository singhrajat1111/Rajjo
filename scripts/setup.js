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

// 3. Install Frontend NPM packages
if (!fs.existsSync(path.join(frontendDir, 'node_modules'))) {
  runCommand('Installing Frontend React dependencies', 'npm install', frontendDir);
} else {
  console.log('✅ Frontend node_modules already installed.');
}

// 4. Setup Python Virtual Environment
const venvDir = path.join(backendDir, 'venv');
const venvPython = isWin
  ? path.join(venvDir, 'Scripts', 'python.exe')
  : path.join(venvDir, 'bin', 'python');

if (!fs.existsSync(venvPython)) {
  console.log('\n▶ [Step] Creating Python virtual environment in backend/venv...');
  const pythonCmd = isWin ? 'python' : 'python3';
  runCommand('Creating virtual environment', `${pythonCmd} -m venv venv`, backendDir);
  console.log('✅ Virtual environment created at backend/venv');
} else {
  console.log('✅ Python virtual environment already exists at backend/venv.');
}

// 5. Upgrade pip & Install Backend requirements.txt
const quotedPython = `"${venvPython}"`;
runCommand('Upgrading pip in virtual environment', `${quotedPython} -m pip install --upgrade pip`, backendDir);
runCommand('Installing Python dependencies from requirements.txt', `${quotedPython} -m pip install -r requirements.txt`, backendDir);

console.log('\n======================================================');
console.log('🎉 Setup Complete! You can now start Rajjo:');
console.log('');
console.log('    npm run dev');
console.log('');
console.log('This will start the Backend, Frontend, and Electron app.');
console.log('======================================================\n');

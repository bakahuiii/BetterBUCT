// Start the mobile web dev server
// Usage: node scripts/dev.mjs
import { spawn } from 'node:child_process';
const app = new URL('../app/', import.meta.url).pathname;
const child = spawn('npm.cmd', ['run', 'dev'], { cwd: app, stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 1));

// Build the mobile web bundle
// Usage: node scripts/build.mjs
import { spawn } from 'node:child_process';
const app = new URL('../app/', import.meta.url).pathname;
const child = spawn('npm.cmd', ['run', 'build'], { cwd: app, stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 1));

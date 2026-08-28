// Sync desktop THEIA src/ and core/ into THEIA-app (build-copy reuse).
// Usage: node scripts/sync-desktop.mjs
// Copies desktop src/ -> app/src and desktop core/ -> core/ without touching
// the desktop source. Mobile-only additions under app/src/mobile are preserved.
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const desktop = process.env.THEIA_DESKTOP || join(root, '..', 'THEIA');
const srcFrom = join(desktop, 'src');
const srcTo = join(root, 'app', 'src');
const coreFrom = join(desktop, 'core');
const coreTo = join(root, 'core');

if (!existsSync(srcFrom)) {
  console.error('Desktop THEIA src not found at', srcFrom, '(set THEIA_DESKTOP to its path)');
  process.exit(1);
}

// Remove desktop files from app/src but keep the mobile/ overlay
for (const entry of readdirSync(srcTo)) {
  if (entry === 'mobile') continue;
  rmSync(join(srcTo, entry), { recursive: true, force: true });
}
cpSync(srcFrom, srcTo, { recursive: true });

rmSync(coreTo, { recursive: true, force: true });
cpSync(coreFrom, coreTo, { recursive: true });

console.log('Synced src ->', srcTo);
console.log('Synced core ->', coreTo);

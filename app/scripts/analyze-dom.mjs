import { readFileSync } from 'node:fs';
const c = readFileSync('H:/work/THEIA-app/ui-dom.html', 'utf8');
const ms = [...c.matchAll(/class="([^"]+)"/g)];
const set = new Set();
for (const m of ms) for (const cls of m[1].split(/\s+/)) if (cls) set.add(cls);
console.log('total classes:', set.size);
console.log([...set].sort().join('\n'));

// Minimal browser polyfill for node:path (used by store.mjs etc.)
export function dirname(p) { return p.replace(/[^/]+$/, '').replace(/[\/]$/, '') || '.'; }
export function relative(from, to) { const f = from.replace(/[\/]/g, '/'); const t = to.replace(/[\/]/g, '/'); return t.startsWith(f) ? t.slice(f.length + 1) || '.' : '.'; }
export function resolve(...parts) { return parts.join('/').replace(/[\/]+/g, '/'); }
export function isAbsolute(p) { return /^[\/]|[a-zA-Z]:[\/]/.test(p); }
export function basename(p, ext) { const b = p.replace(/[\/]$/, '').split(/[\/]/).pop(); return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b; }
export function extname(p) { const b = basename(p); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; }
export function sep() { return '/'; }
export default { dirname, relative, resolve, isAbsolute, basename, extname, sep };

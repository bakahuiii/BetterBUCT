// Browser polyfill for node:fs and node:fs/promises (stubs — core modules using
// these are not meant to run in the WebView; they are on the desktop-only path).
export async function readFile() { throw new Error('fs.readFile is not available in the mobile WebView'); }
export async function writeFile() { throw new Error('fs.writeFile is not available in the mobile WebView'); }
export async function mkdir() { throw new Error('fs.mkdir is not available in the mobile WebView'); }
export async function readdir() { throw new Error('fs.readdir is not available in the mobile WebView'); }
export async function stat() { throw new Error('fs.stat is not available in the mobile WebView'); }
export async function rm() { throw new Error('fs.rm is not available in the mobile WebView'); }
export async function copyFile() { throw new Error('fs.copyFile is not available in the mobile WebView'); }
export async function rename() { throw new Error('fs.rename is not available in the mobile WebView'); }
export async function open() { throw new Error('fs.open is not available in the mobile WebView'); }
export async function lstat() { throw new Error('fs.lstat is not available in the mobile WebView'); }
export function existsSync() { return false; }
export default { readFile, writeFile, mkdir, readdir, stat, rm, copyFile, rename, open, lstat, existsSync };

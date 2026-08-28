// localStorage-backed virtual filesystem for the mobile sharded store.
// Used in web previews and as a dev fallback; the Capacitor Filesystem
// backend replaces it inside the native app.
const PREFIX = 'theia-mobile/v1/';

export function createWebStorageBackend({ prefix = PREFIX, storage = globalThis.localStorage } = {}) {
  const keys = (path) => prefix + path.replace(/^\/+/u, '');
  return {
    name: 'web-storage',
    async readFile(path) {
      const raw = storage.getItem(keys(path));
      if (raw === null) {
        const error = new Error(`ENOENT: no such file '${path}'`);
        error.code = 'ENOENT';
        throw error;
      }
      return raw;
    },
    async writeFile(path, content) {
      storage.setItem(keys(path), content);
    },
    async exists(path) {
      return storage.getItem(keys(path)) !== null;
    },
    async mkdir() {
      // localStorage has no directories; no-op.
    },
    async listFiles(dir) {
      const results = [];
      const root = keys(dir);
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && key.startsWith(root)) results.push(key.slice(prefix.length));
      }
      return results;
    },
    async removeFile(path) {
      storage.removeItem(keys(path));
    },
  };
}

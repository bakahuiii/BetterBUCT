// Capacitor Filesystem backend for the mobile sharded store.
// Writes into the app-private data directory so data survives restarts and
// is not exposed to other apps or to exports/logs.
// NOTE: @capacitor/filesystem mkdir THROWS when the target already exists
// (even with recursive:true), so every mkdir is wrapped in a tolerant helper.
import { Filesystem, Directory } from '@capacitor/filesystem';

const DATA_ROOT = 'theia/data';

export function createCapacitorFilesystemBackend({ directory = Directory.Data, basePath = DATA_ROOT } = {}) {
  const path = (p) => basePath + '/' + String(p).replace(/^\/+/u, '').replace(/\\/gu, '/');

  // Tolerate "already exists" — Capacitor throws instead of being a no-op.
  async function ensureDir(p) {
    try {
      await Filesystem.mkdir({ path: p, directory, recursive: true });
    } catch (error) {
      const message = String(error?.message || error || '');
      if (/already exists|EEXIST|exist/i.test(message)) {
        // Directory exists — exactly what we wanted.
        return;
      }
      // Re-check existence: if it now exists, treat as success.
      try {
        await Filesystem.stat({ path: p, directory });
        return;
      } catch {
        throw error;
      }
    }
  }

  return {
    name: 'capacitor-filesystem',
    async readFile(p) {
      const result = await Filesystem.readFile({ path: path(p), directory });
      return result.data;
    },
    async writeFile(p, content) {
      const parts = String(p).split('/');
      const dir = parts.slice(0, -1).join('/');
      const full = path(p);
      const base = path('');
      await ensureDir(base);
      if (dir) await ensureDir(path(dir));
      await Filesystem.writeFile({ path: full, directory, data: content });
    },
    async exists(p) {
      try {
        await Filesystem.stat({ path: path(p), directory });
        return true;
      } catch {
        return false;
      }
    },
    async mkdir(p) {
      await ensureDir(path(p));
    },
    async listFiles(dir) {
      try {
        const result = await Filesystem.readdir({ path: path(dir), directory });
        return result.files.map((f) => dir + '/' + f.name);
      } catch {
        return [];
      }
    },
    async removeFile(p) {
      try {
        await Filesystem.deleteFile({ path: path(p), directory });
      } catch {
        // Ignore missing files
      }
    },
  };
}

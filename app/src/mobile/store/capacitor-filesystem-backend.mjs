// Capacitor Filesystem backend for the mobile sharded store.
// Writes into the app-private data directory so data survives restarts and
// is not exposed to other apps or to exports/logs.
import { Filesystem, Directory } from '@capacitor/filesystem';

const DATA_ROOT = 'theia/data';

export function createCapacitorFilesystemBackend({ directory = Directory.Data, basePath = DATA_ROOT } = {}) {
  const path = (p) => basePath + '/' + String(p).replace(/^\/+/u, '').replace(/\\/gu, '/');
  return {
    name: 'capacitor-filesystem',
    async readFile(p) {
      const result = await Filesystem.readFile({ path: path(p), directory });
      return result.data;
    },
    async writeFile(p, content) {
      await Filesystem.mkdir({ path: basePath, directory, recursive: true });
      const parts = String(p).split('/');
      const dir = parts.slice(0, -1).join('/');
      if (dir) await Filesystem.mkdir({ path: path(dir), directory, recursive: true });
      await Filesystem.writeFile({ path: path(p), directory, data: content });
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
      await Filesystem.mkdir({ path: path(p), directory, recursive: true });
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

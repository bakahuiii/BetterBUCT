// Mobile port of the desktop CampusStore sharded persistence.
// Keeps the exact theia-sharded-store/v1 + theia-state-fragment/v1 schema so
// data can be interchanged with the desktop THEIA via data packages.
import {
  SHARDED_STORE_SCHEMA,
  STORE_FRAGMENT_SCHEMA,
  splitStateIntoFragments,
  mergeFragmentsIntoState,
  digest,
  generateRevision,
} from './sharded-store-schema.mjs';

const MANIFEST_PATH = 'manifest.json';
const MANIFEST_BACKUP_PATH = 'manifest.json.bak';

export class MobileStore {
  constructor(backend, { dataPath = 'data' } = {}) {
    this.backend = backend;
    this.dataPath = dataPath;
    this.state = null;
    this.activeManifest = null;
    this.loaded = false;
    this.loadPromise = null;
    this.listeners = new Set();
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load() {
    if (this.loaded) return this.state;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.loadFromBackend().finally(() => { this.loadPromise = null; });
    return this.loadPromise;
  }

  async loadFromBackend() {
    const backend = this.backend;
    let manifest = null;
    let manifestBackup = null;

    // Read manifest, fall back to backup
    try {
      manifest = JSON.parse(await backend.readFile(this.path(MANIFEST_PATH)));
    } catch (error) {
      try {
        manifestBackup = JSON.parse(await backend.readFile(this.path(MANIFEST_BACKUP_PATH)));
      } catch {
        // no manifest at all
      }
    }
    const selected = manifest || manifestBackup;
    if (selected && selected.schema !== SHARDED_STORE_SCHEMA) {
      throw new Error('移动端数据清单格式不受支持');
    }

    if (!selected) {
      // Fresh store: return empty state; caller seeds mock/import data
      this.state = null;
      this.loaded = true;
      return this.state;
    }

    // Recover fragments (try primary then backup references)
    const fragments = new Map();
    const missing = [];
    const fragmentKeys = new Set(Object.keys(selected.fragments || {}));
    if (manifestBackup) {
      for (const key of Object.keys(manifestBackup.fragments || {})) {
        fragmentKeys.add(key);
      }
    }
    for (const key of fragmentKeys) {
      let restored = null;
      for (const candidate of [selected, manifestBackup]) {
        const reference = candidate?.fragments?.[key];
        if (!reference) continue;
        try {
          restored = await this.readFragment(key, reference);
          if (restored !== null) break;
        } catch {
          // try next candidate
        }
      }
      if (restored === null) missing.push(key);
      else fragments.set(key, restored);
    }
    if (missing.length) {
      // Non-fatal: keep partial state but record recovery info. Desktop
      // rejects, but mobile keeps serving whatever remains valid.
      console.warn('[theia-mobile] missing fragments:', missing.join(', '));
    }

    const state = mergeFragmentsIntoState(fragments);
    this.state = state;
    this.activeManifest = selected;
    this.loaded = true;
    this.notify(state);
    return state;
  }

  async readFragment(key, reference) {
    const relativePath = String(reference?.path || '');
    if (!relativePath) throw new Error('invalid fragment reference');
    const raw = await this.backend.readFile(this.path(relativePath));
    const fragment = JSON.parse(raw);
    const valueDigest = await digest(fragment?.value);
    if (fragment?.schema !== STORE_FRAGMENT_SCHEMA || fragment?.kind !== key || valueDigest !== reference?.digest) {
      throw new Error('fragment integrity check failed: ' + key);
    }
    return fragment.value;
  }

  path(p) {
    return this.dataPath + '/' + String(p).replace(/^\/+/u, '');
  }

  async save(state) {
    if (!state) return;
    const fragments = splitStateIntoFragments(state);
    const references = {};
    for (const [kind, value] of fragments) {
      const valueDigest = await digest(value);
      const path = 'objects/' + kind + '/' + valueDigest + '.json';
      const exists = await this.backend.exists(this.path(path));
      if (!exists) {
        const fragment = {
          schema: STORE_FRAGMENT_SCHEMA,
          kind,
          digest: valueDigest,
          writtenAt: new Date().toISOString(),
          value,
        };
        await this.backend.writeFile(this.path(path), JSON.stringify(fragment));
      }
      references[kind] = { path, digest: valueDigest };
    }
    const manifest = {
      schema: SHARDED_STORE_SCHEMA,
      revision: generateRevision(),
      createdAt: state.createdAt || new Date().toISOString(),
      updatedAt: state.updatedAt || new Date().toISOString(),
      fragments: references,
      platform: 'mobile',
      appVersion: state.appVersion || null,
    };
    // Keep previous manifest as backup
    const previousExists = await this.backend.exists(this.path(MANIFEST_PATH));
    if (previousExists) {
      try {
        const previous = await this.backend.readFile(this.path(MANIFEST_PATH));
        await this.backend.writeFile(this.path(MANIFEST_BACKUP_PATH), previous);
      } catch { /* ignore */ }
    }
    await this.backend.writeFile(this.path(MANIFEST_PATH), JSON.stringify(manifest, null, 2));
    this.activeManifest = manifest;
    this.state = state;
    this.notify(state);
    return state;
  }

  snapshot() {
    return this.state ? structuredClone(this.state) : null;
  }

  storageSummary() {
    return {
      schema: SHARDED_STORE_SCHEMA,
      backend: this.backend.name,
      updatedAt: this.activeManifest?.updatedAt || null,
      revision: this.activeManifest?.revision || null,
      fragments: Object.keys(this.activeManifest?.fragments || {}).sort(),
    };
  }

  async exportManifestJson() {
    if (!this.activeManifest) return null;
    return JSON.stringify(this.activeManifest, null, 2);
  }

  notify(state) {
    const snapshot = structuredClone(state);
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch { /* listener errors are non-fatal */ }
    }
  }

  async reset() {
    this.state = null;
    this.activeManifest = null;
    this.loaded = false;
  }
}

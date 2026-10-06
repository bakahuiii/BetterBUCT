// TheiaVault: native values are encrypted by a dedicated Android Keystore
// AES-GCM key. The browser preview uses local-only obfuscation for development
// and explicitly does not claim device-grade credential protection.
import { registerPlugin } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const RegisteredTheiaVault = registerPlugin('TheiaVault');

const WEB_PREFIX = 'theia-mobile/vault/v1/';
const NATIVE_PREFIX = 'theia-vault:';
const ENTRY_SCHEMA = 'theia-secure-vault-entry/v1';

function isNative() {
  try {
    return Boolean(window.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

function nativeVaultPlugin() {
  try {
    return window.Capacitor?.Plugins?.TheiaVault || RegisteredTheiaVault || null;
  } catch {
    return null;
  }
}

function obfuscate(value) {
  try {
    const encoded = new TextEncoder().encode(value);
    return btoa(String.fromCharCode(...encoded));
  } catch {
    return '';
  }
}

function deobfuscate(value) {
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function encodeEntry(value) {
  return JSON.stringify({ schema: ENTRY_SCHEMA, value });
}

function decodeEntry(serialized) {
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    // Legacy string secrets (for example a model API key) were stored as raw text.
    return serialized;
  }
  if (parsed && parsed.schema === ENTRY_SCHEMA && Object.hasOwn(parsed, 'value')) {
    return parsed.value;
  }
  // Legacy entries encoded an object as JSON text or a string as raw text.
  return parsed;
}

export class VaultService {
  constructor({ storage = globalThis.localStorage, preferences = Preferences, plugin = null } = {}) {
    this.storage = storage;
    this.preferences = preferences;
    this.pluginOverride = plugin;
    this.native = isNative();
  }

  isAvailable() {
    if (!this.native) return Boolean(this.storage);
    return Boolean(this.pluginOverride || nativeVaultPlugin());
  }

  _nativePlugin() {
    return this.pluginOverride || nativeVaultPlugin();
  }

  async setSecret(key, value) {
    const serialized = encodeEntry(value);
    if (this.native) {
      const plugin = this._nativePlugin();
      if (!plugin?.set) throw new Error('Android Keystore 安全存储不可用，凭据未保存');
      await plugin.set({ key: String(key), value: serialized });
      return;
    }
    this.storage.setItem(WEB_PREFIX + key, obfuscate(serialized));
  }

  async _readLegacyNativeSecret(key) {
    try {
      const result = await this.preferences.get({ key: NATIVE_PREFIX + key });
      if (!result?.value) return null;
      const legacy = deobfuscate(result.value);
      if (legacy === null) return null;
      return { value: decodeEntry(legacy), legacyRecord: true };
    } catch {
      return null;
    }
  }

  async getSecret(key) {
    if (this.native) {
      const plugin = this._nativePlugin();
      if (!plugin?.get) throw new Error('Android Keystore 安全存储不可用');
      const result = await plugin.get({ key: String(key) });
      if (result?.exists && typeof result.value === 'string') return decodeEntry(result.value);

      // One-time upgrade path for prior Android versions, which put base64-
      // obfuscated (not encrypted) strings in Capacitor Preferences.
      const legacy = await this._readLegacyNativeSecret(key);
      if (!legacy) return null;
      await plugin.set({ key: String(key), value: encodeEntry(legacy.value) });
      await this.preferences.remove({ key: NATIVE_PREFIX + key });
      return legacy.value;
    }
    const raw = this.storage.getItem(WEB_PREFIX + key);
    if (!raw) return null;
    const decoded = deobfuscate(raw);
    return decoded === null ? null : decodeEntry(decoded);
  }

  async removeSecret(key) {
    if (this.native) {
      const plugin = this._nativePlugin();
      if (!plugin?.remove) throw new Error('Android Keystore 安全存储不可用');
      await plugin.remove({ key: String(key) });
      // Also remove any not-yet-migrated legacy value.
      try { await this.preferences.remove({ key: NATIVE_PREFIX + key }); } catch { /* legacy slot may not exist */ }
      return;
    }
    this.storage.removeItem(WEB_PREFIX + key);
  }

  async hasSecret(key) {
    return (await this.getSecret(key)) !== null;
  }

  async clearAll() {
    if (this.native) {
      const plugin = this._nativePlugin();
      if (!plugin?.keys || !plugin?.remove) throw new Error('Android Keystore 安全存储不可用');
      const { keys } = await plugin.keys();
      for (const key of keys || []) await plugin.remove({ key });
      return;
    }
    const removals = [];
    for (let i = 0; i < this.storage.length; i += 1) {
      const key = this.storage.key(i);
      if (key && key.startsWith(WEB_PREFIX)) removals.push(key);
    }
    for (const key of removals) this.storage.removeItem(key);
  }
}

export const VAULT_KEYS = {
  unified: 'unified-credentials',
  academicApi: 'academic-api-credentials',
  mail: 'mail-credentials',
  modelApiKey: 'model-api-key',
};

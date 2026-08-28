// TheiaVault — credentials stored outside ordinary data, logs and exports.
// Web preview: localStorage (obfuscated). Native: Capacitor Preferences
// (Android EncryptedSharedPreferences upgrade path in the native plugin).
import { Preferences } from '@capacitor/preferences';

const WEB_PREFIX = 'theia-mobile/vault/v1/';

function isNative() {
  try {
    return Boolean(window.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

function obfuscate(value) {
  // Light obfuscation for the web preview only; native builds use system
  // storage. Never store plaintext credentials in logs/exports.
  try {
    const encoded = new TextEncoder().encode(JSON.stringify(value));
    return btoa(String.fromCharCode(...encoded));
  } catch {
    return '';
  }
}

function deobfuscate(value) {
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export class VaultService {
  constructor({ storage = globalThis.localStorage } = {}) {
    this.storage = storage;
    this.native = isNative();
  }

  async setSecret(key, value) {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (this.native) {
      await Preferences.set({ key: 'theia-vault:' + key, value: obfuscate(serialized) });
    } else {
      this.storage.setItem(WEB_PREFIX + key, obfuscate(serialized));
    }
  }

  async getSecret(key) {
    let raw = null;
    if (this.native) {
      const result = await Preferences.get({ key: 'theia-vault:' + key });
      raw = result.value;
    } else {
      raw = this.storage.getItem(WEB_PREFIX + key);
    }
    if (!raw) return null;
    return deobfuscate(raw);
  }

  async removeSecret(key) {
    if (this.native) {
      await Preferences.remove({ key: 'theia-vault:' + key });
    } else {
      this.storage.removeItem(WEB_PREFIX + key);
    }
  }

  async hasSecret(key) {
    return (await this.getSecret(key)) !== null;
  }

  async clearAll() {
    if (this.native) {
      const { keys } = await Preferences.keys();
      for (const key of keys) {
        if (key.startsWith('theia-vault:')) await Preferences.remove({ key });
      }
    } else {
      const removals = [];
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i);
        if (key && key.startsWith(WEB_PREFIX)) removals.push(key);
      }
      for (const key of removals) this.storage.removeItem(key);
    }
  }
}

export const VAULT_KEYS = {
  unified: 'unified-credentials',
  academicApi: 'academic-api-credentials',
  mail: 'mail-credentials',
  modelApiKey: 'model-api-key',
};

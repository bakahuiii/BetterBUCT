import { test } from 'node:test';
import assert from 'node:assert/strict';

// Load the vault in a native-shaped runtime. The real Android implementation
// is a separate Keystore-backed Capacitor plugin; this test verifies the JS
// contract and that a fresh service instance reads the same persistent slot.
globalThis.window = {
  Capacitor: {
    isNativePlatform: () => true,
    Plugins: {},
  },
};

const { VaultService, VAULT_KEYS } = await import('../src/mobile/vault/vault-service.mjs');

function createNativePlugin() {
  const records = new Map();
  return {
    records,
    async set({ key, value }) { records.set(key, value); },
    async get({ key }) {
      return records.has(key)
        ? { exists: true, value: records.get(key) }
        : { exists: false, value: null };
    },
    async remove({ key }) { records.delete(key); },
    async keys() { return { keys: [...records.keys()] }; },
  };
}

const noLegacyPreferences = {
  async get() { return { value: null }; },
  async remove() {},
};

test('native vault persists credentials through the Keystore plugin contract', async () => {
  const plugin = createNativePlugin();
  const first = new VaultService({ plugin, preferences: noLegacyPreferences });
  await first.setSecret(VAULT_KEYS.unified, {
    username: 'student',
    password: 'secret',
    savedAt: '2026-09-29T00:00:00.000Z',
  });

  const second = new VaultService({ plugin, preferences: noLegacyPreferences });
  assert.deepEqual(await second.getSecret(VAULT_KEYS.unified), {
    username: 'student',
    password: 'secret',
    savedAt: '2026-09-29T00:00:00.000Z',
  });
  assert.equal(await second.hasSecret(VAULT_KEYS.unified), true);

  await second.removeSecret(VAULT_KEYS.unified);
  assert.equal(await first.getSecret(VAULT_KEYS.unified), null);
});

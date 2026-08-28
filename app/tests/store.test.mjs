// Stage-0 smoke test: mobile sharded store read/write round-trip.
// Run: node --test tests/store.test.mjs  (from app/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MobileStore } from '../src/mobile/store/mobile-store.mjs';
import { createWebStorageBackend } from '../src/mobile/store/web-storage-backend.mjs';
import { createMockState } from '../src/mobile/mock/mock-data.mjs';

// localStorage shim for Node
function createLocalStorageShim() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key(i) { return [...map.keys()][i] ?? null; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    clear() { map.clear(); },
  };
}

test('store saves and reloads sharded state', async () => {
  const storage = createLocalStorageShim();
  const backend = createWebStorageBackend({ storage });
  const store = new MobileStore(backend);

  // Fresh store has no state
  assert.equal(await store.load(), null);

  // Seed with mock data
  const seed = createMockState();
  assert.ok(seed.schedule.length > 0, 'mock schedule present');
  assert.ok(seed.grades.length > 0, 'mock grades present');
  await store.save(seed);

  const summary = store.storageSummary();
  assert.equal(summary.schema, 'theia-sharded-store/v1');
  assert.ok(summary.fragments.length >= 10, 'has sharded fragments: ' + summary.fragments.join(','));
  assert.ok(summary.revision, 'has revision');

  // Reload from the same backend (fresh store instance)
  const store2 = new MobileStore(backend);
  const reloaded = await store2.load();
  assert.ok(reloaded, 'reloaded state');
  assert.equal(reloaded.schedule.length, seed.schedule.length);
  assert.equal(reloaded.grades.length, seed.grades.length);
  assert.deepEqual(reloaded.courses, seed.courses);
  assert.equal(reloaded.profile.studentId, seed.profile.studentId);
});

test('store survives manifest backup recovery', async () => {
  const storage = createLocalStorageShim();
  const backend = createWebStorageBackend({ storage });
  const store = new MobileStore(backend);
  // Save twice so a backup manifest exists
  await store.save(createMockState());
  await store.save(createMockState());
  assert.ok(storage.getItem('theia-mobile/v1/data/manifest.json.bak'), 'backup manifest exists');

  // Corrupt the primary manifest by overwriting it with garbage
  storage.setItem('theia-mobile/v1/data/manifest.json', '{broken json');

  // Reload should fall back to the backup manifest
  const store2 = new MobileStore(backend);
  const reloaded = await store2.load();
  assert.ok(reloaded, 'recovered from backup');
  assert.ok(reloaded.schedule.length > 0);
});

test('feed export produces theia-campus-feed/v1', async () => {
  const { toTheiaFeed } = await import('../src/mobile/feed.mjs');
  const feed = toTheiaFeed(createMockState());
  assert.equal(feed.schema, 'theia-campus-feed/v1');
  assert.ok(feed.events.length > 0, 'has calendar events');
  assert.equal(feed.profile.studentId, '2026000000');
});

test('ics export produces calendar file', async () => {
  const { toIcs } = await import('../src/mobile/feed.mjs');
  const ics = toIcs(createMockState());
  assert.ok(ics.startsWith('BEGIN:VCALENDAR'));
  assert.ok(ics.includes('END:VCALENDAR'));
  assert.ok(ics.includes('BEGIN:VEVENT'));
});

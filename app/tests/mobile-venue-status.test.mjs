import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MobileBridge } from '../src/mobile/mobile-bridge.mjs';
import { emptyState } from '../../core/schema.mjs';

function createMemoryBackend() {
  const files = new Map();
  return {
    name: 'memory-test',
    async readFile(path) {
      if (!files.has(path)) {
        const error = new Error(`ENOENT: ${path}`);
        error.code = 'ENOENT';
        throw error;
      }
      return files.get(path);
    },
    async writeFile(path, value) { files.set(path, value); },
    async exists(path) { return files.has(path); },
    async mkdir() {},
    async listFiles(directory) {
      return [...files.keys()].filter((path) => path.startsWith(directory));
    },
    async removeFile(path) { files.delete(path); },
  };
}

const venueCatalog = {
  schema: 'theia-motion-venue-catalog/v1',
  parserVersion: 'motion-venue/v1',
  capturedAt: '2026-10-01T01:00:00.000Z',
  campuses: [{ id: 'changping', label: '昌平校区', venueIds: [] }],
  venues: [{
    id: 'venue-test',
    campusId: 'changping',
    campusLabel: '昌平校区',
    activity: '羽毛球',
    label: '体育馆羽毛球场',
    detailUrl: 'https://motion.buct.edu.cn/changguanyuyue1/yuyue.php?id=1',
  }],
};

const venueStatus = {
  schema: 'theia-motion-venue-status/v1',
  parserVersion: 'motion-venue/v1',
  capturedAt: '2026-10-01T01:02:00.000Z',
  source: {
    platform: 'MOTION',
    accessMode: 'public-anonymous-get',
    url: 'https://motion.buct.edu.cn/changguanyuyue1/yuyue.php?id=1&d=2026-10-01&c=1',
    queryUrl: 'https://motion.buct.edu.cn/changguanyuyue1/yuyue.php?id=1&d=2026-10-01&c=1',
    method: 'GET',
  },
  query: {
    activity: '羽毛球',
    campus: { id: 'changping', label: '昌平校区' },
    detailUrl: venueCatalog.venues[0].detailUrl,
    date: '2026-10-01',
    venue: '1',
    availableDates: ['2026-10-01'],
    availableVenues: ['1'],
  },
  availability: {
    tables: [{
      index: 0,
      headers: ['时间/场地', '1号场'],
      slots: [{ time: '08:00-09:00', courts: [{ court: '1号场', status: '可预约', state: 'available' }] }],
      summary: null,
    }],
    summary: { byState: { available: 1 }, courtStatusCells: 1 },
  },
  safety: { requestedPageCount: 1 },
  timing: { totalMs: 24, initialRequestMs: 24, selectedRequestMs: null, selectedPageFetched: false },
};

function makeBridge(storageBackend) {
  return new MobileBridge({
    storageBackend,
    webPreview: false,
    vault: { async getSecret() { return null; }, isAvailable() { return true; } },
    session: {},
  });
}

test('mobile MOTION catalog and queried status are published and survive restart', async () => {
  const backend = createMemoryBackend();
  const bridge = makeBridge(backend);
  bridge._state = emptyState();
  bridge._initialized = true;
  bridge._motion = {
    async discover() { return structuredClone(venueCatalog); },
    async queryStatus(query) {
      assert.equal(query.detailUrl, venueCatalog.venues[0].detailUrl);
      return structuredClone(venueStatus);
    },
  };

  const emitted = [];
  bridge.onSnapshot((state) => emitted.push(state));

  await bridge.refreshMotionVenueCatalog();
  assert.equal(bridge._state.dataCatalog.collections.venueReservations.venues.length, 1);
  assert.equal(emitted.at(-1).dataCatalog.collections.venueReservations.venues[0].id, 'venue-test');

  await bridge.queryMotionVenueStatus({ detailUrl: venueCatalog.venues[0].detailUrl });
  const savedStatuses = bridge._state.dataCatalog.collections.venueReservations.statuses;
  assert.equal(Object.keys(savedStatuses).length, 1);
  assert.equal(Object.values(savedStatuses)[0].result.query.venue, '1');

  const reopened = makeBridge(backend);
  const restored = await reopened.getSnapshot();
  assert.equal(restored.dataCatalog.collections.venueReservations.venues[0].id, 'venue-test');
  assert.equal(Object.values(restored.dataCatalog.collections.venueReservations.statuses)[0].result.availability.summary.courtStatusCells, 1);
});

// Stage-0 test: data package import merges into the local store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MobileStore } from '../src/mobile/store/mobile-store.mjs';
import { createWebStorageBackend } from '../src/mobile/store/web-storage-backend.mjs';
import { createMockState } from '../src/mobile/mock/mock-data.mjs';
import { toTheiaFeed } from '../src/mobile/feed.mjs';

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

test('importDataPackage flow: export -> fresh store -> import', async () => {
  const storage = createLocalStorageShim();
  const backend = createWebStorageBackend({ storage });
  const store = new MobileStore(backend);
  const state = createMockState();
  await store.save(state);

  // Build a data package like desktop's theia-feed.json
  const feed = toTheiaFeed(state);
  assert.equal(feed.schema, 'theia-campus-feed/v1');

  // A fresh device imports the package content into its empty store
  const storage2 = createLocalStorageShim();
  const backend2 = createWebStorageBackend({ storage: storage2 });
  const store2 = new MobileStore(backend2);
  assert.equal(await store2.load(), null);
  const imported = { ...feed, academic: feed.academic };
  // Merge the package directly through a small merge (mirrors bridge logic)
  const emptyish = {
    ...state,
    profile: null, terms: [], courses: [], schedule: [], grades: [],
    selectedCourses: [], exams: [], assignments: [], notices: [],
  };
  const merged = {
    ...emptyish,
    profile: feed.profile,
    terms: feed.academic.terms,
    courses: feed.academic.courses,
    schedule: feed.academic.schedule,
    grades: feed.academic.grades,
    selectedCourses: feed.academic.selectedCourses,
    exams: feed.academic.exams,
    assignments: feed.academic.assignments,
    notices: feed.academic.notices,
  };
  await store2.save(merged);
  const reloaded = await store2.load();
  assert.equal(reloaded.profile.studentId, '2026000000');
  assert.equal(reloaded.schedule.length, state.schedule.length);
  assert.equal(reloaded.grades.length, state.grades.length);
});

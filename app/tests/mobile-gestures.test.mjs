import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  toggle(value, force) {
    const next = force === undefined ? !this.values.has(value) : force;
    if (next) this.values.add(value); else this.values.delete(value);
    return next;
  }
  contains(value) { return this.values.has(value); }
}

class FakeElement {
  constructor() {
    this.listeners = new Map();
    this.style = {};
    this.classList = new FakeClassList();
    this.removed = false;
    this.span = { textContent: '' };
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
  dispatch(type, event = {}) { this.listeners.get(type)?.(event); }
  querySelector(selector) { return selector === 'span' ? this.span : null; }
  remove() { this.removed = true; }
  set innerHTML(_value) {}
}

const root = new FakeElement();
const scroller = new FakeElement();
scroller.scrollTop = 0;
scroller.scrollHeight = 1_000;
scroller.clientHeight = 500;
const settingsScroller = new FakeElement();
settingsScroller.scrollTop = 0;
settingsScroller.scrollHeight = 1_200;
settingsScroller.clientHeight = 0;
const indicators = [];

globalThis.document = {
  documentElement: root,
  body: { prepend(element) { indicators.push(element); } },
  createElement() { return new FakeElement(); },
  querySelector(selector) {
    if (selector === '.settings-mobile-shell') return settingsScroller.clientHeight ? settingsScroller : null;
    return selector === '.workspace' ? scroller : null;
  },
};

const { installPullToRefresh } = await import('../src/mobile/mobile-gestures.mjs');

function touch(clientY, clientX = 20) {
  return { clientY, clientX };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('edge gestures refresh at the top and bottom but not in the middle', async () => {
  let refreshes = 0;
  const cleanup = installPullToRefresh({
    element: root,
    threshold: 50,
    onRefresh: async () => { refreshes += 1; },
  });

  root.dispatch('touchstart', { touches: [touch(100)] });
  root.dispatch('touchmove', { touches: [touch(160)] });
  root.dispatch('touchend', { changedTouches: [touch(160)] });
  await settle();
  assert.equal(refreshes, 1);

  scroller.scrollTop = 200;
  root.dispatch('touchstart', { touches: [touch(100)] });
  root.dispatch('touchmove', { touches: [touch(180)] });
  root.dispatch('touchend', { changedTouches: [touch(180)] });
  await settle();
  assert.equal(refreshes, 1, 'a swipe in the middle remains ordinary scrolling');

  scroller.scrollTop = 500;
  root.dispatch('touchstart', { touches: [touch(200)] });
  root.dispatch('touchmove', { touches: [touch(140)] });
  root.dispatch('touchend', { changedTouches: [touch(140)] });
  await settle();
  assert.equal(refreshes, 2, 'pulling upward from the bottom refreshes');

  cleanup();
  assert.equal(indicators[0].removed, true);
});

test('refresh indicators are cleared after a synchronous refresh error and touch cancellation', async () => {
  const cleanup = installPullToRefresh({
    element: root,
    threshold: 20,
    onRefresh: () => { throw new Error('refresh failed'); },
  });

  scroller.scrollTop = 0;
  root.dispatch('touchstart', { touches: [touch(100)] });
  root.dispatch('touchmove', { touches: [touch(130)] });
  root.dispatch('touchcancel');
  assert.equal(indicators.at(-1).style.display, 'none');

  root.dispatch('touchstart', { touches: [touch(100)] });
  root.dispatch('touchmove', { touches: [touch(130)] });
  root.dispatch('touchend', { changedTouches: [touch(130)] });
  await settle();
  assert.equal(indicators.at(-1).style.display, 'none');
  cleanup();
});

test('settings page uses its visible scroll owner instead of the hidden workspace', async () => {
  let refreshes = 0;
  const cleanup = installPullToRefresh({
    element: root,
    threshold: 40,
    onRefresh: async () => { refreshes += 1; },
  });

  // Mobile settings hides .workspace and scrolls .settings-mobile-shell. A
  // normal swipe in the middle of that page must not be mistaken for an edge.
  scroller.clientHeight = 0;
  settingsScroller.clientHeight = 600;
  settingsScroller.scrollTop = 200;
  const settingsTarget = { closest: () => settingsScroller };
  root.dispatch('touchstart', { target: settingsTarget, touches: [touch(400)] });
  root.dispatch('touchmove', { touches: [touch(250)] });
  root.dispatch('touchend', { changedTouches: [touch(250)] });
  await settle();
  assert.equal(refreshes, 0);

  settingsScroller.scrollTop = 600;
  root.dispatch('touchstart', { target: settingsTarget, touches: [touch(400)] });
  root.dispatch('touchmove', { touches: [touch(330)] });
  root.dispatch('touchend', { changedTouches: [touch(330)] });
  await settle();
  assert.equal(refreshes, 1, 'the visible settings scroller still refreshes at its bottom edge');

  cleanup();
  scroller.clientHeight = 500;
  settingsScroller.clientHeight = 0;
});


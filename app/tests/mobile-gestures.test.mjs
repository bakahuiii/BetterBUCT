import { test } from 'node:test';
import assert from 'node:assert/strict';

test('pull-to-refresh compatibility export never installs a gesture handler', async () => {
  const listeners = new Map();
  const element = {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
  };
  const previousDocument = globalThis.document;
  globalThis.document = { documentElement: element };
  try {
    const { installPullToRefresh } = await import('../src/mobile/mobile-gestures.mjs');
    const cleanup = installPullToRefresh({
      element,
      onRefresh: () => { throw new Error('must never be called'); },
    });
    assert.equal(typeof cleanup, 'function');
    assert.equal(listeners.size, 0);
    cleanup();
    assert.equal(listeners.size, 0);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('pull-to-refresh blocker blocks only top-edge single-finger downward drags', async () => {
  const listeners = new Map();
  const documentRef = {
    scrollingElement: { scrollTop: 0 },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
  };
  const scroller = {
    nodeType: 1,
    parentElement: null,
    scrollHeight: 300,
    clientHeight: 100,
    scrollTop: 0,
    closest() { return null; },
  };
  const previousGetComputedStyle = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ overflowY: 'auto' });
  try {
    const { installPullToRefreshBlocker } = await import('../src/mobile/mobile-gestures.mjs');
    const cleanup = installPullToRefreshBlocker(documentRef);
    const fire = (type, detail) => {
      let prevented = false;
      listeners.get(type)({ type, ...detail, preventDefault() { prevented = true; } });
      return prevented;
    };

    const touch = (identifier, clientY, clientX = 10) => ({ identifier, clientY, clientX });
    fire('touchstart', { target: scroller, touches: [touch(1, 10)] });
    assert.equal(fire('touchmove', { touches: [touch(1, 30)] }), true,
      'a downward drag at the top is prevented');

    scroller.scrollTop = 20;
    fire('touchstart', { target: scroller, touches: [touch(2, 10)] });
    assert.equal(fire('touchmove', { touches: [touch(2, 30)] }), false,
      'a scroller with content above remains scrollable');

    scroller.scrollTop = 0;
    fire('touchstart', { target: scroller, touches: [touch(3, 10)] });
    fire('touchstart', { target: scroller, touches: [touch(3, 10), touch(4, 10, 30)] });
    assert.equal(fire('touchmove', { touches: [touch(3, 30), touch(4, 30, 30)] }), false,
      'multi-touch gestures are ignored');
    assert.equal(fire('touchmove', { touches: [touch(3, 40)] }), false,
      'the gesture remains ignored after it becomes single-touch again');

    cleanup();
    assert.equal(listeners.size, 0);
  } finally {
    if (previousGetComputedStyle === undefined) delete globalThis.getComputedStyle;
    else globalThis.getComputedStyle = previousGetComputedStyle;
  }
});

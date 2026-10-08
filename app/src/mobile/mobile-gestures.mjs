// Kept as a compatibility export for older mobile entry points.
// Pull-to-refresh is intentionally disabled; refresh is available from the
// explicit action in the application UI.
export function installPullToRefresh() {
  return () => {};
}

const TOUCH_SLOP_PX = 8;
const SCROLLABLE_OVERFLOW = /^(auto|scroll|overlay)$/;

function isEditableTarget(target) {
  if (!target || typeof target.closest !== 'function') return false;
  return Boolean(target.closest('input, textarea, select, button, [contenteditable="true"]'));
}

function isVerticalScroller(element) {
  if (!element || element.nodeType !== 1) return false;
  const style = globalThis.getComputedStyle?.(element);
  if (!style || !SCROLLABLE_OVERFLOW.test(style.overflowY || '')) return false;
  return element.scrollHeight > element.clientHeight + 1;
}

function canScrollUpFrom(target, documentRef) {
  let element = target && target.nodeType === 1 ? target : null;
  while (element) {
    if (isVerticalScroller(element) && element.scrollTop > 0.5) return true;
    element = element.parentElement;
  }

  const scrollingElement = documentRef?.scrollingElement;
  if (scrollingElement?.scrollTop > 0.5) return true;
  return Number(globalThis.scrollY || 0) > 0.5;
}

function touchForEvent(event, identifier) {
  const touches = event?.touches || [];
  return Array.from(touches).find((touch) => touch.identifier === identifier) || null;
}

/**
 * Stop the Android/WebView edge refresh gesture at the actual DOM scroll
 * owner. CSS overscroll-behavior is not honored consistently by all WebView
 * versions, so this is deliberately a narrow capture-phase fallback.
 */
export function installPullToRefreshBlocker(documentRef = globalThis.document) {
  if (!documentRef?.addEventListener) return () => {};

  let gesture = null;
  const onTouchStart = (event) => {
    const touches = event?.touches || [];
    if (touches.length > 1) {
      if (gesture) gesture.ignored = true;
      return;
    }
    const touch = event?.touches?.[0];
    if (!touch) return;
    gesture = {
      identifier: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
      target: event.target,
      ignored: isEditableTarget(event.target),
    };
  };

  const onTouchMove = (event) => {
    if (!gesture || gesture.ignored) return;
    if ((event?.touches || []).length !== 1) {
      gesture.ignored = true;
      return;
    }
    const touch = touchForEvent(event, gesture.identifier);
    if (!touch) return;
    const dx = touch.clientX - gesture.startX;
    const dy = touch.clientY - gesture.startY;
    if (Math.abs(dy) < TOUCH_SLOP_PX || Math.abs(dx) >= Math.abs(dy) || dy <= 0) return;

    // Let a nested or outer scroll owner consume the drag while it still has
    // content above the viewport. Only block the edge gesture when the whole
    // vertical scroll chain is already at its top boundary.
    if (canScrollUpFrom(gesture.target, documentRef)) return;
    event.preventDefault?.();
  };

  const reset = (event) => {
    if (event?.type === 'touchcancel' || !(event?.touches || []).length) {
      gesture = null;
      return;
    }
    if (gesture && Array.from(event?.changedTouches || []).some((touch) => touch.identifier === gesture.identifier)) {
      gesture = null;
    }
  };
  const options = { capture: true, passive: false };
  documentRef.addEventListener('touchstart', onTouchStart, options);
  documentRef.addEventListener('touchmove', onTouchMove, options);
  documentRef.addEventListener('touchend', reset, { capture: true });
  documentRef.addEventListener('touchcancel', reset, { capture: true });

  return () => {
    documentRef.removeEventListener('touchstart', onTouchStart, options);
    documentRef.removeEventListener('touchmove', onTouchMove, options);
    documentRef.removeEventListener('touchend', reset, { capture: true });
    documentRef.removeEventListener('touchcancel', reset, { capture: true });
    gesture = null;
  };
}

// Mobile edge-refresh gesture handler.
// BetterBUCT scrolls inside .workspace (not window), so the gesture must check the
// container's scrollTop — window.scrollY is always 0 in this app shell.  The
// gesture intentionally works at both edges: pull down at the top and pull up
// at the bottom.  A normal swipe in the middle of the page must remain a scroll.
export function installPullToRefresh({ onRefresh, threshold = 80, element = document.documentElement } = {}) {
  if (typeof onRefresh !== 'function') return () => {};
  let startY = 0;
  let startX = 0;
  let pulling = false;
  let edge = null;
  let refreshing = false;
  let activeScroller = null;

  const usableScroller = (candidate) => Boolean(
    candidate && (candidate.clientHeight > 0 || candidate.scrollHeight > 0),
  );

  const findScroller = (target) => {
    const closest = target?.closest?.('.settings-mobile-shell, .settings-page-shell, .workspace');
    if (usableScroller(closest)) return closest;
    for (const selector of ['.settings-mobile-shell', '.settings-page-shell', '.workspace']) {
      const candidate = document.querySelector(selector);
      if (usableScroller(candidate)) return candidate;
    }
    return document.documentElement;
  };

  const scroller = () => activeScroller || document.documentElement;

  const createIndicator = () => {
    const el = document.createElement('div');
    el.className = 'theia-pull-to-refresh';
    el.innerHTML = '<div class="spinner"></div><span>正在更新…</span>';
    el.style.display = 'none';
    document.body.prepend(el);
    return el;
  };

  const indicator = createIndicator();
  const label = () => indicator.querySelector('span');

  const hide = () => {
    indicator.style.height = '0';
    indicator.style.display = 'none';
    indicator.classList.remove('active');
    indicator.classList.remove('bottom');
    edge = null;
    activeScroller = null;
  };

  const cancel = () => {
    pulling = false;
    if (!refreshing) hide();
  };

  const edgeState = () => {
    const current = scroller();
    const maxScrollTop = Math.max(0, current.scrollHeight - current.clientHeight);
    return {
      atTop: current.scrollTop <= 1,
      atBottom: maxScrollTop <= 1 || current.scrollTop >= maxScrollTop - 1,
    };
  };

  const onTouchStart = (e) => {
    if (refreshing || e.touches.length !== 1) return;
    const touch = e.touches[0];
    if (!touch) return;
    activeScroller = findScroller(e.target);
    const { atTop, atBottom } = edgeState();
    if (!atTop && !atBottom) return;
    startY = touch.clientY;
    startX = touch.clientX;
    pulling = true;
    // If the page has no scrollable content both edges are true.  Delay the
    // edge choice until the first meaningful vertical movement in that case.
    edge = atTop && !atBottom ? 'top' : atBottom && !atTop ? 'bottom' : null;
  };

  const onTouchMove = (e) => {
    if (!pulling) return;
    if (e.touches.length !== 1) return cancel();
    const touch = e.touches[0];
    if (!touch) return;
    const diffY = touch.clientY - startY;
    const diffX = touch.clientX - startX;
    if (Math.abs(diffY) < 4) return;
    // Do not turn a horizontal control gesture into a refresh gesture.
    if (Math.abs(diffX) > Math.abs(diffY)) return cancel();

    const { atTop, atBottom } = edgeState();
    if (!edge) {
      edge = diffY > 0 && atTop ? 'top' : diffY < 0 && atBottom ? 'bottom' : null;
      if (!edge) return cancel();
    }
    const distance = edge === 'top' ? diffY : -diffY;
    // The finger moved in the wrong direction, or the content started to
    // scroll away from the edge: this is an ordinary scroll, not a refresh.
    if (distance <= 0 || (edge === 'top' && !atTop) || (edge === 'bottom' && !atBottom)) {
      return cancel();
    }
    const progress = Math.min(1, distance / threshold);
    indicator.style.display = '';
    indicator.style.height = (progress * 52) + 'px';
    indicator.classList.toggle('bottom', edge === 'bottom');
    indicator.classList.toggle('active', progress >= 1);
    label().textContent = progress >= 1
      ? '松开立即更新'
      : edge === 'bottom' ? '继续上拉更新' : '继续下拉更新';
  };

  const onTouchEnd = (e) => {
    if (!pulling) return;
    pulling = false;
    const touch = e.changedTouches?.[0];
    const diffY = touch ? touch.clientY - startY : 0;
    const distance = edge === 'top' ? diffY : edge === 'bottom' ? -diffY : 0;
    if (!refreshing && edge && distance >= threshold) {
      refreshing = true;
      label().textContent = '正在更新…';
      // Promise.resolve also handles a synchronous callback and ensures a
      // thrown error can never leave the indicator stuck on screen.
      Promise.resolve()
        .then(() => onRefresh())
        .catch(() => undefined)
        .finally(() => {
          refreshing = false;
          hide();
        });
    } else {
      hide();
    }
  };

  const onTouchCancel = () => cancel();

  element.addEventListener('touchstart', onTouchStart, { passive: true });
  element.addEventListener('touchmove', onTouchMove, { passive: true });
  element.addEventListener('touchend', onTouchEnd, { passive: true });
  element.addEventListener('touchcancel', onTouchCancel, { passive: true });

  return () => {
    element.removeEventListener('touchstart', onTouchStart);
    element.removeEventListener('touchmove', onTouchMove);
    element.removeEventListener('touchend', onTouchEnd);
    element.removeEventListener('touchcancel', onTouchCancel);
    indicator.remove();
  };
}

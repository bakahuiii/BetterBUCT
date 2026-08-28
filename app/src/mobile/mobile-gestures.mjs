// Mobile pull-to-refresh gesture handler.
// THEIA scrolls inside .workspace (not window), so the gesture must check the
// container's scrollTop — window.scrollY is always 0 in this app shell.
export function installPullToRefresh({ onRefresh, threshold = 80, element = document.documentElement } = {}) {
  if (typeof onRefresh !== 'function') return () => {};
  let startY = 0;
  let pulling = false;

  const scroller = () => document.querySelector('.workspace') || document.documentElement;

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
  };

  const onTouchStart = (e) => {
    // Only arm the gesture when the content scroller is at the very top.
    if (scroller().scrollTop > 0) return;
    const touch = e.touches[0];
    if (!touch) return;
    startY = touch.clientY;
    pulling = true;
  };

  const onTouchMove = (e) => {
    if (!pulling) return;
    // The user scrolled the content up — cancel the pull gesture.
    if (scroller().scrollTop > 0) {
      pulling = false;
      hide();
      return;
    }
    const touch = e.touches[0];
    if (!touch) return;
    const diff = touch.clientY - startY;
    if (diff <= 0) {
      hide();
      return;
    }
    const progress = Math.min(1, diff / threshold);
    indicator.style.display = '';
    indicator.style.height = (progress * 52) + 'px';
    indicator.classList.toggle('active', progress >= 1);
    label().textContent = progress >= 1 ? '松开立即更新' : '继续下拉更新';
  };

  const onTouchEnd = (e) => {
    if (!pulling) return;
    pulling = false;
    const diff = e.changedTouches?.[0]?.clientY - startY || 0;
    if (diff >= threshold) {
      label().textContent = '正在更新…';
      onRefresh().finally(hide);
    } else {
      hide();
    }
  };

  element.addEventListener('touchstart', onTouchStart, { passive: true });
  element.addEventListener('touchmove', onTouchMove, { passive: true });
  element.addEventListener('touchend', onTouchEnd, { passive: true });

  return () => {
    element.removeEventListener('touchstart', onTouchStart);
    element.removeEventListener('touchmove', onTouchMove);
    element.removeEventListener('touchend', onTouchEnd);
    indicator.remove();
  };
}

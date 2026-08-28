// Mobile pull-to-refresh gesture handler
// Attaches touch-event listeners to detect overscroll and triggers sync.
export function installPullToRefresh({ onRefresh, threshold = 80, element = document.documentElement } = {}) {
  if (typeof onRefresh !== 'function') return () => {};
  let startY = 0;
  let pulling = false;
  let pullingEl = null;

  const createIndicator = () => {
    const el = document.createElement('div');
    el.className = 'theia-pull-to-refresh';
    el.innerHTML = '<div class="spinner"></div><span>正在更新…</span>';
    el.style.display = 'none';
    document.body.prepend(el);
    return el;
  };

  const indicator = createIndicator();

  const onTouchStart = (e) => {
    if (window.scrollY > 0) return;
    const touch = e.touches[0];
    if (!touch) return;
    startY = touch.clientY;
    pulling = true;
  };

  const onTouchMove = (e) => {
    if (!pulling) return;
    const touch = e.touches[0];
    if (!touch) return;
    const diff = touch.clientY - startY;
    if (diff <= 0) {
      indicator.style.height = '0';
      indicator.style.display = 'none';
      return;
    }
    const progress = Math.min(1, diff / threshold);
    indicator.style.display = '';
    indicator.style.height = (progress * 48) + 'px';
    indicator.classList.toggle('active', progress >= 1);
    if (progress >= 1) {
      indicator.querySelector('span').textContent = '松开立即更新';
    } else {
      indicator.querySelector('span').textContent = '继续下拉更新';
    }
  };

  const onTouchEnd = (e) => {
    if (!pulling) return;
    pulling = false;
    const diff = e.changedTouches[0]?.clientY - startY || 0;
    if (diff >= threshold) {
      indicator.querySelector('span').textContent = '正在更新…';
      onRefresh().finally(() => {
        indicator.style.height = '0';
        indicator.style.display = 'none';
        indicator.classList.remove('active');
      });
    } else {
      indicator.style.height = '0';
      indicator.style.display = 'none';
      indicator.classList.remove('active');
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

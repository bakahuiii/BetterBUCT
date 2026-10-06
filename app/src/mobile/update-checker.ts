// 移动端应用更新检查：只检查公开 GitHub Release。APK 的下载和安装由
// Android 原生插件完成，避免在 WebView 中把整个安装包读入 JavaScript 内存。
export interface MobileUpdateInfo {
  hasUpdate: boolean;
  latestVersion: string;
  currentVersion: string;
  downloadUrl: string;
  releaseNotes: string;
  publishedAt: string;
  releaseName: string;
  assetSizeBytes: number | null;
  assetName: string;
  releaseUrl: string;
}

type CachedUpdate = { info: MobileUpdateInfo; checkedAt: number };

const GITHUB_RELEASES_API = 'https://api.github.com/repos/bakahuiii/BetterBUCT/releases/latest';
const UPDATE_CHECK_CACHE_KEY = 'theia-mobile-update-check';
const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000;
const UPDATE_REQUEST_TIMEOUT = 15_000;

export async function checkForMobileUpdate(currentVersion: string): Promise<MobileUpdateInfo | null> {
  const normalizedCurrent = normalizeVersion(currentVersion);
  try {
    const cached = getCachedUpdateInfo();
    if (cached && cached.info.currentVersion === normalizedCurrent && Date.now() - cached.checkedAt < UPDATE_CHECK_INTERVAL) {
      return cached.info;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPDATE_REQUEST_TIMEOUT);
    let response: Response;
    try {
      response = await fetch(GITHUB_RELEASES_API, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error(`GitHub API 返回 ${response.status}`);

    const release = await response.json() as {
      tag_name?: unknown;
      name?: unknown;
      html_url?: unknown;
      body?: unknown;
      published_at?: unknown;
      assets?: Array<{ name?: unknown; browser_download_url?: unknown; size?: unknown }>;
    };
    const latestVersion = normalizeVersion(String(release.tag_name || release.name || ''));
    if (!latestVersion) throw new Error('GitHub Release 没有有效版本号');
    const apk = (release.assets || []).find((asset) => String(asset.name || '').toLowerCase().endsWith('.apk'));
    const downloadUrl = String(apk?.browser_download_url || '').trim();
    if (!downloadUrl || !isAllowedApkUrl(downloadUrl)) throw new Error('GitHub Release 没有可用 APK 下载地址');
    const releaseUrl = String(release.html_url || '').trim();

    const info: MobileUpdateInfo = {
      hasUpdate: compareVersions(latestVersion, normalizedCurrent) > 0,
      latestVersion,
      currentVersion: normalizedCurrent,
      downloadUrl,
      releaseNotes: String(release.body || '查看发布说明'),
      publishedAt: String(release.published_at || ''),
      releaseName: String(release.name || latestVersion),
      assetSizeBytes: Number.isFinite(Number(apk?.size)) ? Number(apk?.size) : null,
      assetName: String(apk?.name || 'BetterBUCT-update.apk'),
      releaseUrl: releaseUrl || `https://github.com/bakahuiii/BetterBUCT/releases/tag/v${latestVersion}`,
    };
    cacheUpdateInfo(info);
    return info;
  } catch (error) {
    console.warn('[Update Check] 检查更新失败:', error);
    return null;
  }
}

export function openMobileUpdateUrl(url: string): boolean {
  const target = String(url || '').trim();
  if (!isAllowedApkUrl(target)) return false;
  try {
    const opened = window.open(target, '_blank', 'noopener,noreferrer');
    if (opened) return true;
    window.location.assign(target);
    return true;
  } catch {
    try { window.location.assign(target); return true; } catch { return false; }
  }
}

export function isAllowedApkUrl(value: string): boolean {
  try {
    const target = new URL(String(value || '').trim());
    const host = target.hostname.toLowerCase();
    return target.protocol === 'https:'
      && (host === 'github.com' || host === 'www.github.com' || host.endsWith('.githubusercontent.com'))
      && target.pathname.toLowerCase().endsWith('.apk');
  } catch {
    return false;
  }
}

function normalizeVersion(value: string): string {
  const raw = String(value || '').trim().replace(/^v/iu, '');
  return raw.match(/\d+(?:\.\d+){1,3}/u)?.[0] || raw.split(/[+_-]/u, 1)[0];
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const parts2 = v2.split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i += 1) {
    if ((parts1[i] || 0) !== (parts2[i] || 0)) return (parts1[i] || 0) > (parts2[i] || 0) ? 1 : -1;
  }
  return 0;
}

function getCachedUpdateInfo(): CachedUpdate | null {
  try {
    const raw = localStorage.getItem(UPDATE_CHECK_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedUpdate;
    return cached?.info && Number.isFinite(cached.checkedAt) ? cached : null;
  } catch { return null; }
}

function cacheUpdateInfo(info: MobileUpdateInfo) {
  try { localStorage.setItem(UPDATE_CHECK_CACHE_KEY, JSON.stringify({ info, checkedAt: Date.now() } satisfies CachedUpdate)); } catch { /* 缓存失败不影响更新检查 */ }
}

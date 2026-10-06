import { registerPlugin } from '@capacitor/core';

export interface UpdateDownloadProgress {
  transferredBytes: number;
  totalBytes: number;
  percent: number;
  bytesPerSecond: number;
}

export interface TheiaUpdatePlugin {
  downloadApk(options: { url: string; fileName?: string }): Promise<{ path: string; bytes: number; fileName: string }>;
  installApk(options?: { path?: string }): Promise<{ opened: boolean; requiresUnknownSourcesPermission?: boolean }>;
  openInstallSettings(): Promise<{ opened: boolean }>;
  addListener(
    eventName: 'downloadProgress',
    listenerFunc: (event: UpdateDownloadProgress) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

export const TheiaUpdate = registerPlugin<TheiaUpdatePlugin>('TheiaUpdate');

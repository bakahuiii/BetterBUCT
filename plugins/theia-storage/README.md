# TheiaStoragePlugin

分片 store 读写 + 加密。

**职责**：提供与桌面 `CampusStore` 同构的 sharded JSON 存储，但以原生性能
（Android Keystore 加密、直接文件系统写）替代浏览器 localStorage。

**接口**：以 Capacitor 插件形式暴露以下方法供 JS 桥调用。
- `load(manifestPath: string): Promise<Manifest>`
- `save(manifest: Manifest, fragments: Map<string, object>): Promise<void>`
- `saveCredentials(credentials: string): Promise<void>`
- `loadCredentials(): Promise<string | null>`

**注意**：当前阶段由 `platform/store/mobile-store.mjs` + 存储后端替代。
后续可替换为原生插件以提升性能/安全性。

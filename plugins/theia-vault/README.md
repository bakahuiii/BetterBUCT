# TheiaVaultPlugin

Keystore/Keychain 安全存储。

**职责**：将密码、校园 API 凭据、邮箱凭据、模型 API Key 存入系统安全存储，
不落入普通文件、日志、导出。

**接口**：
- `setSecret(key: string, value: string): Promise<void>`
- `getSecret(key: string): Promise<string | null>`
- `clearSecret(key: string): Promise<void>`
- `isEncryptionAvailable(): Promise<boolean>`

**实现**：Android → KeyStore + EncryptedSharedPreferences；
iOS → Keychain Services。

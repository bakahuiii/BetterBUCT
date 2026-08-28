# TheiaNetworkPlugin

校园网络（UA/重定向/重试）。

**职责**：替代桌面 Electron 的 `undici` / `fetch` 请求，提供：
- 校园域名白名单代理
- 统一 UA（模拟真实浏览器）
- 重定向跟随
- 指数退避重试
- 请求/响应拦截

**接口**：
- `fetch(request: NetworkRequest): Promise<NetworkResponse>`
- `setUserAgent(ua: string): Promise<void>`

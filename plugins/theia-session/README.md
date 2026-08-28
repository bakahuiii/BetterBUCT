# TheiaSessionPlugin

Cookie 会话 + 受限 WebView 登录。

**职责**：维护校园登录会话（Cookie jar），提供受限 WebView CAS 登录
（白名单域名，无地址栏，禁止下载/任意导航）。

**接口**：
- `getCookies(url: string): Promise<Cookie[]>`
- `setCookies(url: string, cookies: Cookie[]): Promise<void>`
- `clearCookies(url?: string): Promise<void>`
- `openLoginWebView(options: {url: string, domainWhitelist: string[]}): Promise<LoginResult>`

# 架构说明

BetterBUCT Android 是一个运行在 Capacitor WebView 中的 React 应用。移动端尽量复用桌面 THEIA 的界面和 `core/` 数据逻辑，把文件、凭据、网络、后台任务和通知等系统能力放到移动适配层与 Android 插件中。

## 总体数据流

```text
校园服务（jwglxt / THEOL / 其他北化公开服务）
                 │ HTTPS 或受限 THEOL HTTP
                 ▼
      原生网络桥接 / 会话 Cookie / 域名校验
                 │
                 ▼
      app/src/mobile/ 适配层与同步入口
                 │
        ┌────────┴────────┐
        ▼                 ▼
     core/ 解析与合并    React 视图与状态
        │                 │
        └────────┬────────┘
                 ▼
      App 私有目录中的分片 JSON store
                 │
                 ├── 离线读取、导出与提醒调度
                 └── Android Keystore 中的凭据
```

## 代码分层

### React 与 WebView

`app/src/` 包含视图、hooks、类型和桌面/移动共享的 UI。移动入口由 `app/src/mobile/mobile-entry.tsx` 启动，移动桥接在 `app/src/mobile/mobile-bridge.mjs` 和相关服务中实现。`vite.config.ts` 负责浏览器开发代理、Node 兼容 polyfill 和旧版 Android WebView 可解析的构建目标。

### 共享核心

根目录 `core/` 包含校园数据模型、解析器、同步服务、分片存储、导入导出和部分顾问/桌面能力。Android 使用其中能在浏览器/移动运行时工作的部分；桌面专属的 Electron、IMAP、MCP、本地 API 和窗口能力不会自动变成移动端能力。

### 移动适配层

`app/src/mobile/` 负责：

- 选择 Capacitor Filesystem 或浏览器存储后端；
- 调用 Android Keystore 保存凭据；
- 通过 `TheiaHttp` 进行校园域名白名单请求和受控重定向；
- 维护受限登录 WebView、Cookie 和移动会话；
- 调度后台同步、通知和电池优化提示；
- 适配 Android WebView 缺少的 Node API 和旧语法能力。

### Android 原生层

`app/android/` 当前在 `MainActivity` 注册以下插件：

- `TheiaSessionPlugin`：校园登录页面和 Cookie 会话；
- `TheiaVaultPlugin`：Android Keystore AES-GCM 凭据存储；
- `TheiaHttpPlugin`：校园域名请求、重定向控制和受限 DNS 代理；
- `TheiaBackgroundPlugin`：WorkManager 后台同步与通知；
- `TheiaBatteryPlugin`：电池优化状态和用户引导。

`plugins/` 下的 README 描述这些能力的接口和边界，其中一部分仍是跨平台设计预留。判断 Android 当前是否开放某项能力，应以实际注册代码和 [PROGRESS.md](PROGRESS.md) 为准。

## 登录、凭据与存储

1. 用户在移动界面输入教务或北化在线凭据。
2. 凭据通过 `TheiaVaultPlugin` 写入 Android Keystore 保护的存储；密码不进入普通分片 store、日志或导出文件。
3. 同步服务通过校园网络桥接获取数据，解析为共享 `core/` 模型。
4. 业务数据写入应用私有目录中的 `theia/data` 分片 JSON；应用重启或断网时仍可读取最近一次成功同步的缓存。
5. 导出只包含允许互导的校园数据，不包含密码、Cookie 或模型密钥。

浏览器预览使用本地开发后端保存测试凭据，其保护级别不等同于 Android Keystore。不要用浏览器预览验证设备级凭据安全性。

## 网络边界

原生网络层只接受 `https://buct.edu.cn` 及其子域名；为兼容北化在线的官方旧任务接口，`course.buct.edu.cn` 有明确的主机级 HTTP 例外。请求会保留必要的会话头，并在跳转时重新验证目标域名。不要把通用代理、任意 URL 加载或全局明文流量加入移动层。

## 当前实现与设计预留

当前 Android 版本已经提供课表、成绩、考试、学业进度、教务通知、THEOL 作业只读查看、校历、培养计划、空闲教室、场馆状态、同步和本地提醒。模型顾问、抢课、自动提交、邮箱 IMAP、资料下载缓存、桌面本地 API/MCP/Iris 和桌面自动更新仍属于未开放或桌面专属能力。详细边界和验证证据见 [PROGRESS.md](PROGRESS.md)。

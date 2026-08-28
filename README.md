# THEIA 移动版（THEIA-app）

把 [桌面 THEIA](https://github.com/bakahuiii)（本地优先 Windows 校园工作台）移植为原生移动 App。

- 目标平台：Android 8+（P0），iOS（P1，后续）
- 技术栈：**Capacitor** + 桌面 **React/Vite 前端复用**（零重写 UI）
- 原则：本地优先、无云服务器、凭据不出设备、数据与桌面端可互导

> 详细方案见 [docs/mobile-native-port-plan.md](docs/mobile-native-port-plan.md)。
> 实施进度见 [docs/PROGRESS.md](docs/PROGRESS.md)。

## 目录结构

```
THEIA-app/
├── app/                      # Capacitor 应用（Web 工程 + Android 壳）
│   ├── src/                  # 桌面 THEIA src/ 复用（视图/hooks/类型/bridge）
│   │   └── mobile/           # 移动端平台适配（新增，不改桌面文件）
│   │       ├── mobile-entry.tsx        # 移动入口：先装 bridge 再挂桌面 App
│   │       ├── install-mobile-bridge.mjs  # 同步安装 window.theia
│   │       ├── mobile-bridge.mjs       # window.theia 实现（平台适配核心）
│   │       ├── feed.mjs                # theia-feed/ics 导出
│   │       ├── store/                  # 分片 JSON store（桌面同 schema）
│   │       └── mock/                   # 阶段0 mock 数据（复用桌面 demo.ts）
│   ├── android/              # Capacitor Android 工程（cap add android 生成）
│   ├── capacitor.config.ts
│   ├── vite.config.ts
│   └── package.json
├── core/                     # 桌面 THEIA core/ 复用（纯 JS 逻辑，供后续移植）
├── plugins/                  # 原生 Capacitor 插件骨架
│   ├── theia-storage/        # 分片 store 读写 + 加密
│   ├── theia-vault/          # Keystore/Keychain 安全存储
│   ├── theia-session/        # Cookie 会话 + 受限 WebView 登录
│   ├── theia-network/        # 校园网络（UA/重定向/重试）
│   └── theia-background/     # 后台同步 / 通知
├── scripts/                  # 构建/同步脚本
└── docs/
    ├── mobile-native-port-plan.md   # 移植方案（源文件）
    └── PROGRESS.md                  # 实施进度
```

## 架构：platformAdapter

桌面端 UI 通过 `window.theia`（preload 桥，见 `src/bridge.ts`）访问主进程能力。
移动端用同一份 `src/`，只是在 WebView 加载前先执行
`src/mobile/install-mobile-bridge.mjs`，把 `window.theia` 替换成
**MobileBridge**（纯 JS 实现 + 原生 Capacitor 插件），因此
`useTheiaApp` 的 `bridge.getSnapshot()`、`bridge.syncNow()` 等调用**几乎不改**。

```
┌──────────────────────────────────────────────┐
│ 移动 UI（复用 src/，Capacitor WebView）        │
│  src/mobile/mobile-entry.tsx                 │
│    → install-mobile-bridge.mjs（设 window.theia）│
├──────────────────────────────────────────────┤
│ platformAdapter：src/mobile/mobile-bridge.mjs │
│  MobileStore（分片 JSON，桌面同 schema）        │
│  EventBus（snapshot/sync-progress/auth 等）    │
├──────────────────────────────────────────────┤
│ 存储后端（可插拔）                             │
│  web-storage（localStorage）                 │
│  capacitor-filesystem（原生 App 私有目录）      │
└──────────────────────────────────────────────┘
```

## 本地开发

```bash
cd app
npm install
npm run dev        # http://localhost:5175 （浏览器预览，走 localStorage 后端）
npm run build      # 产出 dist/（Capacitor webDir）
```

## Android 构建（需 Android SDK）

```bash
cd app
npm run build
npx cap add android        # 首次
npx cap sync android
cd android && ./gradlew assembleDebug
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

## 阶段状态

- ✅ 阶段0 技术验证（壳 + mock 数据 + bridge 契约 + 分片 store）
- 🔄 阶段1 数据层 + 登录（进行中）
- ⬜ 阶段2 P0 功能 UI 适配
- ⬜ 阶段3 P1 功能
- ⬜ 阶段4 打磨与发布

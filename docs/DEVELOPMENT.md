# 开发指南

本文档描述 BetterBUCT Android checkout 的日常开发流程。命令以 Windows PowerShell 为例；仓库中的脚本也可以在其他支持 Node.js 和 Android Gradle 的环境中运行，但 Android 真机验收仍应在目标设备上完成。

## 环境要求

- Git
- Node.js 20 或更新版本
- JDK 17 或更新版本（当前 Android Gradle Plugin 为 8.7.2；发布验证使用过 JDK 21）
- Android SDK Platform 35 和对应 Build Tools
- 可访问 Gradle 官方发行地址的网络，或已经缓存 `gradle-8.11.1-all.zip`

Android 构建会读取 `ANDROID_HOME` 或 `ANDROID_SDK_ROOT`。如果没有设置，仓库中的辅助脚本默认尝试 `H:\android-sdk`。JDK 应通过 `JAVA_HOME` 指定；不要把本机路径写入提交内容。

## 获取依赖

```powershell
git clone https://github.com/bakahuiii/BetterBUCT.git
cd BetterBUCT\app
npm install
```

`app/package-lock.json` 是依赖版本的记录。修改依赖后应同时检查 lockfile，并在提交说明中说明原因。

## 日常检查

在 `app/` 目录执行：

```powershell
npm run typecheck  # TypeScript 项目引用检查
npm test           # 有界 Node 测试，固定为 4 个并发 worker
npm run build      # Vite 生产构建
npm run check      # 依次执行上面三项
```

测试使用 `node --test --test-concurrency=4 tests/*.test.mjs`，不要改成不受限的全量 worker 数。测试和构建输出属于本地产物，不应提交。

## 浏览器预览

```powershell
cd app
npm run dev
```

Vite 默认监听 `127.0.0.1:5175`。开发服务器只把 `/__theia-campus/*` 代理到 `https://jwglxt.buct.edu.cn`，用于本地前端调试；应用代码仍会执行校园域名校验和会话处理。

浏览器预览不会提供 Android Keystore、原生网络桥接、WorkManager、后台恢复或真实通知。浏览器中能打开页面不等于 Android 登录和同步已经通过验收。

仓库根目录也提供等价的辅助命令：

```powershell
node scripts\dev.mjs
node scripts\build.mjs
```

## 与桌面 THEIA 同步源码

移动端复用了桌面 THEIA 的 `src/` 和 `core/`。需要同步时，在仓库根目录执行：

```powershell
$env:THEIA_DESKTOP = 'H:\work\THEIA'
node scripts\sync-desktop.mjs
```

未设置 `THEIA_DESKTOP` 时，脚本默认查找 `..\THEIA`。脚本会重写 `app/src/`（保留 `app/src/mobile/`）和根目录 `core/`；同步前请确认本地改动已经提交或另有备份，并检查移动端覆盖层是否仍然兼容。同步后至少运行 `npm run check`，并更新 [PROGRESS.md](PROGRESS.md) 中受影响的边界。

## Android 构建与调试

调试构建：

```powershell
cd app
npm run android:build
```

该命令会先构建 Web 资源、执行 `cap sync android`，再运行 `gradlew.bat assembleDebug`。APK 通常位于 `app/android/app/build/outputs/apk/debug/app-debug.apk`。

安装到已连接设备（需要 `adb` 在 PATH 中）：

```powershell
adb install -r app\android\app\build\outputs\apk\debug\app-debug.apk
```

发布构建见 [发布指南](RELEASE.md)。没有 `app/android/keystore.properties` 时，Gradle 会生成未签名 Release APK；它可以用于包信息检查，不能作为公开分发包。

## 常见问题

### Gradle 找不到发行包

确认网络可访问 `https://services.gradle.org/distributions/gradle-8.11.1-all.zip`，或让 Gradle 完成一次缓存下载。仓库 wrapper 使用标准发行地址，不依赖维护者电脑上的 `H:` 盘路径。

### 浏览器能打开，Android 不能同步

检查真实设备的网络、校园 DNS、系统时间和登录会话。Android 原生请求会限制到 `buct.edu.cn` 及其子域；`course.buct.edu.cn` 的 THEOL 旧接口还涉及受限明文 HTTP 例外。不要为了绕过失败而放宽全局明文流量或域名白名单。

### 通知没有到达

检查 Android 13+ 通知权限、精确闹钟权限、电池优化设置和应用是否已完成首次同步。浏览器预览不会覆盖这些条件。

### 登录失败后如何提交日志

只提交脱敏后的错误类型、时间、Android 版本和应用版本。删除学号、密码、Cookie、完整 URL 查询参数、课程详情和导出文件；凭据泄露请按 [安全政策](../SECURITY.md) 私下报告。

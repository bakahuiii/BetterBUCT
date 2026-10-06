# BetterBUCT Android

`THEIA-app` 是 BetterBUCT 的 Android 工程。它复用成熟校园工作台的 React/Vite 界面和 `core/` 数据解析逻辑，在 Capacitor Android WebView 中提供尽可能一致的移动体验。

## 已实现

- 本地优先分片数据存储，使用 Android App 私有目录，支持离线查看已缓存的课表、成绩、考试、学业进度和通知。
- JWGLXT API 登录与同步；账号密码保存到 Android Keystore AES-GCM 原生插件，应用重启后会静默恢复登录并刷新数据。
- 北化在线 THEOL 的只读课程/通知同步，以及按 Courser 思路实现的作业/在线测试列表和展开查看详情（受学校会话和网络状态影响）。
- 课表、成绩/GPA、考试、学业进度、课程基础信息、通知、校园地图。
- 校历/培养计划、空闲教室、场馆状态、数据包导入、JSON/BetterBUCT Feed/ICS/CSV 导出（Feed schema 保持 `theia-campus-feed/v1`，保证与旧数据互通）。
- Android 安全区、深色模式、触控尺寸、底部导航、下拉刷新和低性能设备兼容处理。
- 登录凭据升级：旧版本 Preferences 中的历史编码记录会在首次读取时迁移到 Keystore；应用卸载后系统私有数据会一并删除。

## 明确不放入安卓版的功能

以下功能当前没有可靠的移动实现，因此不会出现在安卓版导航中，也不会用示例数据假装可用：模型顾问、抢课/抢课哨兵、作业工作包与在线提交（安卓版目前只读查看作业，不自动提交）、校园邮箱 IMAP、课程资源下载缓存、桌面本地 API/MCP/Iris、桌面自动更新、体测/创新学分/第二课堂计算器。

## 构建

需要 Node.js、JDK 21 和 Android SDK。Windows 本机 SDK 路径示例为 `H:\android-sdk`。

```powershell
cd H:\work\THEIA-app\app
npm install
npm run typecheck
npm test -- --test-concurrency=4
npm run android:release
```

构建产物（2026-10-06）：

```text
# 已在 Android 模拟器上安装并启动验证的本地调试包
H:\work\THEIA-app\release\BetterBUCT-Android-0.2.25-debug.apk

# 无私有签名配置时，assembleRelease 产出的未签名包
H:\work\THEIA-app\release\BetterBUCT-Android-0.2.25-release-unsigned.apk
```

当前构建信息：

- applicationId：`io.github.bakahuiii.theia.mobile`（保持不变，确保旧版安装可直接升级）
- 显示名称：`BetterBUCT`
- versionName/versionCode：`0.2.25 / 25`
- 调试包 SHA-256：`B3121F63F0F9E82D37C433CF71B2EDA06E679AD1A8E3980AD926A93D3F7FB8A5`
- 未签名 Release 包 SHA-256：`CD73B7BB48B85E8534E0A8D915666777A7A3CDBA91B52B19B65F0EEE706BBF11`

正式发布前，请复制 `app/android/keystore.properties.example` 为同目录的 `keystore.properties`，配置 BetterBUCT 专用签名密钥后再次运行 `npm run android:release`。没有该私有密钥时，Gradle 会故意只生成 `app-release-unsigned.apk`，不会伪装成可发布包。

## 浏览器预览

```powershell
cd H:\work\THEIA-app\app
npm run dev
```

浏览器预览使用 localStorage 和开发代理，仅用于检查界面和 API 管线；它不等同于 Android Keystore，也不能替代 Android 原生登录验收。本轮已使用 `assembleRelease`、`aapt2 dump badging`、SHA-256、`apksigner` 和已连接的 Android 模拟器完成包级/启动级验收；正式发布仍需配置专用签名密钥，并在真实设备上完成登录、Keystore、通知和校园网络复测。

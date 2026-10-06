# BetterBUCT

BetterBUCT 是面向北京化工大学学生的本地优先 Android 校园信息工具。它把课表、成绩、考试、学业进度和北化在线课程信息集中到一个轻量的移动端界面中，校园数据保存在设备上，应用不提供开发者托管的个人数据云服务。

> BetterBUCT 是独立开源项目，不是北京化工大学官方应用。校园服务的登录方式、域名和数据格式变化可能影响同步结果。

## 当前功能

- **课表与概览**：按周查看课程、节次、时间和教室，支持本地缓存和周次切换。
- **成绩与学业**：查看课程成绩、绩点、学分、培养方案和学业进度。
- **考试与通知**：集中查看考试安排、教务通知和同步状态。
- **北化在线**：查看作业和在线测试列表、截止时间以及展开后的详情；移动端只读，不自动作答或提交。
- **校园工具**：校历、培养计划、空闲教室和场馆状态。
- **同步与提醒**：手动同步、可选后台同步，以及在设备本地调度课程、作业和考试提醒。
- **数据互导**：支持导入数据，并导出 JSON、BetterBUCT Feed、ICS 和 CSV。
- **移动适配**：适配安全区、触控操作、深色模式、下拉刷新和较低性能设备。

### 当前未开放的能力

Android 版本目前不开放模型顾问、抢课/抢课哨兵、作业自动作答或提交、校园邮箱 IMAP、课程资料下载缓存、桌面本地 API/MCP/Iris，以及体测、创新学分和第二课堂计算器。Android 正式包支持通过 GitHub Release 检查、下载并交给系统安装器完成更新。实现状态以 [`docs/PROGRESS.md`](docs/PROGRESS.md) 为准。

## 下载

- [最新 GitHub Release](https://github.com/bakahuiii/BetterBUCT/releases/latest)
- [所有发行版本](https://github.com/bakahuiii/BetterBUCT/releases)

当前稳定版本为 `v0.2.26`：

- [Release 说明](https://github.com/bakahuiii/BetterBUCT/releases/tag/v0.2.26)
- [Android APK](https://github.com/bakahuiii/BetterBUCT/releases/download/v0.2.26/BetterBUCT-Android-0.2.26-release.apk)
- [APK SHA-256](https://github.com/bakahuiii/BetterBUCT/releases/download/v0.2.26/BetterBUCT-Android-0.2.26-release.apk.sha256)

`v0.2.27` 仅作为自动更新链路测试包公开发布，不建议普通用户安装。

发布包通过 GitHub Release 提供，不把 APK、签名密钥或用户数据提交到源代码仓库。安装前请阅读对应 Release 的说明并校验 SHA-256。

## 数据与隐私

- 教务和北化在线凭据由 Android Keystore 保护，不写入普通应用文件、日志或导出包。
- 课表、成绩、考试、作业和提醒配置默认保存在应用私有存储中。
- 网络请求限制在北京化工大学校园域名；应用不使用广告、第三方统计、行为追踪或数据经纪服务。
- BetterBUCT 没有开发者托管的个人数据服务器，也不提供云端账户。
- 用户可以在应用设置中清除凭据、本地数据和提醒，并自行管理导出的文件。

完整说明见 [隐私政策](PRIVACY.md)。提交 Issue 或日志前，请删除学号、密码、Cookie、课程详情和其他个人信息。

## 技术栈与目录

- React、TypeScript、Vite：移动 WebView 用户界面
- Capacitor Android：Android 容器和原生桥接
- Android Keystore、WorkManager、Local Notifications：凭据、后台同步和本地提醒
- `core/`：校园数据模型、解析、同步、存储和导出逻辑
- `app/src/mobile/`：移动端入口、平台适配、原生桥接和移动存储
- `app/android/`：Android 原生工程和 Capacitor 插件
- `plugins/`：原生能力的接口说明和设计边界
- `docs/`：开发、架构、发布和实施状态文档

## 快速开始

环境要求：Node.js 20 或更新版本；只做浏览器开发时不需要 Android SDK。构建 Android 需要 JDK 17 或更新版本，以及 Android SDK Platform 35 和对应 Build Tools。

```powershell
cd app
npm install
npm run check
```

启动 Vite 浏览器预览：

```powershell
cd app
npm run dev
```

浏览器预览用于检查界面和前端数据管线，不等同于 Android 原生运行环境，也不能替代真实设备上的登录、Keystore、后台同步和通知验收。

调试 APK：

```powershell
cd app
npm run android:build
```

发布构建和签名配置见 [发布指南](docs/RELEASE.md)，完整开发流程见 [开发指南](docs/DEVELOPMENT.md)。

## 文档

- [文档索引](docs/README.md)
- [开发指南](docs/DEVELOPMENT.md)
- [架构说明](docs/ARCHITECTURE.md)
- [发布指南](docs/RELEASE.md)
- [当前实施状态](docs/PROGRESS.md)
- [隐私政策](PRIVACY.md)
- [贡献指南](CONTRIBUTING.md)
- [安全政策](SECURITY.md)
- [行为准则](CODE_OF_CONDUCT.md)
- [历史移植方案](docs/mobile-native-port-plan.md)

## 反馈与贡献

- [报告 Bug](https://github.com/bakahuiii/BetterBUCT/issues/new?template=bug_report.yml)
- [提出功能建议](https://github.com/bakahuiii/BetterBUCT/issues/new?template=feature_request.yml)
- [贡献指南](CONTRIBUTING.md)

请先阅读安全政策处理漏洞或凭据泄露问题；不要在公开 Issue、PR 或截图中提交真实账号、密码、Cookie、导出数据或签名密钥。

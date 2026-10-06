# BetterBUCT

BetterBUCT 是面向北京化工大学学生的 Android 校园信息工具。它把课表、成绩、考试、学业进度和校园事务集中到一个轻量的移动端界面中，并优先保证数据可控、界面清晰和离线可查看。

## 功能

- 课表：按周查看课程、节次、时间和教室，支持周次切换。
- 成绩：查看课程成绩、绩点和学分信息。
- 考试：集中查看考试时间、地点和相关安排。
- 学业：查看培养方案和学分完成情况。
- 工具：校历、空闲教室、场馆状态、第二课堂和创新学分。
- 提醒：在设备本地调度课程、作业和考试提醒，可在设置中调整提前时间。
- 数据：支持本地缓存、数据导入，以及 JSON、CSV、ICS 和 BetterBUCT Feed 导出。
- 移动体验：适配安全区、触控操作、深色模式、下拉刷新和低性能设备。

## 数据与隐私

- 登录凭据保存在 Android Keystore 中，不提交到项目文件，也不上传到 BetterBUCT 服务器。
- 课表、成绩和提醒数据默认保存在应用私有存储中。
- 同步只连接北京化工大学教务系统和北化在线等校园服务。
- 应用不包含广告、第三方统计或云端个人数据分析。
- 详细说明见 [隐私政策](PRIVACY.md)。

BetterBUCT 是校园信息工具，不是北京化工大学官方应用。校园服务的可用性、登录方式和数据格式变化可能影响同步结果。

## 技术栈

- React、TypeScript、Vite
- Capacitor Android
- Android Keystore、Local Notifications
- `core/` 中的校园数据解析和同步逻辑

## 本地开发

环境要求：Node.js、JDK 21 和 Android SDK（建议使用 API 35）。

在仓库根目录执行：

```powershell
cd app
npm install
npm run typecheck
npm test
npm run build
```

启动浏览器预览：

```powershell
cd app
npm run dev
```

浏览器预览用于检查界面和前端数据管线，不等同于 Android 原生运行环境，也不能替代真实设备上的登录、Keystore 和通知测试。

## Android 构建

调试构建：

```powershell
cd app
npm run android:build
```

发布构建：

1. 复制 `app/android/keystore.properties.example` 为 `app/android/keystore.properties`。
2. 填入本地签名密钥配置。真实密钥文件不会被提交到 Git。
3. 执行：

```powershell
cd app
npm run android:release
```

正式 APK 不放入 Git 仓库，发布文件通过 GitHub Release 提供。

## 最新版本

当前版本：`0.2.25`

- [GitHub Release](https://github.com/bakahuiii/BetterBUCT/releases/tag/v0.2.25)
- [下载 Android APK](https://github.com/bakahuiii/BetterBUCT/releases/download/v0.2.25/BetterBUCT-Android-0.2.25-release.apk)
- [APK SHA-256](https://github.com/bakahuiii/BetterBUCT/releases/download/v0.2.25/BetterBUCT-Android-0.2.25-release.apk.sha256)

## 反馈

请通过 [GitHub Issues](https://github.com/bakahuiii/BetterBUCT/issues) 报告问题。提交问题时不要附带学号、密码、Cookie、导出的个人数据或其他敏感信息。

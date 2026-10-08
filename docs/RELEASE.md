# 发布指南

本文档用于生成和检查 BetterBUCT Android 发布包。GitHub Release 是 APK 的分发入口；仓库不提交签名密钥，也不把最终 APK 当作源码文件管理。

## 发布前检查

1. 确认功能边界和已知限制已写入 [PROGRESS.md](PROGRESS.md)。
2. 确认 `app/package.json`、根目录 `package.json`、`app/package-lock.json`、`app/src/mobile/app-identity.mjs` 和 `app/android/app/build.gradle` 的版本号一致。
3. 递增 `versionCode`，并为公开版本设置新的 `versionName` 和 `v<versionName>` Git tag。
4. 执行 `npm run check`，再执行 Android debug 和 release 构建。
5. 在真实设备上分别记录安装、启动、登录、同步、离线缓存、通知和升级覆盖安装结果。

当前版本的 Android 身份信息为：

- `applicationId`: `io.github.bakahuiii.theia.mobile`（为兼容旧版本，暂不改名）
- 显示名称：`BetterBUCT`
- `versionCode`: `28`
- `versionName`: `0.2.28`
- 最低 Android API：`23`
- 编译/目标 API：`35`

## 签名配置

复制模板并只在本机填写真实值：

```powershell
Copy-Item app\android\keystore.properties.example app\android\keystore.properties
```

`keystore.properties` 和 `*.keystore` 已被 `.gitignore` 排除。签名库应保存在项目目录之外的受控位置，并备份到安全的密钥管理系统；不要把密码写入命令历史、Issue、PR 或 CI 日志。

没有 `keystore.properties` 时，Gradle 仍会生成 `release-unsigned.apk`，但该文件不能用于公开分发或覆盖安装已签名版本。

## 构建 APK

```powershell
cd app
npm run android:release
```

构建前会重新生成 Web 资源并执行 `cap sync android`。产物通常在：

```text
app/android/app/build/outputs/apk/release/app-release.apk
```

发布前将 APK 重命名为统一的产品和版本格式，例如 `BetterBUCT-Android-0.2.28-release.apk`，再生成同名 `.sha256` 文件。PowerShell 示例：

```powershell
$apk = 'release\BetterBUCT-Android-0.2.28-release.apk'
Get-FileHash $apk -Algorithm SHA256 | ForEach-Object { "$($_.Hash.ToLower())  $([IO.Path]::GetFileName($apk))" } | Set-Content "$apk.sha256" -Encoding utf8
```

## 产物检查

使用 Android SDK 中与当前 SDK 匹配的工具检查包名和版本：

```powershell
aapt2 dump badging release\BetterBUCT-Android-0.2.28-release.apk | Select-String 'package:|application-label:'
apksigner verify --verbose release\BetterBUCT-Android-0.2.28-release.apk
Get-FileHash release\BetterBUCT-Android-0.2.28-release.apk -Algorithm SHA256
```

期望看到 `io.github.bakahuiii.theia.mobile`、`BetterBUCT`、`versionCode 28` 和 `versionName 0.2.28`；签名包应通过 `apksigner verify`。将本地哈希与上传到 GitHub Release 的 `.sha256` 附件读回比较。

## GitHub Release

建议使用已推送的 tag 创建 Release，并上传：

- 签名的 Android APK；
- 对应的 `.sha256` 文件；
- 面向用户的变更说明、已知限制和最低 Android 版本；
- 明确说明是否需要卸载旧版本，以及是否支持覆盖安装升级。

Release 说明不要包含测试账号、Cookie、完整请求 URL、内部路径或签名信息。上传后通过 GitHub 页面和 API 读回资产名称、大小、发布状态和下载链接，再把最终链接写入 README（必要时同步更新应用内更新检查器）。

## 真机验收边界

代码、构建、包信息和签名验证不能替代设备验收。至少需要在一台目标 Android 设备上确认：

- 全新安装可以启动并完成校园登录；
- 凭据保存后重启仍能恢复会话；
- 手动同步和断网后的缓存读取符合预期；
- 课程、作业和考试通知按设置到达；
- 新版本可以覆盖安装，且旧数据仍可读取。

没有可用 ADB 设备时，只记录构建和静态验证结果，不把真机安装、真实登录或通知到达写成已验收。

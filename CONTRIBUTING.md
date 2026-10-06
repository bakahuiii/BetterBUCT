# 贡献指南

感谢你为 BetterBUCT 提交问题、改进代码或完善文档。BetterBUCT 是面向北京化工大学学生的独立开源 Android 项目，贡献应保持本地优先、隐私友好，并遵守校园服务的使用边界。

## 先从哪里开始

- 使用前先阅读根目录 [README.md](README.md) 和 [隐私政策](PRIVACY.md)。
- 修改实现前先阅读 [开发指南](docs/DEVELOPMENT.md)、[架构说明](docs/ARCHITECTURE.md) 和 [当前实施状态](docs/PROGRESS.md)。
- 已经存在相同问题时，请在原 Issue 中补充信息，不要重复创建。
- 漏洞、凭据泄露和安全绕过请按 [安全政策](SECURITY.md) 私下报告，不要公开发布。

## 本地开发

环境要求和 Android 构建步骤见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。常用命令如下：

```powershell
cd app
npm install
npm run typecheck
npm test
npm run build
```

提交前建议运行：

```powershell
cd app
npm run check
```

测试使用有界的 Node worker 数量。不要在本地把测试改成不受限的并发模式，也不要提交 `dist/`、Gradle 构建目录、日志、签名密钥或其他本地产物。

## 修改范围

- `app/src/`：React 界面、移动入口和平台适配。
- `app/android/`：Capacitor Android 工程和原生插件。
- `core/`：数据模型、解析、同步、存储和导入导出。
- `plugins/`：原生能力的接口说明与边界。
- `docs/`：开发、架构、发布和实施状态文档。

移动端复用部分桌面 THEIA 的 `src/` 和 `core/`。如果需要从桌面 checkout 同步源码，请按照开发指南使用 `scripts/sync-desktop.mjs`，同步后重新检查移动端覆盖层和功能边界。不要把桌面专属能力直接标记为 Android 已支持。

## 提交 Issue

Bug 报告请包含：

- BetterBUCT 版本、Android 版本和设备型号；
- 可重复的操作步骤；
- 期望结果和实际结果；
- 脱敏后的错误信息或日志；
- 问题是否只在真实设备出现，还是浏览器预览也能复现。

功能建议请先说明要解决的用户问题、使用场景和可接受的替代方案。涉及自动提交、抢课、邮箱、课程资料或其他未开放能力时，请先对照 [PROGRESS.md](docs/PROGRESS.md) 说明需求边界。

## 提交 Pull Request

Pull Request 应做到：

1. 标题直接说明变更，例如 `修复移动端考试时间显示` 或 `docs: 补充发布验收步骤`。
2. 描述用户可见变化、实现范围、已知限制和验证方式。
3. 只包含与当前问题相关的改动；无关格式化、生成文件和本机配置不要混入。
4. 代码、配置或功能变化同步更新相关文档和测试。
5. 如果改动涉及 Android 原生能力，说明是否完成真机验证；没有设备时要明确写出未验证项。
6. 检查 `git diff --check`，并确认没有学号、密码、Cookie、导出数据、API 密钥或签名材料。

仓库提供 Pull Request 模板，会提示填写这些信息。维护者可能要求补充日志、截图或最小复现，但请始终先脱敏。

## 代码和文档约定

- 优先沿用现有 TypeScript、React、Capacitor 和 Android 结构，不为局部需求引入新的框架。
- 校园网络请求继续遵守 `buct.edu.cn` 域名白名单、受控重定向和 THEOL 的明确 HTTP 例外。
- 凭据只能通过 Android Keystore 相关路径处理，不要写入普通存储、日志、导出文件或测试快照。
- 文档中的“已支持”应有当前代码或验证记录依据；构建通过不等于真实设备登录、通知或升级验收通过。
- 文档使用中文为主，命令、路径、接口名和产品名保持原样。

## 发布相关

公开 APK、签名和校验文件由维护者按照 [发布指南](docs/RELEASE.md) 处理。贡献者不应提交签名密钥、正式 APK 或包含真实校园账号的数据。版本号、应用显示名称和 `applicationId` 的兼容性要求也请先阅读发布指南。


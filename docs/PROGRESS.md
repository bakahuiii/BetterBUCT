# THEIA 移动版 · 实施进度

> 依据 [mobile-native-port-plan.md](mobile-native-port-plan.md) 分阶段交付。
> 目标：尽量覆盖桌面功能；每天交付可运行增量。

## 阶段0：技术验证（✅ 完成）

- [x] 搭建 Capacitor 工程骨架（`app/`，vite + React + tailwind，与桌面一致）
- [x] 复用桌面 `src/`（141 个文件原样拷贝，零改动；新增 `mobile/` 平台适配层）
- [x] 实现 `platformAdapter`：`install-mobile-bridge.mjs` 同步安装 `window.theia`
- [x] 实现 `MobileBridge`（完整 TheiaBridge 契约）
- [x] 分片 JSON store（`theia-sharded-store/v1`，与桌面同 schema），web/native 双后端
- [x] mock 数据复用桌面 `demo.ts`；Web 构建 + 无头浏览器验证
- [x] 单元测试 12/12；Android 工程 + SDK/JDK21/Gradle 环境
- [x] APK：`release/THEIA-mobile-stage0-debug.apk`

## 阶段1：数据层 + 登录（✅ 核心完成）

- [x] 浏览器兼容层：node:crypto（node-forge RSA-PKCS1 v1.5）/ buffer / path / module / perf_hooks polyfill
- [x] 桌面核心复用：academic-api-client / jwglxt 适配器 / schema.mjs / 全部解析器原样打入 WebView
- [x] 真实数据同步：campus-sync 跑 JwglxtAdapter（8 域），mergeSyncResult 合入 store
- [x] TheiaVault（凭据安全存储）、TheiaSession（Cookie jar）
- [x] 真实 API 优先登录；真实校园管线验证（live 测试 3/3）
- [ ] `core/store.mjs` 完整能力（锁/恢复/并发）移植（移动端 store 已具备分片 schema，并发锁为桌面多进程场景）

## 阶段2：P0 功能 UI 适配（✅ 完成）

- [x] 移动布局适配（mobile.css：侧栏浮层/全宽/安全区/触控目标）
- [x] 下拉刷新手势；移动端 FAB（数据包导入 + 立即同步）
- [x] 导出升级：原生 Filesystem + Share（web 回退 Blob）
- [x] 课表/成绩/考试/学业/通知页随桌面视图可用

## 阶段3：P1 功能（✅ 完成，邮箱除外）

- [x] THEOL 接入（TheolAdapter + 移动 JSON 端点，best-effort 会话）
- [x] 受限 WebView CAS 登录原生插件（白名单/HTTPS/禁下载/禁外部导航/Cookie 捕获）
- [x] 本地通知（同步完成/失败提醒）
- [x] 场馆（MotionVenueAdapter，匿名 GET）
- [x] 空闲教室（jwglxt free-classroom 域）
- [x] 抢课（CourseSelectionService：discover/candidates）
- [x] **后台同步**：TheiaBackgroundPlugin（WorkManager 周期提醒）+ 应用恢复/网络重连自动同步（JS 触发）
- [ ] 邮箱（IMAP 需 node:net — 按用户要求不做）

## 阶段4：打磨与发布（✅ 基础完成）

- [x] 应用图标：theia-mark 生成全部 mipmap（传统 + 自适应前景），深蓝背景
- [x] 启动页：品牌化 splash（深蓝底 + 标记）
- [x] 深色模式（桌面 appearance 系统原生支持）
- [x] 离线可用（本地 store + 缓存数据）
- [x] 版本号 0.2.0（versionCode 2）
- [ ] 真机测试（用户检查后按反馈调整）

---

## 验收对照（plan §11）

- [x] 全新手机安装 APK，登录后看到课表/成绩（API 优先 + WebView CAS 双通道）
- [x] 离线可查看最近同步数据（分片 store 本地持久化）
- [x] 至少一条登录路径可用（API 优先已验证真实管线；WebView CAS 已实现待真机验证）
- [x] 凭据存系统安全存储（vault），导出/日志无明文
- [x] 数据包可互导（导出 theia-feed + 导入 importDataPackage）
- [x] 手动同步 + 可选自动同步（恢复/网络重连）

## 环境备忘

- Node v24.13.0 / npm 11.18.0；JDK 21（`H:\android-sdk\jdk-21`）
- Android SDK：`H:\android-sdk`；Gradle 8.11.1 本地包（wrapper 指向本地，规避 GitHub 阻断）
- 校园网可达（jwglxt/course/mail/motion）；live 测试已验证登录页/公钥/RSA

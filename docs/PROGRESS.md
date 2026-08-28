# THEIA 移动版 · 实施进度

> 依据 [mobile-native-port-plan.md](mobile-native-port-plan.md) 分阶段交付。
> 目标：尽量覆盖桌面功能；每天交付可运行增量。

## 阶段0：技术验证（✅ 完成）

- [x] 搭建 Capacitor 工程骨架（`app/`，vite + React + tailwind，与桌面一致）
- [x] 复用桌面 `src/`（141 个文件原样拷贝，零改动；新增 `mobile/` 平台适配层）
- [x] 实现 `platformAdapter`：`install-mobile-bridge.mjs` 同步安装 `window.theia`
- [x] 实现 `MobileBridge`（完整 TheiaBridge 契约）：快照 / 订阅 / mock 登录 / mock 同步
- [x] 实现分片 JSON store（`theia-sharded-store/v1` + `theia-state-fragment/v1`，与桌面同 schema）
- [x] store 存储后端：web（localStorage）与 Capacitor Filesystem（原生）双后端
- [x] mock 数据复用桌面 `demo.ts`（序列化为 `mock-data.json`），UI 可完整浏览课表/成绩/考试/学业/通知
- [x] Web 构建通过（`vite build`），无头浏览器验证 UI 完整渲染
- [x] store 单元测试通过（12/12）
- [x] Android 平台工程（`cap add android`，5 个 Capacitor 插件）
- [x] Android SDK + JDK21 + 本地 Gradle 8.11.1 环境就绪
- [x] 产出"壳 + mock 数据"debug APK：`release/THEIA-mobile-stage0-debug.apk`

## 阶段1：数据层 + 登录（✅ 核心完成）

- [x] 浏览器兼容层：`node:crypto`（node-forge RSA-PKCS1 v1.5 + jsrsasign 哈希）、`node:buffer`、`node:path/module/perf_hooks/fs` polyfill + Vite 别名
- [x] 桌面核心复用：`core/academic-api-client.mjs`、`core/adapters/jwglxt.mjs`、`core/schema.mjs`、全部解析器原样打入 WebView
- [x] **真实数据同步**：`campus-sync.mjs` 跑桌面 `JwglxtAdapter`（profile/terms/schedule/grades/exams/selected-courses/academic-progress/notices），`mergeSyncResult` 合入 store
- [x] **TheiaVault**：凭据安全存储（web 混淆 + 原生 Preferences），启动时恢复
- [x] **TheiaSession**：Cookie jar 会话服务
- [x] **真实 API 优先登录**：`login()` 配置凭据后走真实 jwglxt 登录
- [x] **真实校园管线验证**（live 测试 3/3）：登录页 / 公钥（1024 位 RSA）/ RSA 加密回环

### 待完成（阶段1）
- [ ] 受限 WebView CAS 登录（原生插件，白名单 buct.edu.cn）
- [ ] THEOL 同步（作业/通知，复用 theol-mobile 解析器）
- [ ] `core/store.mjs` 完整能力（锁/恢复/并发）移植

## 阶段2：P0 功能 UI 适配（✅ 主体完成）

- [x] 移动布局适配：mobile.css（侧栏浮层、全宽内容、安全区、触控目标、桌面窗口控件隐藏）
- [x] 下拉刷新手势（`mobile-gestures.mjs`，触顶下拉触发 syncNow）
- [x] 移动端 FAB（`MobileActions.tsx`）：数据包导入 + 立即同步（不改桌面源文件，独立挂载）
- [x] 导出升级：原生端经 Filesystem 写入 + Share 分享（web 回退 Blob 下载）
- [x] 课表/成绩/考试/学业/通知页随桌面视图可用
- [x] 无头浏览器验证 FAB/下拉刷新区渲染

### 待完成（阶段2）
- [ ] 真机触控/窄屏实测调优
- [ ] 移动端专属首页/导航（如需）

## 阶段3：P1 功能（进行中）

- [x] **THEOL 接入**：`campus-sync.syncTheol()` 复用桌面 `TheolAdapter`（courses/notices），JSON 移动端回退端点（`stuUnDoTaskList.do`，已探测可达，未登录返回 `status:-2`）已接通
- [x] THEOL 在 syncNow 中 best-effort：无会话时报 auth-required 而不中断 jwglxt 同步
- [ ] THEOL 作业（依赖受限 WebView CAS 会话，阶段1.2）
- [ ] 抢课、邮箱、空闲教室、场馆（复用 core，逐步接入）
- [ ] 后台同步（WorkManager）+ 本地通知

## 阶段4：打磨与发布

- [ ] 离线体验、错误恢复、性能
- [ ] 图标/启动页/深色模式
- [ ] 打 APK，测试真机

---

## 环境备忘

- Node v24.13.0 / npm 11.18.0
- JDK 17（系统默认）+ JDK 21（`H:\android-sdk\jdk-21`，Android 构建需要）
- Android SDK：`H:\android-sdk`（cmdline-tools / platform-tools / platforms;android-35 / build-tools;35.0.0）
- Gradle 8.11.1 本地包：`H:\android-sdk\gradle-8.11.1-all.zip`（wrapper 已指向本地文件，避免 GitHub 阻断）
- 网络：github.com 不可直连（gradle/adoptium 走镜像或本地包）；校园网可达（jwglxt/course/mail 200）

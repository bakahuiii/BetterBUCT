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
- [x] store 单元测试通过（7/7）
- [x] Android 平台工程（`cap add android`，4 个 Capacitor 插件）
- [x] Android SDK + JDK21 + 本地 Gradle 8.11.1 环境就绪
- [x] 产出"壳 + mock 数据"debug APK：`release/THEIA-mobile-stage0-debug.apk`（105MB）

## 阶段1：数据层 + 登录（进行中，已完成核心）

### 已完成
- [x] **浏览器兼容层**：`node:crypto`（node-forge RSA-PKCS1 v1.5 + jsrsasign 哈希）、`node:buffer`、`node:path/module/perf_hooks` polyfill + Vite 别名
- [x] **桌面核心复用**：`core/academic-api-client.mjs` 原样打入 WebView（RSA 加密回环测试通过，可被 Node 私钥解密）
- [x] **cheerio 浏览器版**：指向 `dist/browser` 入口，避免 Node stream 依赖
- [x] **TheiaVault**：凭据安全存储抽象（web 混淆 + 原生 Preferences），统一/教务 API/邮箱/模型 Key 四类凭据
- [x] **TheiaSession**：Cookie jar 会话服务 + 受限 WebView 登录占位
- [x] **真实 API 优先登录**：`login()` 配置了教务 API 凭据时走真实 jwglxt 登录（取登录页 → CSRF → 公钥 → RSA 加密提交），否则回退 mock
- [x] 凭据状态从 vault 恢复（启动时），`readSavedSecret` 走 vault

### 待完成
- [ ] 受限 WebView CAS 登录（原生插件，白名单 buct.edu.cn）
- [ ] 登录后的真实数据同步（课表/成绩/考试/通知，复用 `core/sync-service.mjs`）
- [ ] `core/store.mjs` 完整能力（锁/恢复/并发）移植

## 阶段2：P0 功能 UI 适配

- [ ] `src/` 视图移动端适配（触控/窄屏/下拉刷新）
- [ ] 课表/成绩/考试/学业/通知页上线
- [ ] 导出/导入数据包（导入已具备 `importDataPackage`）

## 阶段3：P1 功能

- [ ] THEOL 作业、抢课、邮箱、空闲教室、场馆
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

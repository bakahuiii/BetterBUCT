# THEIA 移动版 · 实施进度

> 依据 [mobile-native-port-plan.md](mobile-native-port-plan.md) 分阶段交付。
> 目标：尽量覆盖桌面功能；每天交付可运行增量。

## 阶段0：技术验证（✅ 主体完成）

- [x] 搭建 Capacitor 工程骨架（`app/`，vite + React + tailwind，与桌面一致）
- [x] 复用桌面 `src/`（141 个文件原样拷贝，零改动；新增 `mobile/` 平台适配层）
- [x] 实现 `platformAdapter`：`install-mobile-bridge.mjs` 同步安装 `window.theia`
- [x] 实现 `MobileBridge`（完整 TheiaBridge 契约）：快照 / 订阅 / mock 登录 / mock 同步
- [x] 实现分片 JSON store（`theia-sharded-store/v1` + `theia-state-fragment/v1`，与桌面同 schema）
- [x] store 存储后端：web（localStorage）与 Capacitor Filesystem（原生）双后端
- [x] mock 数据复用桌面 `demo.ts`（序列化为 `mock-data.json`），UI 可完整浏览课表/成绩/考试/学业/通知
- [x] Web 构建通过（`vite build`），无头浏览器验证 UI 完整渲染
- [x] store 单元测试通过（4/4：分片读写 / 备份恢复 / feed 导出 / ICS 导出）
- [x] Android 平台工程（`cap add android`，4 个 Capacitor 插件）
- [x] Android SDK + JDK21 + 本地 Gradle 8.11.1 环境就绪
- [x] 产出"壳 + mock 数据"debug APK：`release/THEIA-mobile-stage0-debug.apk`（105MB，minSdk 23 / targetSdk 35）

## 阶段1：数据层 + 登录（下一步）

- [ ] 移植 `core/store.mjs` 完整能力（锁/恢复/并发）到移动 store
- [ ] `TheiaVault`（Android Keystore）保存凭据
- [ ] 登录：API 优先通道（复用 `core/academic-api-client.mjs`）
- [ ] 受限 WebView CAS 登录（白名单 `buct.edu.cn`）
- [ ] 手动同步拿到课表/成绩/考试/通知（真实接口）
- [ ] 桌面已有 `core/parsers/theol-mobile.mjs`（THEOL 移动 API 解析）可复用

## 阶段2：P0 功能 UI 适配

- [ ] `src/` 视图移动端适配（触控/窄屏/下拉刷新）
- [ ] 课表/成绩/考试/学业/通知页上线
- [ ] 导出/导入数据包

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
- JDK 17（系统默认）+ JDK 21（`C:\Program Files\Eclipse Adoptium\jdk-21.0.6.7-hotspot`，Android 构建需要）
- Android SDK：`H:\android-sdk`（cmdline-tools / platform-tools / platforms;android-35 / build-tools;35.0.0）
- Gradle 8.11.1 本地包：`H:\android-sdk\gradle-8.11.1-all.zip`（wrapper 已指向本地文件，避免 GitHub 阻断）
- 网络：github.com 不可直连（gradle/adoptium 走镜像或本地包）

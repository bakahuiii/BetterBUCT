# THEIA 移动版 · 实施进度

> 依据 [mobile-native-port-plan.md](mobile-native-port-plan.md) 分阶段交付。
> 目标：尽量覆盖桌面功能；每天交付可运行增量。

## 阶段0：技术验证（✅ 完成）

- [x] 搭建 Capacitor 工程骨架（`app/`，vite + React + tailwind，与桌面一致）
- [x] 复用桌面 `src/`（141 个文件原样拷贝，零改动）
- [x] 实现 `platformAdapter`：`install-mobile-bridge.mjs` 同步安装 `window.theia`
- [x] 实现 `MobileBridge`（TheiaBridge 契约）：快照 / 订阅 / mock 登录 / mock 同步
- [x] 实现分片 JSON store（`theia-sharded-store/v1` + `theia-state-fragment/v1`，与桌面同 schema）
- [x] store 存储后端：web（localStorage）与 Capacitor Filesystem（原生）双后端
- [x] mock 数据复用桌面 `demo.ts`，UI 可完整浏览课表/成绩/考试/学业/通知
- [x] Web 构建通过（`vite build`）
- [x] Android 平台工程（`cap add android`）
- [ ] 产出"壳 + mock 数据"debug APK（依赖 Android SDK 安装完成）

## 阶段1：数据层 + 登录（进行中）

- [ ] 移植 `core/store.mjs` 完整能力（锁/恢复/并发）到移动 store
- [ ] `TheiaVault`（Android Keystore）保存凭据
- [ ] 登录：API 优先通道（复用 `core/academic-api-client.mjs`）
- [ ] 受限 WebView CAS 登录（白名单 `buct.edu.cn`）
- [ ] 手动同步拿到课表/成绩/考试/通知（真实接口）

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

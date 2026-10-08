# BetterBUCT Android 实施状态

更新时间：2024-10-08

## 当前完成度

### 基础与界面

- [x] Capacitor Android 工程和 WebView 启动链路
- [x] 复用桌面 BetterBUCT 当前 `src/` 与 `core/`，移动端只在 `src/mobile/` 增加平台适配
- [x] 手机安全区、触控目标、底部导航、下拉刷新、深色模式
- [x] 移动端移除地图、字体资源、3D 场景和背景图，使用轻量的原生界面层级
- [x] 未实现功能从手机导航/设置/仪表盘隐藏，不用 mock 数据冒充真实能力

### 数据与登录

- [x] App 私有目录分片 JSON 存储，保留 `theia-sharded-store/v1` 结构
- [x] JWGLXT API 登录、RSA 密码加密、同步与缓存保留
- [x] Android 原生 `TheiaVaultPlugin`：Android Keystore AES-GCM，不再把密码放在普通 Preferences
- [x] 旧版移动端编码凭据的一次性迁移
- [x] 应用重启后静默读取凭据、恢复登录并刷新数据；网络失败时保留本地缓存和凭据
- [x] 数据导入，以及 JSON/BetterBUCT Feed/ICS/CSV 导出

### 已开放的移动功能

- [x] 概览、课表、成绩/GPA、考试、学业进度
- [x] 课程基础信息和教务通知
- [x] 北化在线THEOL作业/在线测试列表、截止时间与展开查看详情（只读）
- [x] 校历、培养计划、空闲教室、场馆状态
- [x] 手动同步、可选后台同步、同步通知
- [x] GitHub Release 自动检查、APK 流式下载、安装权限引导和系统安装器更新

### 明确不做

模型顾问、抢课/抢课哨兵、作业工作包/在线提交（移动端只读查看，不自动提交）、校园邮箱 IMAP、课程资料下载缓存、桌面本地 API/MCP/Iris、桌面自动更新、体测/创新学分/第二课堂计算器。

## 2026-09-29 移动端首轮验收修复

- [x] 修复保存密码显示完整凭据 JSON 的问题：移动桥接只返回请求的密码字段，输入组件也增加了 JSON 防泄漏兜底
- [x] 修复手机概览页横向溢出：桌面双栏网格在窄屏统一收敛为单栏，指标和快捷入口保留双列
- [x] 修复课程页标题被搜索框挤压：移动端搜索移入课程页工具栏
- [x] 修复考试页显示原始 ISO 时间：统一格式化为中文日期时间
- [x] 隐藏安卓版未实现的课程资料抓取/打开入口，课程卡片改为课程信息
- [x] 通知页在安卓版隐藏未实现的校园邮箱面板，不再显示空白邮箱区
- [x] 修复移动侧栏浅色主题文字接近白色不可读的问题
- [x] 移动设置页保留设置分类文字标签，避免只显示图标难以识别
- [x] 地图页去除“Windows 端关闭”文案，改为按平台显示定位能力状态
- [x] 修复 Android CapacitorHttp 自动跟随重定向导致的“教务 API 返回了非校园网地址”：新增原生 `nativeFetch`，关闭原生自动重定向并由 AcademicApiClient 逐跳校验
- [x] 修复 Android WebView 不支持 `Buffer.toString('base64url')` 导致的同步失败：改用标准 Base64 转换，覆盖 RSA 登录、公用 ID 和本地令牌，并补充原生 HTTP 登录回归测试
- [x] 修复安卓版登录后首次教务请求会话失效：原生 HTTP 保留显式 `Cookie` 请求头，并解析 Capacitor Android 合并返回的多条 `Set-Cookie`；覆盖登录页、公钥、RSA 登录提交到首页的完整会话回归
- [x] 按 2026-09-30 线上正方登录页协议修复登录：保留 `language`/`ydType` 等隐藏字段、清理旧会话、提交带时间戳的登录 action 和两个重复 RSA `mm` 字段；Cookie 请求头在进入 Capacitor 原生层前显式恢复

## 2026-10-02 BetterBUCT 重命名与发布准备

- [x] Android 启动器、圆形图标、Adaptive Icon 前景和各密度资源统一换为与 THEIA 桌面版相同的二次元标记
- [x] 启动页统一使用二次元标记；受限校园登录页改用不透明独立主题，避免启动图在 WebView 切换时变形残留
- [x] 用户可见名称统一为 `BetterBUCT`；applicationId 保持不变以允许旧版安装升级
- [x] Feed schema 和内部 `theia-*` 协议名保留，确保旧数据包互操作
- [x] 增加身份/版本回归测试、可选 Release 签名配置模板和发布前 SHA-256 产物
- [x] 已完成 APK 包信息、签名和自动化测试验证；设备安装验收需在 ADB 可见目标设备时执行
- [x] 修复 MOTION 查询前一天等已过期日期时报“date is not exposed”：当公开页不再暴露所选日期时自动切换到最新可用日期，并加入回归测试

## 2026-10-02 THEOL 作业查看

- [x] 复用 Courser 已验证的 `stuUnDoTaskList.do` 待办接口；课程上下文使用 `enterCourse.do`，展开详情使用 `homeworkView.do`。
- [x] 移动端新增“作业”底部入口、按类型/状态筛选、截止时间排序和懒加载详情。
- [x] 作业正文在进入 React 前移除脚本、表单和非北化域名资源；不实现自动作答或自动提交。
- [x] 新增 THEOL 移动列表/详情解析和适配器回归测试。

## 验证记录

- `npm run check`：通过；类型检查、43 项 Node 测试和 Vite 生产构建全部通过
- `npm run android:build`：通过；debug APK 生成
- `npm run android:release` / `gradlew.bat assembleRelease`：通过；无私有签名配置时明确生成未签名 Release APK
- `aapt2 dump badging`：确认 package `io.github.bakahuiii.theia.mobile`、`BetterBUCT`、`versionCode 26`、`versionName 0.2.26`
- `apksigner verify`：正式 Release APK 的 v1/v2 签名验证通过
- Android 设备安装验收：本轮执行时 ADB 未发现可用设备，因此未将安装、启动和真实登录结果写成已完成
- 本轮未把真实校园账号登录、Keystore 密码读写、通知到达和不同 Android 真机网络环境宣称为已验收；Node 测试覆盖了线上登录页、公钥、RSA、Cookie、重定向白名单和缓存保留边界，仍需发布前在真实设备上复测。

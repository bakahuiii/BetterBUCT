# BetterBUCT

<div align="center">

**面向北京化工大学学生的本地优先 Android 校园信息工具**

[![GitHub Release](https://img.shields.io/github/v/release/bakahuiii/BetterBUCT)](https://github.com/bakahuiii/BetterBUCT/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Android](https://img.shields.io/badge/Android-7.0%2B-green)](https://github.com/bakahuiii/BetterBUCT/releases/latest)

[下载应用](#下载) • [功能说明](#功能特性) • [隐私政策](PRIVACY.md) • [开发文档](docs/README.md)

</div>

---

## 📖 关于

BetterBUCT 是面向北京化工大学学生的本地优先 Android 校园信息工具。它将课表、成绩、考试、学业进度和北化在线课程信息集中到一个轻量的移动端界面中，校园数据保存在设备上，**应用不提供开发者托管的个人数据云服务**。

> **重要声明**  
> BetterBUCT 是独立开源项目，不是北京化工大学官方应用。校园服务的登录方式、域名和数据格式变化可能影响同步结果。项目遵循 MIT 许可证，按"原样"提供，不提供任何形式的担保。

---

## ✨ 功能特性

### 📅 课表与概览
- 按周查看课程安排，支持周次切换
- 显示节次、时间、教室和教师信息
- 本地缓存，离线可用
- 快速概览当日课程

### 📊 成绩与学业
- 查看课程成绩、绩点和学分
- 学业进度跟踪和培养方案
- 成绩统计和 GPA 计算
- 历史成绩归档

### 📝 考试与通知
- 集中查看考试安排和时间地点
- 教务通知推送和历史记录
- 同步状态实时显示
- 考试倒计时提醒

### 📚 北化在线
- 查看作业和在线测试列表
- 显示截止时间和状态
- 展开查看作业详情
- **移动端只读，不自动作答或提交**

### 🛠️ 校园工具
- 校历查询和学期信息
- 培养计划查看
- 空闲教室查询
- 场馆状态查看

### 🔄 同步与提醒
- 手动同步校园数据
- 可选后台自动同步
- 设备本地调度课程、作业和考试提醒
- 同步失败自动恢复

### 📤 数据互导
- 导入校园数据包
- 导出为 JSON、BetterBUCT Feed、ICS 和 CSV
- 跨设备数据迁移
- 数据备份和恢复

### 📱 移动适配
- 安全区适配（刘海屏、挖孔屏）
- 触控目标优化
- 深色模式完整支持
- 下拉刷新手势
- 低性能设备优化

### 🔐 隐私保护
- Android Keystore 加密存储凭据
- 本地数据存储，无云端上传
- 域名白名单网络隔离
- 导出文件不包含密码

---

## 🚫 当前未开放的能力

Android 版本目前不开放以下功能：

- 模型顾问和 AI 功能
- 抢课/抢课哨兵
- 作业自动作答或提交
- 校园邮箱 IMAP
- 课程资料下载缓存
- 桌面本地 API/MCP/Iris
- 体测、创新学分和第二课堂计算器

实现状态详见 [实施状态文档](docs/PROGRESS.md)。

---

## 📦 下载

### 最新稳定版本

**v0.2.28** (2024-10-08)

- [GitHub Release 页面](https://github.com/bakahuiii/BetterBUCT/releases/tag/v0.2.28)
- [下载 Android APK](https://github.com/bakahuiii/BetterBUCT/releases/download/v0.2.28/BetterBUCT-Android-0.2.28-release.apk) (4.2 MB)
- [下载 SHA-256 校验文件](https://github.com/bakahuiii/BetterBUCT/releases/download/v0.2.28/BetterBUCT-Android-0.2.28-release.apk.sha256)

### 系统要求

- **Android 7.0+** (API 23+)
- 网络连接（用于校园数据同步）
- 约 50 MB 存储空间

### 下载渠道

- ✅ **GitHub Release**（推荐，官方唯一发布渠道）
- ❌ 不在任何应用商店或第三方平台发布

### 安装说明

1. 下载 APK 和 SHA-256 文件
2. 验证文件完整性（推荐）：
   ```bash
   sha256sum -c BetterBUCT-Android-0.2.28-release.apk.sha256
   ```
3. 安装 APK（需允许安装未知来源应用）
4. 首次打开输入教务系统账号密码
5. 完成同步后即可离线使用

### 更新说明

应用支持通过 GitHub Release 检查、下载并自动引导安装新版本。更新不会丢失本地数据。

---

## 🔒 数据与隐私

### 数据存储

- **凭据保护**：教务和北化在线凭据由 Android Keystore 加密保护，不写入普通应用文件、日志或导出包
- **本地存储**：课表、成绩、考试、作业和提醒配置保存在应用私有存储中
- **无云服务**：BetterBUCT 没有开发者托管的个人数据服务器，不提供云端账户
- **用户控制**：可随时清除凭据、本地数据和提醒，导出文件由用户自行管理

### 网络访问

- **域名限制**：仅访问北京化工大学校园域名（`buct.edu.cn` 及子域）
- **HTTPS 优先**：强制 HTTPS 连接（除北化在线历史接口的明确例外）
- **无追踪**：不使用广告、第三方分析、行为追踪或数据经纪服务
- **无上传**：不将个人数据上传到开发者或第三方服务器

### 权限说明

| 权限 | 用途 | 是否必需 |
|------|------|----------|
| `INTERNET` | 访问校园服务并同步数据 | 同步时需要 |
| `POST_NOTIFICATIONS` | 显示课程、作业和考试提醒 | 可选 |
| `SCHEDULE_EXACT_ALARM` | 按设置时间调度提醒 | 可选 |
| `RECEIVE_BOOT_COMPLETED` | 设备重启后恢复提醒 | 可选 |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | 引导用户减少系统对提醒的限制 | 可选，需用户确认 |

**不申请**：相机、麦克风、联系人、短信、电话、定位等权限。

完整隐私政策见 [PRIVACY.md](PRIVACY.md)。

---

## 🏗️ 技术栈

### 前端
- **React 19** + **TypeScript 5.8**
- **Vite 7** 构建工具
- **Tailwind CSS 4** 样式框架
- **Capacitor 7** Android 容器

### 原生层
- **Android Keystore** 凭据加密
- **WorkManager** 后台同步
- **Local Notifications** 本地提醒
- **自定义插件** 网络、会话、更新管理

### 数据与存储
- 分片 JSON 本地存储
- 离线缓存和增量同步
- 数据导入导出
- 校园数据解析和归一化

### 安全特性
- 域名白名单和重定向校验
- Android Keystore AES-GCM 加密
- 网络安全配置（Network Security Config）
- ProGuard 代码混淆

详细架构见 [ARCHITECTURE.md](docs/ARCHITECTURE.md)。

---

## 🚀 快速开始

### 环境要求

- **Node.js 20+**
- **JDK 17+**（构建 Android 需要）
- **Android SDK Platform 35** 和对应 Build Tools
- Git

### 获取代码

```bash
git clone https://github.com/bakahuiii/BetterBUCT.git
cd BetterBUCT/app
npm install
```

### 开发命令

```bash
# 类型检查
npm run typecheck

# 运行测试（62 个自动化测试）
npm test

# 生产构建
npm run build

# 完整检查（类型 + 测试 + 构建）
npm run check

# 浏览器开发预览
npm run dev

# 构建 Android Debug APK
npm run android:build

# 构建 Android Release APK
npm run android:release
```

### 浏览器预览

```bash
cd app
npm run dev
# 访问 http://127.0.0.1:5175
```

**注意**：浏览器预览不提供 Android Keystore、原生网络桥接、后台同步或真实通知，仅用于界面和前端逻辑调试。

详细开发指南见 [DEVELOPMENT.md](docs/DEVELOPMENT.md)。

---

## 📚 文档

- [📖 文档索引](docs/README.md) - 所有文档的入口
- [🏗️ 架构说明](docs/ARCHITECTURE.md) - 技术架构和数据流
- [💻 开发指南](docs/DEVELOPMENT.md) - 环境搭建和开发流程
- [🚀 发布指南](docs/RELEASE.md) - 构建、签名和发布流程
- [✅ 实施状态](docs/PROGRESS.md) - 功能完成度和验收记录
- [🔒 隐私政策](PRIVACY.md) - 数据处理和隐私保护
- [🤝 贡献指南](CONTRIBUTING.md) - 如何参与贡献
- [🔐 安全政策](SECURITY.md) - 安全漏洞报告流程
- [📜 行为准则](CODE_OF_CONDUCT.md) - 社区行为规范

---

## 🐛 反馈与支持

### 报告问题

- [报告 Bug](https://github.com/bakahuiii/BetterBUCT/issues/new?template=bug_report.yml)
- [提出功能建议](https://github.com/bakahuiii/BetterBUCT/issues/new?template=feature_request.yml)
- [查看已知问题](https://github.com/bakahuiii/BetterBUCT/issues)

### 安全漏洞

请勿在公开 Issue 中报告安全漏洞。使用 [GitHub 私密安全通告](https://github.com/bakahuiii/BetterBUCT/security/advisories/new)提交。

### 提交规范

- **删除敏感信息**：提交日志或截图前，请删除学号、密码、Cookie、课程详情和其他个人信息
- **使用模板**：使用 Issue 模板提供完整信息
- **一事一议**：每个 Issue 只讨论一个问题

---

## 🤝 贡献

欢迎贡献代码、文档或反馈问题！

### 贡献方式

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交修改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

### 贡献准则

- 遵守 [行为准则](CODE_OF_CONDUCT.md)
- 阅读 [贡献指南](CONTRIBUTING.md)
- 运行 `npm run check` 确保所有测试通过
- 提交前删除敏感信息和签名密钥

---

## 📄 许可证

本项目采用 [MIT 许可证](LICENSE)。

```
MIT License

Copyright (c) 2024 BetterBUCT Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 🙏 致谢

- 北京化工大学提供的教务系统和北化在线平台
- 所有贡献者和用户的支持和反馈
- [Capacitor](https://capacitorjs.com/) Android 容器框架
- [React](https://react.dev/) 用户界面库
- [Tailwind CSS](https://tailwindcss.com/) 样式框架

---

## 📞 联系方式

- **GitHub Issues**: [https://github.com/bakahuiii/BetterBUCT/issues](https://github.com/bakahuiii/BetterBUCT/issues)
- **项目主页**: [https://github.com/bakahuiii/BetterBUCT](https://github.com/bakahuiii/BetterBUCT)

---

## ⚠️ 免责声明

1. BetterBUCT 是独立开源项目，与北京化工大学无官方关联
2. 使用本应用需遵守学校相关规定和服务条款
3. 本应用按"原样"提供，不提供任何形式的担保
4. 开发者不对使用本应用导致的任何问题负责
5. 校园服务变化可能影响应用功能
6. 请妥善保管账号密码，不要分享给他人

---

<div align="center">

**Made with ❤️ for BUCT Students**

[⬆ 回到顶部](#betterbuct)

</div>

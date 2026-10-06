# BetterBUCT 文档

这里是 BetterBUCT Android 项目的开发和维护文档入口。面向普通使用者的下载入口在根目录 [README.md](../README.md)；面向实现状态的事实记录在 [PROGRESS.md](PROGRESS.md)。

## 文档地图

| 文档 | 用途 |
| --- | --- |
| [开发指南](DEVELOPMENT.md) | 环境准备、依赖安装、浏览器预览、Android 构建和常见问题 |
| [架构说明](ARCHITECTURE.md) | WebView、`core/`、移动桥接、原生插件、同步和存储的数据流 |
| [发布指南](RELEASE.md) | 版本号、签名、APK 校验、GitHub Release 和真机验收 |
| [实施状态](PROGRESS.md) | 当前 Android 已完成能力、明确边界和已有验证记录 |
| [历史移植方案](mobile-native-port-plan.md) | 早期目标、技术取舍和路线图；不作为当前功能承诺 |
| [隐私政策](../PRIVACY.md) | 凭据、校园数据、网络访问和权限说明 |
| [贡献指南](../CONTRIBUTING.md) | Issue、PR、源码同步和提交安全要求 |
| [安全政策](../SECURITY.md) | 漏洞、凭据泄露和敏感数据的报告方式 |
| [行为准则](../CODE_OF_CONDUCT.md) | Issue、PR、评审和项目交流的参与规范 |

## 维护约定

- 新增或移除 Android 功能时，先更新 [PROGRESS.md](PROGRESS.md)，再更新根目录 README 的功能边界。
- 设计预留能力写入架构或历史方案文档时，要明确标注为“未开放”或“设计预留”，不要让它看起来像已上线功能。
- 发布新 APK 时，按照 [发布指南](RELEASE.md) 更新版本号、校验和 Release 说明，并在真实设备上单独记录安装、登录、通知和离线验收结果。
- 文档中的校园域名、版本号和下载链接应以当前代码或实际 Release 为准；不要把本地路径、账号、Cookie 或导出数据写入文档。

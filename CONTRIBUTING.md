# 贡献指南

感谢你有兴趣为 BetterBUCT 做出贡献！本指南将帮助你了解如何参与项目开发。

---

## 🎯 贡献方式

你可以通过以下方式为项目做出贡献：

### 1. 报告问题
- 🐛 [报告 Bug](https://github.com/bakahuiii/BetterBUCT/issues/new?template=bug_report.yml)
- 💡 [提出功能建议](https://github.com/bakahuiii/BetterBUCT/issues/new?template=feature_request.yml)
- 📖 指出文档错误或改进建议

### 2. 提交代码
- 修复 Bug
- 实现新功能
- 优化性能
- 改进 UI/UX

### 3. 完善文档
- 修正文档错误
- 补充使用说明
- 翻译文档（如有需要）
- 编写教程或示例

### 4. 测试和反馈
- 在不同设备上测试
- 提供使用反馈
- 验证 Bug 修复

---

## 📋 开始之前

### 必读文档

1. [README.md](README.md) - 项目介绍和功能说明
2. [开发指南](docs/DEVELOPMENT.md) - 环境搭建和开发流程
3. [架构说明](docs/ARCHITECTURE.md) - 技术架构和设计
4. [行为准则](CODE_OF_CONDUCT.md) - 社区行为规范
5. [安全政策](SECURITY.md) - 安全问题报告流程

### 检查现有内容

在提交新的 Issue 或 PR 之前：

- 🔍 搜索现有 Issues，避免重复
- 📖 查看 [实施状态](docs/PROGRESS.md) 了解已实现和明确不做的功能
- 💬 在 Issue 中讨论重大功能，获得反馈后再开始编码

---

## 🛠️ 开发环境搭建

### 环境要求

- **Node.js 20+**
- **JDK 17+**（构建 Android 需要）
- **Android SDK Platform 35** 和对应 Build Tools
- **Git**

### 获取代码

```bash
# Fork 仓库后克隆
git clone https://github.com/YOUR_USERNAME/BetterBUCT.git
cd BetterBUCT

# 添加上游仓库
git remote add upstream https://github.com/bakahuiii/BetterBUCT.git

# 安装依赖
cd app
npm install
```

### 验证环境

```bash
# 运行完整检查
npm run check

# 应该看到：
# ✓ TypeScript 类型检查通过
# ✓ 62 个测试全部通过
# ✓ Vite 构建成功
```

详细环境搭建见 [开发指南](docs/DEVELOPMENT.md)。

---

## 🔄 工作流程

### 1. 创建分支

```bash
# 从最新的 main 分支创建特性分支
git checkout main
git pull upstream main
git checkout -b feature/your-feature-name

# 分支命名规范：
# feature/功能名称 - 新功能
# fix/问题描述 - Bug 修复
# docs/文档主题 - 文档更新
# refactor/重构范围 - 代码重构
```

### 2. 进行开发

```bash
# 浏览器预览（前端开发）
npm run dev

# 运行测试
npm test

# 类型检查
npm run typecheck

# 构建验证
npm run build
```

**开发规范**：

- 📝 编写清晰的代码注释
- ✅ 为新功能编写测试
- 🎨 遵循现有代码风格
- 📖 更新相关文档

### 3. 提交修改

```bash
# 暂存修改
git add .

# 提交（使用清晰的提交信息）
git commit -m "feat: 添加课表导出功能

- 实现 ICS 格式导出
- 添加导出按钮到课表页面
- 增加导出功能测试
"

# 提交信息规范：
# feat: 新功能
# fix: Bug 修复
# docs: 文档更新
# style: 代码格式（不影响功能）
# refactor: 重构
# test: 测试相关
# chore: 构建/工具链更新
```

### 4. 推送和创建 Pull Request

```bash
# 推送到你的 Fork
git push origin feature/your-feature-name

# 在 GitHub 上创建 Pull Request
# 选择: your-fork:feature/your-feature-name -> bakahuiii:main
```

---

## 📝 Pull Request 指南

### PR 标题格式

```
类型: 简短描述（50 字符以内）

示例：
feat: 添加课表周视图
fix: 修复成绩页面显示错误
docs: 更新安装说明
```

### PR 描述模板

```markdown
## 变更说明
简要说明本 PR 的目的和内容。

## 变更类型
- [ ] Bug 修复
- [ ] 新功能
- [ ] 文档更新
- [ ] 代码重构
- [ ] 性能优化
- [ ] 测试补充

## 测试情况
- [ ] 所有现有测试通过
- [ ] 添加了新测试
- [ ] 在真机/模拟器上测试
- [ ] 浏览器预览测试

## 相关 Issue
Closes #123

## 截图/演示
（如果是 UI 变更，请提供截图或 GIF）

## 检查清单
- [ ] 代码遵循项目风格
- [ ] 已运行 `npm run check` 且全部通过
- [ ] 更新了相关文档
- [ ] 提交信息清晰明确
- [ ] 已删除敏感信息（学号、密码、Cookie等）
```

### PR 审查标准

你的 PR 应该：

✅ **通过所有测试** - `npm run check` 全部通过  
✅ **代码质量良好** - 遵循现有代码风格  
✅ **文档完整** - 更新相关文档和注释  
✅ **提交清晰** - 提交历史整洁，信息明确  
✅ **无敏感信息** - 不包含真实账号、密码、密钥等  

❌ **避免**：
- 混入无关修改
- 修改 `.gitignore` 中的文件
- 提交 `dist/`、`build/` 等构建产物
- 包含调试代码或 `console.log`

---

## 🧪 测试指南

### 运行测试

```bash
# 运行所有测试
npm test

# 运行特定测试文件
node --test tests/branding.test.mjs

# 测试覆盖的内容：
# - 版本一致性检查
# - 校园网络和登录
# - 数据解析和同步
# - 导入导出功能
# - 原生插件集成
```

### 编写测试

```javascript
// 使用 Node.js 内置测试框架
import test from 'node:test';
import assert from 'node:assert/strict';

test('功能描述', async () => {
  // 准备
  const input = '测试输入';
  
  // 执行
  const result = functionToTest(input);
  
  // 验证
  assert.strictEqual(result, '期望输出');
});
```

**测试要求**：
- 新功能必须有测试覆盖
- Bug 修复应添加回归测试
- 测试应该快速、独立、可重复
- 不依赖真实账号或网络（使用 mock）

---

## 📂 项目结构

```
BetterBUCT/
├── app/                        # 主应用目录
│   ├── src/                    # React 源代码
│   │   ├── mobile/            # 移动端适配层
│   │   ├── views/             # 视图组件
│   │   ├── components/        # 可复用组件
│   │   └── hooks/             # React Hooks
│   ├── android/               # Android 原生工程
│   │   └── app/src/main/java/ # 原生插件
│   ├── tests/                 # 测试文件
│   ├── package.json           # 依赖管理
│   └── vite.config.ts         # 构建配置
├── core/                      # 共享核心逻辑
│   ├── adapters/              # 数据适配器
│   └── ...
├── docs/                      # 文档
├── plugins/                   # 插件接口定义
├── README.md                  # 项目说明
├── PRIVACY.md                 # 隐私政策
├── LICENSE                    # MIT 许可证
└── package.json               # 根配置
```

### 修改范围指南

| 修改内容 | 目录 | 注意事项 |
|---------|------|---------|
| React UI | `app/src/` | 保持移动端兼容 |
| 移动适配 | `app/src/mobile/` | 不影响桌面版 |
| 原生功能 | `app/android/` | 需真机测试 |
| 数据解析 | `core/` | 保持向后兼容 |
| 测试 | `app/tests/` | 覆盖新功能 |
| 文档 | `docs/` | 保持同步 |

---

## 🎨 代码规范

### TypeScript/JavaScript

```typescript
// ✅ 好的示例
interface ScheduleItem {
  courseName: string;
  startTime: string;
  endTime: string;
}

function formatSchedule(item: ScheduleItem): string {
  return `${item.courseName} (${item.startTime}-${item.endTime})`;
}

// ❌ 避免
function fmt(i: any) {
  return i.courseName + ' ' + i.startTime;
}
```

**规范要点**：
- 使用 TypeScript 类型注解
- 函数和变量命名清晰
- 避免 `any` 类型
- 适当添加注释
- 保持一致的代码风格

### React 组件

```tsx
// ✅ 好的示例
export function ScheduleCard({ item }: { item: ScheduleItem }) {
  return (
    <div className="schedule-card">
      <h3>{item.courseName}</h3>
      <time>{item.startTime}</time>
    </div>
  );
}

// ❌ 避免
export function Card(props: any) {
  return <div>{props.item.courseName}</div>;
}
```

### Android/Java

```java
// ✅ 好的示例
@CapacitorPlugin(name = "TheiaVault")
public class TheiaVaultPlugin extends Plugin {
    @PluginMethod
    public void setSecret(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        // 实现逻辑
    }
}
```

---

## 🔒 安全注意事项

### 必须遵守

1. **不提交敏感信息**
   - ❌ 真实学号、密码
   - ❌ Cookie、Token
   - ❌ 签名密钥 (`.keystore`, `.jks`)
   - ❌ 完整的个人数据导出

2. **测试数据脱敏**
   ```javascript
   // ✅ 使用假数据
   const testData = {
     studentId: '2026000000',
     password: 'test-password-123'
   };
   
   // ❌ 不要提交真实数据
   const testData = {
     studentId: '2021123456', // 真实学号
     password: 'MyRealPassword' // 真实密码
   };
   ```

3. **凭据处理**
   - 只通过 `TheiaVaultPlugin` 读写凭据
   - 不在日志中输出密码或 Cookie
   - 导出功能不包含凭据

4. **网络安全**
   - 保持域名白名单限制
   - 不绕过 HTTPS 验证
   - 保持重定向校验

详见 [安全政策](SECURITY.md)。

---

## 📖 文档规范

### 更新时机

**必须更新文档的情况**：
- 添加或删除功能
- 修改 API 或配置
- 更改安装/构建流程
- 发现文档错误

### 文档风格

- 使用中文撰写（代码、命令除外）
- 保持专业和友好的语气
- 添加适当的标题层级
- 使用代码块标注命令和代码
- 重要提示使用引用或加粗

### 文档位置

| 内容类型 | 文件位置 |
|---------|---------|
| 项目介绍 | README.md |
| 隐私说明 | PRIVACY.md |
| 开发指南 | docs/DEVELOPMENT.md |
| 架构设计 | docs/ARCHITECTURE.md |
| 发布流程 | docs/RELEASE.md |
| 功能状态 | docs/PROGRESS.md |

---

## 🚫 明确不接受的贡献

为保持项目焦点和边界，以下贡献**不会被接受**：

1. **超出范围的功能**
   - 与校园信息无关的功能
   - 游戏化或娱乐功能
   - 社交网络功能

2. **违反隐私的功能**
   - 上传数据到第三方服务器
   - 用户追踪和分析
   - 广告集成

3. **风险功能**
   - 自动答题/考试作弊
   - 绕过学校安全措施
   - 恶意抢课工具

4. **技术债务**
   - 不遵循项目架构的代码
   - 未经测试的代码
   - 包含硬编码路径的代码

详见 [实施状态](docs/PROGRESS.md) 中的"明确不做"部分。

---

## 🤝 行为准则

参与项目即表示同意遵守 [行为准则](CODE_OF_CONDUCT.md)。

**核心原则**：
- 尊重和包容
- 专业和友善
- 建设性反馈
- 保护隐私和安全

**不可接受的行为**：
- 人身攻击或贬低
- 骚扰或歧视
- 泄露他人隐私
- 恶意破坏

---

## 💬 获取帮助

### 开发问题

- 📖 先查阅 [开发指南](docs/DEVELOPMENT.md) 和 [架构说明](docs/ARCHITECTURE.md)
- 🔍 搜索现有 Issues
- 💬 在 Issue 中提问（不要在 PR 中讨论无关问题）

### 功能讨论

- 💡 创建 Feature Request Issue
- 📋 说明使用场景和需求
- 🤔 讨论可行性和实现方案

### 安全问题

- 🔐 使用 [GitHub 私密安全通告](https://github.com/bakahuiii/BetterBUCT/security/advisories/new)
- ❌ 不要在公开 Issue 中讨论安全漏洞

---

## 📜 许可协议

提交贡献即表示同意：

1. 你的贡献将以 [MIT 许可证](LICENSE) 发布
2. 你拥有贡献内容的版权或已获得授权
3. 你的贡献不侵犯第三方权益

---

## 🏆 贡献者

感谢所有为 BetterBUCT 做出贡献的人！

贡献者列表见 [GitHub Contributors](https://github.com/bakahuiii/BetterBUCT/graphs/contributors)。

---

## 🎉 致谢

再次感谢你的贡献！每一个 PR、Issue 和反馈都让 BetterBUCT 变得更好。

---

<div align="center">

**Happy Coding! 🚀**

有问题？[提交 Issue](https://github.com/bakahuiii/BetterBUCT/issues/new)

[⬆ 回到顶部](#贡献指南)

</div>

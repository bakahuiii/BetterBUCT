# THEIA 功能移植到 BetterBUCT Android 可行性分析

## 当前 BetterBUCT Android 已有功能 ✅

1. **Dashboard 概览** - 已实现
2. **Schedule 课表** - 已实现
3. **Assignments 作业与测试** - 已实现（MobileAssignmentsView）
4. **Grades 成绩** - 已实现
5. **Exams 考试** - 已实现
6. **Notifications 通知提醒** - ✅ 刚完成（本地通知系统）
7. **Settings 设置与接入** - 已实现

---

## 可移植功能分析

### 🟢 高优先级 - 可直接移植（纯展示/计算）

#### 1. **第二课堂学分计算器** ⭐⭐⭐
**文件**: `app/src/views/tools/SecondClassCalc.tsx`

**功能**: 计算第二课堂学分（思想成长、社会实践、志愿服务、创新创业、文体活动、工作履历六大类）

**移植难度**: ⭐ 低
- 纯前端计算，无需后端
- 输入6个类别的学分，自动计算是否满足要求
- UI 简单：6个输入框 + 结果显示

**Android 限制**: 无

**价值**: ⭐⭐⭐ 高（学生毕业必需，查询频繁）

**实现建议**:
```typescript
// 新建 app/src/views/tools/SecondClassCalc.tsx
// 移植现有代码，调整移动端样式
// 添加到 ToolsView 的 mobile tabs
```

---

#### 2. **创新学分计算器** ⭐⭐⭐
**文件**: `app/src/views/tools/InnovationCalc.tsx`

**功能**: 计算创新创业学分（竞赛、专利、论文、项目等）

**移植难度**: ⭐ 低
- 纯前端计算
- 输入各类创新成果，自动计算学分

**Android 限制**: 无

**价值**: ⭐⭐⭐ 高（创新学分是毕业要求）

**当前状态**: ✅ 已在移动端可用（见 ToolsView.tsx:54）

---

#### 3. **体测成绩评分计算器** ⭐⭐
**文件**: `app/src/views/tools/FitnessCalc.tsx`

**功能**: 根据体测项目成绩计算总分

**移植难度**: ⭐ 低
- 读取本地体测数据（`state.fitness`）
- 纯前端计算评分

**Android 限制**: 无

**价值**: ⭐⭐ 中（查询频率较低，但有需求）

**当前状态**: ✅ 已在移动端可用

---

#### 4. **学业预警计算器** ⭐⭐
**文件**: `app/src/views/tools/WarningCalc.tsx`

**功能**: 根据成绩、学分、绩点计算是否触发学业预警

**移植难度**: ⭐ 低
- 纯前端计算
- 基于现有成绩数据

**Android 限制**: 无

**价值**: ⭐⭐ 中（高风险学生需要）

**实现建议**: 移植到移动端工具页

---

#### 5. **Academic Progress 学业进度** ⭐⭐⭐
**文件**: `app/src/views/AcademicProgressView.tsx`

**功能**: 
- 培养方案学分完成情况
- 课程完成百分比
- 必修/选修学分统计
- 学分要求可视化

**移植难度**: ⭐⭐ 中
- 需要读取 `state.academicProgress`
- 数据结构复杂（树形结构）
- UI 需要适配移动端（折叠/展开）

**Android 限制**: 无

**价值**: ⭐⭐⭐ 高（学生关心毕业进度）

**实现建议**:
```typescript
// 简化版：显示总学分、已完成学分、完成百分比
// 完整版：树形展示各类课程完成情况
```

---

### 🟡 中优先级 - 需适配（依赖校园服务）

#### 6. **空闲教室查询** ⭐⭐⭐
**文件**: `app/src/views/tools/FreeClassroomView.tsx`

**功能**: 查询指定时间段的空闲教室

**移植难度**: ⭐⭐ 中
- 需要调用后端 API：`GET /free-classroom`
- 数据来源：教务系统课表数据
- UI 需要时间选择器（周几、第几节）

**Android 限制**: 
- ⚠️ 需要网络连接
- ⚠️ 依赖 THEIA 本地 API 运行

**价值**: ⭐⭐⭐ 高（学习、自习常用）

**实现建议**:
```typescript
// 调用 bridge.queryFreeClassroom(params)
// 或直接 fetch(`${apiBase}/free-classroom?...`)
// 移动端 UI：时间选择器 + 结果列表
```

---

#### 7. **场馆状态查询** ⭐⭐
**文件**: `app/src/views/tools/VenueStatusView.tsx`

**功能**: 查询体育馆、图书馆等场馆开放状态

**移植难度**: ⭐⭐ 中
- 需要校园服务 API
- 可能需要爬虫或第三方数据源

**Android 限制**: 
- ⚠️ 需要网络连接
- ⚠️ 数据源不稳定

**价值**: ⭐⭐ 中（使用频率较低）

**当前状态**: ✅ 已在移动端可用（见 ToolsView.tsx:80）

---

#### 8. **Courses 我的课程** ⭐⭐
**文件**: `app/src/views/CoursesView.tsx`

**功能**: 
- 显示北化在线 THEOL 课程列表
- 课程教师、公告、资源

**移植难度**: ⭐⭐ 中
- 需要读取 `state.courses`
- UI 需要适配移动端

**Android 限制**: 无

**价值**: ⭐⭐ 中（部分学生使用 THEOL）

**实现建议**: 简化版，只显示课程列表和公告

---

### 🔴 低优先级 - 技术限制大

#### 9. **Advisor 学业顾问** ❌
**文件**: `app/src/views/AdvisorView.tsx`

**功能**: AI 驱动的学业建议、数据分析

**移植难度**: ⭐⭐⭐⭐⭐ 极高
- 需要大语言模型（LLM）
- 需要本地推理或云端 API
- 成本高、性能要求高

**Android 限制**: 
- ❌ 移动端 LLM 推理性能差
- ❌ 云端 API 成本高
- ❌ 电池消耗大

**价值**: ⭐⭐⭐ 高（但实现成本不成正比）

**建议**: 暂不移植

---

#### 10. **CourseSelection 抢课** ❌
**文件**: `app/src/views/CourseSelectionView.tsx`

**功能**: 
- 课程检索
- 教学班冲突检测
- 自动抢课执行

**移植难度**: ⭐⭐⭐⭐ 很高
- 需要持续后台运行（Android 限制严格）
- 需要定时轮询教务系统
- 需要处理验证码、登录态

**Android 限制**: 
- ❌ 后台执行时间限制（Doze 模式）
- ❌ 网络访问限制
- ❌ 电池优化影响

**价值**: ⭐⭐⭐ 高（但技术限制太大）

**建议**: 暂不移植，或仅提供"课程搜索"功能

---

#### 11. **Notices/Mailbox 通知与邮箱** ⚠️
**文件**: `app/src/views/MailboxView.tsx`, `CommunicationsView.tsx`

**功能**: 
- 校园邮箱消息
- 教务系统通知
- THEOL 课程公告

**移植难度**: ⭐⭐⭐ 高
- 需要实时同步（消息推送）
- 邮箱需要 IMAP/POP3
- 通知需要轮询

**Android 限制**: 
- ⚠️ 后台同步限制
- ⚠️ 推送需要第三方服务（FCM）

**价值**: ⭐⭐⭐ 高（但实现复杂）

**实现建议**: 
- 简化版：只显示已同步的消息列表（只读）
- 完整版：需要 WorkManager 后台同步

---

#### 12. **文档功能（校历、培养计划）** ⚠️
**文件**: `app/src/views/tools/AcademicCalendar.tsx`, `AcademicPlanView.tsx`

**功能**: 
- 查看校历 PDF
- 查看培养计划 PDF

**移植难度**: ⭐⭐ 中
- 需要 PDF 渲染
- 需要缓存管理

**Android 限制**: 
- ⚠️ PDF 渲染性能（Android WebView 支持有限）
- 可使用系统 PDF 查看器

**价值**: ⭐⭐ 中（查询频率较低）

**实现建议**: 
- 简单方案：下载 PDF，调用系统查看器
- 完整方案：内嵌 PDF.js 渲染器

---

## 推荐移植优先级

### 第一批（纯计算，无技术限制）✅
1. ✅ **第二课堂学分计算器** - 毕业必需
2. ✅ **创新学分计算器** - 已在移动端
3. **学业进度展示** - 学生高频查询
4. **学业预警计算器** - 风险预警

### 第二批（依赖本地数据）
5. **空闲教室查询** - 高频使用
6. **我的课程列表** - 扩展功能
7. **通知与邮箱（只读）** - 信息聚合

### 第三批（技术复杂）
8. **PDF 文档查看** - 需要性能测试
9. **场馆状态** - 数据源不稳定

### 不推荐移植 ❌
- **Advisor 学业顾问** - LLM 成本和性能问题
- **抢课功能** - Android 后台限制太严格

---

## 技术实施建议

### 1. 数据同步策略
```typescript
// 移动端只读本地数据，不实时同步
// 用户手动点击"同步"按钮更新数据
interface MobileDataSource {
  assignments: Assignment[];      // 作业数据
  exams: Exam[];                  // 考试数据
  grades: Grade[];                // 成绩数据
  academicProgress: AcademicProgress;  // 学业进度
  courses: Course[];              // 课程数据
  fitness: FitnessRecord[];       // 体测数据
}
```

### 2. 工具模块架构
```typescript
// app/src/views/ToolsView.tsx
const MOBILE_TOOLS = [
  { id: 'second', label: '第二课堂', component: SecondClassCalc },
  { id: 'innovation', label: '创新学分', component: InnovationCalc },
  { id: 'progress', label: '学业进度', component: AcademicProgressMobile },
  { id: 'free-classroom', label: '空闲教室', component: FreeClassroomView },
  { id: 'warning', label: '学业预警', component: WarningCalc },
];
```

### 3. API 调用适配
```typescript
// app/src/mobile/mobile-bridge.mjs
async queryFreeClassroom(params) {
  // 调用本地 THEIA API
  const response = await fetch(`${this.apiBase}/free-classroom`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return response.json();
}
```

---

## 总结

**可立即移植（无技术障碍）**:
- ✅ 第二课堂学分计算器
- ✅ 学业预警计算器
- ✅ 学业进度展示

**可移植（需适配）**:
- ⚠️ 空闲教室查询（需网络）
- ⚠️ 我的课程列表
- ⚠️ 通知邮箱（只读版）

**不推荐移植**:
- ❌ 学业顾问（LLM 限制）
- ❌ 抢课功能（后台限制）

**预估工作量**:
- 第一批：2-3 天
- 第二批：4-5 天
- 第三批：7-10 天

**建议**: 优先实现第一批纯计算类工具，快速提升应用价值。

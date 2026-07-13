# WorldForge 工程架构说明

> 状态：Frozen  
> 基线：WorldForge V6.5  
> 目标：将产品总方案收敛成Codex和开发者可直接遵守的工程结构。

## 1. 架构目标

WorldForge是单用户、本地优先的Electron桌面应用。架构重点不是服务拆分，而是：

1. 正文安全与作者控制。
2. SQLite单一数据真源。
3. AI候选与正文隔离。
4. Renderer、文件、数据库和凭据边界清晰。
5. 在2K、21:9和长篇数据规模下保持可用。
6. 首版不建设云端、多人协作、模型运行时和向量平台。

## 2. 运行时结构

```text
┌──────────────────────────────────────────┐
│ Electron Main                            │
│ 窗口 / 生命周期 / OS集成 / Core监管       │
└────────────────┬─────────────────────────┘
                 │ 受控IPC
┌────────────────▼─────────────────────────┐
│ Preload                                  │
│ 具名白名单 / Schema校验 / MessagePort桥接 │
└────────────────┬─────────────────────────┘
                 │ window.worldforge
┌────────────────▼─────────────────────────┐
│ Renderer                                 │
│ React / Tiptap / Zustand / UI临时状态     │
└────────────────┬─────────────────────────┘
                 │ Command/Event Contract
┌────────────────▼─────────────────────────┐
│ Core Service Utility Process             │
│ Use Case / SQLite / 文件 / FTS5 / AI / 备份│
└──────────────────────────────────────────┘
```

## 3. Electron Main

负责：

- 创建和恢复窗口。
- 管理显示器、系统菜单、文件选择器和外链。
- 启动、健康检查、监管和关闭Core。
- 提供操作系统凭据能力的受控代理。
- 管理应用级生命周期和单实例。

禁止：

- 执行业务SQL。
- 保存正文和设定。
- 直接组装Prompt或调用Provider。
- 向Renderer暴露通用Node能力。

## 4. Preload

负责：

- 暴露`window.worldforge`具名API。
- 对Renderer输入做第一层Zod校验。
- 转发命令并归一化响应。
- 建立和转移MessagePort。

禁止：

- 暴露原始`ipcRenderer.send`。
- 接收任意channel字符串。
- 读取项目文件、数据库和凭据。
- 保存业务状态。

## 5. Renderer

负责：

- React页面和Design Token。
- Tiptap编辑器和未提交编辑事务。
- Zustand界面状态、当前选择、抽屉和任务显示。
- 展示流式临时文本和查询结果。

禁止：

- 直接访问SQLite、文件系统、环境变量和凭据。
- 将Tiptap JSON或Zustand持久化为正文真源。
- 直接调用外部模型端点。
- 将AI流式文本直接写入Draft。

## 6. Core Service

Core是唯一业务执行层，内部划分：

```text
Command Router
├─ Project Use Cases
├─ Draft/Version/Candidate Use Cases
├─ Planning/Continuity Use Cases
├─ Search/Import/Export/Backup Use Cases
├─ AI Generation Pipeline
├─ Validation Pipeline
├─ Repository Layer
├─ Serialized Write Queue
└─ Task/Event Registry
```

### 6.1 写路径

```text
IPC命令
→ Schema校验
→ 项目与权限校验
→ Use Case
→ 单写队列
→ SQLite事务
→ 返回结果
→ 发送轻量状态事件
```

### 6.2 AI路径

```text
startGeneration
→ 创建GenerationRun
→ 组装约束包
→ Provider Adapter
→ 批量流式事件
→ 解析与Schema验证
→ 保存Candidate
→ 可选校验
```

AI路径不得绕过Candidate直接进入Draft。

## 7. Monorepo结构

```text
apps/desktop/
├── main/
├── preload/
└── renderer/
packages/
├── contracts/
├── domain/
├── core-service/
├── editor-core/
├── prompts/
└── testkit/
migrations/
├── app/
└── project/
tests/
evals/
docs/
scripts/
```

## 8. 数据权威

| 数据 | 权威来源 |
|---|---|
| 应用设置与最近项目 | `app.sqlite` |
| 正文、设定、状态、候选、版本、日记 | 项目`project.sqlite` |
| API凭据 | OS Credential Store |
| Tiptap文档 | 临时编辑视图，可由DraftBlock重建 |
| FTS、摘要、统计、缓存 | 派生数据，可重建 |
| 导出文件 | 交付副本，不反向成为项目真源 |

## 9. 并发模型

- SQLite业务写入始终串行。
- 只读查询可并行，但不得读取未提交事务中间状态。
- AI网络请求异步运行，不占用写队列。
- 流式delta只进入任务内存和Renderer临时视图。
- Candidate在完成或保存部分结果时一次持久化。
- CPU密集Diff、导入和索引任务若超过事件循环预算，应使用Worker，但不提前拆进程。

## 10. Core拆分门槛

达到任一条件并有稳定压测证据时，才评审独立AI Utility Process：

- AI期间编辑IPC P95持续高于200ms。
- 自动保存P95持续高于150ms。
- AI解析连续阻塞事件循环超过100ms。
- 取消反馈持续超过500ms。
- Candidate Diff导致编辑器持续低于50fps。

## 11. 网络边界

只有Core能够发起Provider请求。WorldForge不提供请求中转。Provider可以是：

- 本机兼容服务。
- 用户信任的局域网服务。
- 用户配置的外部API。

应用内远程页面、任意URL请求和插件网络能力均不属于V1。

## 12. UI架构

Renderer页面围绕三个工作台：

1. 规划工作台。
2. 章节写作工作台。
3. 检查与导出工作台。

新手/专业模式仅影响信息披露；沉浸写作仅是视图状态。所有模式共用同一领域模型和IPC。

## 13. 失败模型

- 输入错误：边界Schema拒绝。
- 业务冲突：返回稳定错误码和冲突数据。
- 数据库错误：事务回滚；必要时项目转只读。
- AI错误：GenerationRun失败，Draft不变。
- 导入/导出/备份错误：临时结果清理，已提交数据不受影响。
- Core异常：Main报告状态并允许安全重启。

## 14. 不建设的架构

- 本地HTTP内部服务。
- 云端后端。
- Local Runtime Manager。
- VectorSearchAdapter和向量平台。
- 独立AI Orchestrator服务。
- CRDT与多人同步。
- 插件SDK和市场。
- 完整OpenTelemetry平台。

## 15. 架构验收

- 包依赖方向符合`MODULE_BOUNDARIES.md`。
- Renderer无法直接调用Node和数据库。
- 所有业务写入可追踪到Core Use Case和事务。
- AI、搜索、摘要和日记不会成为权威真源。
- 故障注入时Draft和不可变Version保持一致。

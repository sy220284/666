# WorldForge（创世工坊）

WorldForge是面向单个作者的本地优先桌面长篇写作工作站。核心原则：作者负责裁决，AI只生成建议；所有作品、数据库、索引、日志、备份和配置保存在本机。

## 产品定位

```text
作者导演
→ 规划与设定
→ 基础正文写作
→ AI建议生成
→ 比较、融合与采用
→ 定稿与状态确认
→ 连续性维护
→ 作品检查、搜索、导出与恢复
```

AI接入只允许：

1. 本地应用直接调用用户自行配置的外部模型API。
2. 本地应用连接用户已经运行的本地兼容模型服务。

WorldForge不建设自有云端AI服务，不保存用户作品到云端，不代理模型请求。

## 五项核心不变量

1. 项目数据默认只在用户本机。
2. AI输出必须先成为建议稿或待确认设定更新建议。
3. `project.sqlite`是项目唯一权威数据源。
4. 锁定、保存序号、内容Hash、不可变历史版本、项目与路径边界由代码保证。
5. AI只能提议，作者拥有正文、已确认设定和状态的最终裁决权。

## V1.0已验证基线

M0—M4-04、M8-02与M8-04共36张独立任务已经Verified：

- Electron安全壳、Core生命周期、SQLite、Migration、IPC、TaskProtocol和测试底座。
- 项目、卷章、Tiptap中文正文、自动保存、字数、查找、历史版本和只读恢复。
- 正文补丁、保存序号、内容Hash、锁定、建议稿、差异、冲突、采用、撤销和结构恢复。
- 作品任务书、大纲、场景节拍、实体、已确认设定、动态状态、时间线、知情、伏笔、人物弧光和设定更新建议。
- FTS5公共索引、作品词典、P0—P4约束包和来源裁剪追溯。
- OpenAI兼容、Anthropic和批准Custom适配器、凭据隔离、端点安全和连接测试。
- T0/T1、快速改写、结构性改写、多建议稿融合、差异审阅和安全采用。
- 确定性、统计和AI语义作品检查、写作待办、批注与网文节奏建议。
- TXT/Markdown/DOCX安全导入导出、三轨备份、恢复副本和安全空间清理。
- 快速、完整、导入和空白四个入口；自主、混合和AI优先三条路径。
- 新手/专业模式、统一工作台、沉浸写作、状态仲裁和上下文帮助。
- Theme A安静编辑部、Theme B水墨印章、响应式、DPI、键盘、焦点和无障碍。
- Windows、macOS和Linux自用便携工件、ASAR完整性、Fuses、Hash和启动验证。
- 正式中文业务名称、精准跳转与返回、本章写作辅助、名称选择器、长章节差异审阅和关闭前安全刷新握手。

## 当前维护：M8-05

后续审计确认两类问题：

1. 全文搜索、安全替换和作品词典共享请求代次，词典保存或删除可能使在途搜索/替换无法清理等待状态。
2. Provider原始响应资源上限已经实施，但超限复用了结构化输出无效错误码。

M8-05正在完成：

- 全文搜索、安全替换、作品词典和全文索引使用独立请求通道与独立等待状态。
- 同一通道后发请求使先发响应失效，不同通道互不错误取消。
- 作品切换或页面卸载统一失效全部旧响应。
- Provider总响应限制为16 MiB，单个SSE事件限制为1 MiB。
- 超限返回独立`AI_RESPONSE_TOO_LARGE_014`，停止读取并提供作者化处理建议。
- 任务、路线、产品、IPC、Provider、安全、UI、验收和发布文档统一到当前实现。

当前正式分支：`work/m8-05-runtime-hardening-documentation-sync`。  
当前正式PR：[#229](https://github.com/sy220284/666/pull/229)。

在PR永久门禁和合并后Main Verification完成前，M8-05保持`In Progress`，不得写成已合并或已Verified。

## 核心数据关系

```text
app.sqlite
└─ 应用设置、最近作品、Provider元数据、窗口/UI偏好

project.sqlite
├─ Volume / Chapter / Draft / DraftBlock
├─ Candidate / Version / ApplyRecord
├─ ProjectBrief / PlotNode / SceneBeat
├─ Entity / CanonFact / EntityState
├─ Timeline / Knowledge / Foreshadowing / CharacterArc
├─ GenerationRun / ConstraintPackage / ValidationIssue
└─ BackupRecord / TrashEntry / Dictionary
```

AI不会直接写当前稿或权威状态：

```text
约束包
→ GenerationRun
→ 建议稿
→ 差异与冲突检查
→ 作者选择
→ 正文补丁
→ 保存序号 +1

定稿历史版本
→ state_extract GenerationRun
→ pending设定更新建议
→ 作者确认
→ 动态状态 / 弧光里程碑 / 章节尾快照
```

## 技术栈

- Electron + React + TypeScript
- Tiptap + ProseMirror
- SQLite + better-sqlite3 + FTS5
- Zustand + Zod
- Vitest + Playwright
- pnpm workspace

## V1.0任务路线

V1历史规格保留54份任务文件；当前独立执行体系共37张任务：

```text
M0—M3 Verified
→ M4-01 全文搜索 Verified
→ M4-02 约束包 Verified
→ M4-03 AI连接 Verified
→ M4-04 C0—C7核心功能 Verified
→ M8-02 C8完整体验、硬化与自用交付 Verified
→ M8-04作者体验与开发语言统一 Verified
→ M8-05运行时硬化与文档统一 In Progress
```

原M4-05—M6-06由M4-04吸收；原M7-01—M7-03、M8-01和M8-03由M8-02吸收。M8-04和M8-05是后续独立维护任务。

路线图：[`docs/roadmap/V1.0_ROADMAP.md`](./docs/roadmap/V1.0_ROADMAP.md)  
任务索引：[`docs/tasks/TASK_INDEX.md`](./docs/tasks/TASK_INDEX.md)  
需求追踪：[`docs/product/V1.0_TRACEABILITY_MATRIX.md`](./docs/product/V1.0_TRACEABILITY_MATRIX.md)

## 开发入口

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/ACTIVE_TASK.json
→ docs/tasks/ACTIVE_TASK.md
→ M8-05当前任务卡
→ 受影响专项文档
→ 现有代码、测试、Migration、IPC和追踪矩阵
```

自动化规范：[`docs/process/DEVELOPMENT_AUTOMATION.md`](./docs/process/DEVELOPMENT_AUTOMATION.md)

## 自用发布边界

V1.0仅供仓库所有者本人使用。交付形态为三平台便携包，要求原生构建、ASAR/Fuse/Hash、启动、既有作品兼容和本地数据安全。

不属于V1.0范围：

- Windows代码签名；
- macOS签名与Apple公证；
- MSI/MSIX、DMG/PKG、DEB/RPM等系统安装器；
- 自动更新以及安装、升级、卸载生命周期；
- 面向第三方、企业或应用商店的公开分发保证。

出现未签名警告时由仓库所有者本人确认。若未来面向第三方分发，必须重新立项。

## 关键文档

- [`docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`](./docs/product/WORLDFORGE_V6.5_FULL_SPEC.md)：完整产品与架构基线。
- [`docs/product/FUNCTION_CATALOG.md`](./docs/product/FUNCTION_CATALOG.md)：全功能清单。
- [`docs/product/V1_SCOPE_AND_ACCEPTANCE.md`](./docs/product/V1_SCOPE_AND_ACCEPTANCE.md)：版本范围。
- [`docs/product/SELF_USE_RELEASE_POLICY.md`](./docs/product/SELF_USE_RELEASE_POLICY.md)：自用便携交付边界。
- [`docs/INDEX.md`](./docs/INDEX.md)：文档总索引。
- [`docs/PROJECT_EXECUTION_ENTRY.md`](./docs/PROJECT_EXECUTION_ENTRY.md)：执行统一入口。
- [`docs/contracts/IPC_CONTRACTS.md`](./docs/contracts/IPC_CONTRACTS.md)：IPC契约。
- [`docs/contracts/ERROR_CODES.md`](./docs/contracts/ERROR_CODES.md)：稳定错误码。
- [`docs/ai/PROVIDER_PROTOCOL.md`](./docs/ai/PROVIDER_PROTOCOL.md)：Provider协议与资源限制。
- [`docs/ui/UI_ACCEPTANCE_CHECKLIST.md`](./docs/ui/UI_ACCEPTANCE_CHECKLIST.md)：UI验收。

## V1.5

V1.5在V1.0真实作者使用后单独立项：

- L0—L5自动分层记忆。
- 卷级连续性检查点。
- 定时AI项目日记。
- 超长篇专项适配。
- 有证据时的语义检索。

## 许可证

当前方案基线采用AGPL-3.0。若未来面向第三方分发，必须重新完成第三方依赖、许可证和分发合规审查。

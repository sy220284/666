# WorldForge 作者语言与开发术语表

> 状态：Active  
> 适用范围：应用界面、帮助、错误提示、任务卡、合并请求、提交说明、测试标题、代码注释、自动化步骤、验证记录和当前有效文档。  
> 原则：正式中文名称是业务真源；英文名称只作为内部实现标识或外部标准名称保留。

## 1. 使用规则

1. 业务概念第一次出现时使用正式中文名称；需要指向代码时，在后方以反引号补充内部标识。
2. 作者主流程不得直接显示内部类型、对象标识、数据库字段、程序内部通信名称或原始数据结构。
3. 完整模式和技术详情可以显示内部信息，但中文业务名称必须在前。
4. 任务卡、合并请求、提交说明、测试标题和开发汇报不得以英文内部名代替业务名称。
5. TypeScript类型、函数、变量、数据库表、数据库字段、错误码、文件路径和协议字段不因语言统一进行破坏性重命名。
6. 新增业务概念必须先登记正式中文名称、内部标识和适用场景。
7. 同一概念只能有一个正式中文名称，不得自行创造同义词。
8. 历史冻结文档保持原文；引用历史内容时使用当前正式中文名称并按需附内部标识。

## 2. 作品与写作

| 内部标识 | 正式中文名称 | 作者界面说明 |
|---|---|---|
| Project | 作品 | 单部小说或创作项目 |
| Workspace | 作品目录 | 作品文件和数据库所在目录 |
| Draft | 当前稿 | 当前正在编辑的正文 |
| DraftBlock | 正文块 | 正文中的段落或结构块 |
| Revision | 保存序号 | 当前稿的保存变化编号，默认不显示 |
| Version | 历史版本 | 作者主动保存的历史稿 |
| Final Version | 定稿版本 | 当前章节确认用于交付的版本 |
| Finalize | 设为定稿 | 将历史版本设为当前定稿 |
| Restore Version | 恢复为新当前稿 | 从历史版本生成新的当前稿 |
| Lock | 锁定正文块 | 保护内容不被批量修改或建议稿采用覆盖 |
| Patch | 正文修改 | 一组经过检查的正文变更 |
| Checkpoint | 恢复点 | 高风险操作前创建的安全恢复位置 |
| Named Snapshot | 命名快照 | 作者主动命名的长期备份 |
| Continuation | 继续写作位置 | 上次项目、章节、光标和滚动位置 |

## 3. AI辅助创作

| 内部标识 | 正式中文名称 | 作者界面说明 |
|---|---|---|
| Provider | AI连接 | 作者配置的本地或远程模型连接 |
| Provider Config | AI连接配置 | AI服务地址、模型和凭据设置 |
| Model | AI模型 | 具体使用的模型 |
| GenerationRun | 生成任务 | 一次AI生成过程 |
| Prompt | 生成指令 | 发送给模型的结构化写作要求 |
| Prompt Version | 生成指令版本 | 生成指令的内部版本 |
| Candidate | 建议稿 | AI生成但尚未进入当前稿的内容 |
| Skeleton Candidate | 情节骨架方案 | 可审阅和修改的章节骨架 |
| Prose Candidate | 正文建议稿 | 可比较和采用的正文内容 |
| Partial Candidate | 未完成建议稿 | 因中断或长度限制只生成一部分的内容 |
| Rewrite Candidate | 改写建议稿 | 针对选定内容生成的改写方案 |
| Merge Candidate | 融合建议稿 | 多份内容融合后的建议稿 |
| Candidate Apply | 采用建议稿 | 将作者选中的建议内容写入当前稿 |
| Candidate Discard | 丢弃建议稿 | 保留记录但不再审阅 |
| Candidate Undo | 撤销采用 | 撤回最近一次建议稿采用 |
| Stale Source | 来源已经变化 | 建议稿生成后当前稿发生了变化 |
| Structured Output | 结构化结果 | 按既定字段返回的生成结果 |
| Streaming | 逐步生成 | 内容生成时逐步显示 |
| AI Eval | AI能力验证 | 对AI输出协议和质量边界的验证 |
| T0 | 情节骨架 | 内部阶段代号，作者界面不单独显示T0 |
| T1 | 正文扩写 | 内部阶段代号，作者界面不单独显示T1 |

## 4. 规划与设定

| 内部标识 | 正式中文名称 | 作者界面说明 |
|---|---|---|
| ProjectBrief | 作品任务书 | 核心创意、阅读承诺、主角目标和长期阻力 |
| PlotNode | 大纲节点 | 卷、章或情节层级节点 |
| SceneBeat | 场景节拍 | 场景内必须发生的事件、原因和结果 |
| Canon | 已确认设定 | 作者确认生效的设定事实 |
| Entity | 设定条目 | 通用内部对象；界面按人物、地点等具体类型显示 |
| CanonFact | 已确认事实 | 人物、地点或规则的稳定事实 |
| EntityState | 动态状态 | 在特定章节范围内有效的状态 |
| StateProposal | 设定更新建议 | 根据定稿内容提取、等待作者确认的变化 |
| TimelineEvent | 时间线事件 | 作品世界中发生的事件 |
| KnowledgeState | 人物知情状态 | 人物知道、相信、怀疑、误解或不知道的信息 |
| CharacterArc | 人物成长线 | 人物长期变化路径 |
| Arc Milestone | 成长节点 | 人物成长线上的关键变化 |
| Foreshadowing | 伏笔 | 待埋、待强化或待回收的线索 |
| Evidence | 内容依据 | 支撑设定或检查结论的正文位置 |
| Authority | 修改权限 | 哪一类数据可由谁确认和修改 |

“设定条目”不作为普通页面主名称。界面按实际类型显示：人物、地点、阵营、物品、能力、世界规则、重要事件或其他设定。

## 5. 检查与修订

| 内部标识 | 正式中文名称 |
|---|---|
| Validation | 作品检查 |
| Validation Rule | 检查规则 |
| Validation Issue | 检查问题 |
| Severity | 重要程度 |
| Resolve | 标记已处理 |
| Ignore | 忽略本项 |
| Mute Rule | 停用此规则 |
| Downgrade | 降低重要程度 |
| False Positive | 标记为误报 |
| Reopen | 重新打开 |
| StoryTodo | 写作待办 |
| Comment | 审阅批注 |
| Rhythm | 连载节奏 |
| Hook | 章末悬念 |
| Golden Three | 黄金三章 |
| Excitement Density | 爽点与转折密度 |

## 6. 搜索、导入与恢复

| 内部标识 | 正式中文名称 |
|---|---|
| Search Index | 全文搜索索引 |
| FTS | 全文搜索 |
| Rebuild Index | 重建全文搜索 |
| ReplacePlan | 替换预览 |
| Eligible | 可以替换 |
| Locked | 已锁定，跳过 |
| ImportPlan | 导入预览 |
| Commit Import | 确认导入 |
| Recovery | 恢复 |
| Recovery Overview | 恢复中心 |
| Backup | 备份 |
| Daily Backup | 日常备份 |
| Major Backup | 重要操作恢复点 |
| Retention Policy | 备份保留规则 |
| Cleanup Preview | 清理预览 |
| Read-only Mode | 只读保护 |
| Migration | 数据结构升级 |
| Schema Version | 数据结构版本 |

## 7. 应用与开发结构

| 内部标识 | 正式中文名称 | 使用边界 |
|---|---|---|
| Core | 本地服务 | 作者提示可显示“本地服务”，代码继续使用Core |
| Renderer | 应用界面 | 开发文档使用“应用界面”，代码路径保留Renderer |
| Main Process | 桌面主程序 | Electron主进程的中文业务称呼 |
| Preload | 安全连接层 | 应用界面和桌面主程序之间的安全边界 |
| Bridge | 功能连接层 | 应用界面调用本地功能的连接层 |
| IPC | 程序内部通信 | 技术详情可保留IPC |
| StatusArbiter | 全局状态提示 | 汇总只读、失败和待处理状态 |
| WorkspaceAttention | 待处理事项汇总 | 汇总建议稿、设定更新和检查问题 |
| Disclosure Mode | 信息显示方式 | 简明模式和完整模式的统一状态 |
| Beginner Mode | 简明模式 | 只表达信息密度，不评价作者能力 |
| Professional Mode | 完整模式 | 展示完整功能和技术详情入口 |
| Focus Mode | 沉浸写作 | 只保留正文核心界面 |
| Onboarding | 首次使用引导 | 创建或导入作品的引导流程 |
| Route | 页面 | 应用中的功能页面 |
| Navigation Target | 跳转目标 | 精准打开章节、正文块或设定的位置 |
| Dialog | 对话框 | 需要作者确认或填写内容的浮层 |
| Evidence | 验证记录 | 测试命令、结果和受检提交记录 |
| Fixture | 测试样本 | 自动化测试使用的固定输入 |
| E2E | 完整流程测试 | 从应用启动到结果完成的桌面流程测试 |
| Quality Gate | 质量门禁 | 合并前必须通过的质量检查 |
| Performance Budget | 性能上限 | 功能必须满足的响应时间或资源限制 |
| Smoke Test | 启动检查 | 验证程序或成品能够正常启动 |

## 8. 必须保留官方名称的技术词

以下名称保留官方写法，必要时补充中文用途说明：

- TypeScript、React、Electron、SQLite、Tiptap、Playwright、Vitest；
- OpenAI、Anthropic、Ollama、LM Studio；
- Windows、macOS、Linux、GitHub Actions；
- HTTP、JSON、DOCX、Markdown、UTF-8、GB18030；
- SHA-256、ASAR、Electron Fuses。

## 9. 开发表达示例

推荐：

> 采用建议稿前检查当前稿保存序号；对应内部命令为 `candidate.apply`，字段为 `baseRevision`。

禁止：

> Candidate Apply前检查Draft Revision。

推荐测试标题：

```ts
it('当前稿发生变化时不覆盖作者新写内容', async () => {});
```

推荐错误提示：

> 当前稿在建议稿生成后已经发生变化，系统没有覆盖正文。请重新比较后再采用。

技术详情可显示：

```text
错误码：REVISION_CONFLICT
```

## 10. 新术语登记

新增业务概念时必须补充：

1. 正式中文名称；
2. 内部类型或命令；
3. 作者界面说明；
4. 允许使用的页面和文档；
5. 禁止使用的同义词；
6. 是否允许在简明模式显示；
7. 对应测试。

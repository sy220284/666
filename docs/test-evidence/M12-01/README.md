# M12-01 创作日志与长期项目复盘 Evidence

## 结论

M12-01 将创作日志实现为现有项目数据之上的**本地派生复盘层**。实现没有建立第二份故事事实、通用 Event Sourcing、`project_events`、云端 scheduler 或业务双写总线。

任务最终关闭仍以 PR #402 的 Ready Head 永久门禁、合并后 Main Verification 与 `task-verification/M12-01` 为准；本目录记录实现事实与专项验证范围，不替代 GitHub Actions 权威结果。

## 1. 确定性摘要来源映射

| 复盘字段 | 权威来源 | 查询方式 |
| --- | --- | --- |
| 写作会话、净字数、活跃时间、涉及章节 | `writing_sessions` | `project_id + last_input_at` 时间窗口 |
| 新建 Version | `versions` + chapter/volume 项目归属 | `created_at` 时间窗口 |
| 章节定稿 | `chapters.final_version_id + finalized_at` | 当前权威终稿引用 + 实际定稿时间窗口 |
| 智能运行次数/状态 | `generation_runs` | 排除 Journal 自身 AI run，按创建/结束时间窗口 |
| 作者实际采用建议稿 | `candidates` | `status=accepted + resolved_at` |
| 状态提案处理 | `state_proposals` | `resolved_at` |
| 检查问题 | `validation_issues` | `created_at / updated_at` |
| StoryTodo | `story_todos` | `created_at / completed_at` |
| StoryComment | `story_comments` | `created_at / resolved_at` |
| 灵感 | `idea_cards`、`idea_conversions` | 创建/更新时间窗口 |
| 人物关系 | `character_relationships` | `created_at / superseded_at` |
| 时间线 | `timeline_events` | `updated_at` |
| 伏笔 | `foreshadowings` | `updated_at` |
| 人物成长线 | `character_arcs`、`arc_milestones` | `updated_at` |
| 备份 | `backup_records` | `created_at` |
| 剧情进展摘要引用 | `story_digests` | 直接复用已有摘要，不回扫正文 |

Journal 只保存上述结果的确定性快照、来源 Hash/Revision、可选 AI 解释和作者备注。它不能反向修改这些权威域。

M12-01 收口阶段增加 `chapters.finalized_at`：旧项目迁移时以当前终稿 Version 的创建时间作为历史最佳锚点，此后 `final_version_id` 变化记录真实定稿时间。Version 与 VersionBlock 仍保持不可变。

专项回归：`tests/integration/journal-service.test.ts`、`tests/migration/m12-01-project-journal-migration.test.ts`。

## 2. 幂等、来源变化与分页稳定性

专项覆盖：

- 同一 `project + period type + period start + period end` 重复生成只保留一个条目。
- 来源未变化时复用条目。
- 来源变化时重算 deterministic summary/source hash，旧 AI 解释失效。
- 作者备注使用 `updated_at` 乐观并发保护，避免后台刷新覆盖作者输入。
- Journal AI run 被排除出 Journal 自身统计，避免“生成复盘改变复盘来源”形成自反馈。
- 长期列表按 `period_end DESC, id DESC` 排序，并使用 `period_end + id` 组合游标；相同周期结束时间跨页时不漏项。
- Renderer 加载更早日志时同步合并该页作者备注，避免已有备注被空编辑框覆盖。

专项回归：`tests/integration/journal-service.test.ts` 与 Journal Renderer 路径。

## 3. 定时复盘与时区

实现读取项目现有节奏配置中的 IANA `time_zone`：

- daily：补最近一个完整的本地自然日。
- weekly：补最近一个完整的本地周一至周一周期。
- DST 地区按真实当地午夜换算 UTC 边界，不把自然日硬编码为 24 小时。
- 打开可写项目时尝试补一份最近漏掉的周期；失败被吞到辅助流程，不阻塞项目打开。
- 只读项目不执行补生成写入。
- 周期唯一约束保证重复打开不会反复创建同周期日志。

专项测试：`tests/unit/journal-period.test.ts`、`tests/integration/journal-service.test.ts`。

## 4. AI 边界与状态机

Journal AI 进入现有 GenerationRun/Provider/Prompt Registry：

- `runType = journal_summarize`
- `scopeType = project`
- 不绑定 Chapter / Draft / continuation
- 不建立第二套模型调用器
- 输入仅包含 deterministic summary、source hash 与最多 12,000 字符的已有 project StoryDigest
- 不扫描全项目正文
- 输出只保存到 `project_journal_entries.ai_summary`
- 结果通过现有 `generation_result_refs` 登记为 `journal_entry`

收口加固后，Journal AI 运行状态与 GenerationRun 显式绑定：

```text
deterministic / ai_failed / ready
→ 启动 journal_summarize
→ ai_pending + generation_run_id
→ ready 或 ai_failed
```

运行启动后会持久化 `generation_run_id`；Provider、流式输出、结构化解析或结果落库失败时，Generation Runtime 仍是失败权威，同时通过辅助失败回调将对应 Journal 标记为 `ai_failed`。辅助回写失败不会覆盖 GenerationRun 的终态。

AI 完成前同时校验：

- run 为当前项目的 `journal_summarize`；
- run scope 为当前 project；
- `generation_input_sources` 中 Journal 来源 Hash 与当前 `source_hash` 一致；
- 已绑定的活动 run identity 不得被旧运行覆盖。

专项测试：`tests/unit/journal-contracts.test.ts`、`tests/integration/journal-ai-stale-result.test.ts`、`tests/integration/journal-service.test.ts`。

## 5. 来源导航

确定性快照保存最多 100 个有界导航锚点：

- 本周期写过的章节
- 本周期创建的 Version
- 本周期更新的人物/设定实体
- 本周期更新的 ValidationIssue
- 本周期更新的 IdeaCard

Renderer 将其转换为现有 `AuthorNavigationTarget`；章节、Version、Entity、Validation 与 Idea 继续走 Atomic Navigation，无第二套路由总线。

## 6. Clone / Restore

`project_journal_preferences`、`project_journal_entries` 已登记到现有 `project-clone-policy`，使用 `clone-remap`。Journal 不保存云端身份或外部文件路径；数据库快照恢复时与业务对象 ID 一起恢复。

除静态策略断言外，`tests/integration/recovery-identity-remap.test.ts` 建立实际 Journal 数据后执行 `remapProjectIdentity`，验证：

- Journal preferences 的 `project_id` 重映射到恢复副本；
- Journal entry 的 `project_id` 重映射到恢复副本；
- Journal entry identity 与作者备注保持不变；
- 恢复后 `PRAGMA foreign_key_check` 为空。

## 7. Renderer / IPC 边界

链路：

```text
JournalWorkbench
  → window.worldforgeJournal
  → trusted preload bridge
  → journal IPC
  → CoreProjectOperation
  → JournalService
```

- Renderer 无 SQLite、文件系统或凭据访问。
- Journal 主入口归入现有“人物与设定/知识”导航组。
- Ctrl/Cmd+K 只扩展现有 `COMMAND_CATALOG`，没有第二命令目录。
- 页面默认展示确定性统计；AI 是可选增强。
- 只读项目只读取 Journal。

## 8. 性能边界

实现层约束：

- 单次自定义窗口最大 366 天。
- daily/weekly 只查询对应时间窗口记录。
- 不读取 Draft/Version 正文块生成 deterministic summary。
- StoryDigest 读取已有派生摘要，不回扫正文。
- 来源导航各查询有明确 LIMIT，总量 ≤100。
- 列表默认 30 条、最大 100 条并分页。
- Provider 网络阶段沿用现有 Generation Runtime，不在 SQLite 写事务中等待网络。

新增 `tests/performance/m12-01-journal-window-performance.test.ts`：在真实 Project Migration 上写入 500 万字符不可变 Version 正文，再执行一日 Journal preview，并验证确定性 Version/定稿聚合结果。该专项的最终通过事实必须来自实际执行 `pnpm test:perf` 或包含该测试的权威验证运行，未执行时不得仅凭文件存在宣称性能通过。

## 9. 禁止能力回归

`tests/unit/journal-governance.test.ts` 固化以下边界：

- Journal 表进入现有 Clone 生命周期。
- M12-01 Migration/Core 不创建 `project_events` 或 Journal Event Bus。
- 本地补周期不引入 cron/remote scheduler 基础设施。
- 项目打开链路包含本地 Journal catch-up。

## 10. 最终验证绑定

当前 PR #402 已启用 `<!-- full-validation-draft -->`，在 Draft 阶段先执行完整风险路由验证。最终关闭时再绑定：

- implementation Head
- Ready Head
- PR #402
- Quality / Migration / Security / Reliability / Performance / E2E 权威 run
- merge commit
- `main-verification`
- `task-verification/M12-01`

在最终实现冻结前，本节不预写未来成功状态或未来提交 SHA。最终状态以仓库 Schema 2 Evidence 与 GitHub Commit Status 为准。

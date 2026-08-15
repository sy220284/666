# Project Journal 架构与权威边界

## 1. 定位

Project Journal 是长期写作项目的**派生复盘层**。它把已经存在的写作、版本、智能生成、检查、设定、灵感与恢复记录按时间窗口聚合，形成作者可读的创作时间线。

Journal 不承担正文、设定、连续性、规划、版本、检查或统计真源职责，也不要求任何既有业务域双写通用事件。

## 2. 数据流

```text
现有权威记录
  ├─ writing_sessions
  ├─ Draft / Version
  ├─ GenerationRun / Candidate
  ├─ Validation / StoryTodo / StoryComment
  ├─ Continuity / Relationship / Timeline / Foreshadowing / Arc
  ├─ IdeaCard / IdeaConversion
  ├─ Backup / Recovery
  └─ StoryDigest（有界派生输入）
        ↓ 按 period_start / period_end 有界查询
JournalService.deterministicSummary
        ↓ stable JSON + source hash / revision
project_journal_entries
        ├─ deterministic_summary_json
        ├─ author_note
        └─ optional AI summary
                 ↓
        GenerationRun(journal_summarize)
                 ↓
        Prompt Registry + Provider Runtime
                 ↓
        ai_summary / journal_entry result ref
```

## 3. 权威来源

| Journal 字段 | 实际来源 | Journal 是否成为真源 |
| --- | --- | --- |
| 写作会话、净字数、活跃时间 | `writing_sessions` | 否 |
| 新建/定稿版本 | `versions`、`chapters.final_version_id` | 否 |
| 智能运行状态 | `generation_runs` | 否 |
| 建议稿采用 | `candidates` | 否 |
| 状态提案、检查、Todo、批注 | 对应既有领域表 | 否 |
| 灵感创建与转换 | `idea_cards`、`idea_conversions` | 否 |
| 人物关系、时间线、伏笔、人物成长线 | 既有 Continuity/Narrative 表 | 否 |
| 备份 | `backup_records` | 否 |
| 剧情进展上下文 | `story_digests` | 否；仅作为已有摘要引用 |
| 作者备注 | `project_journal_entries.author_note` | 仅对 Journal 备注本身负责 |
| 智能复盘 | `project_journal_entries.ai_summary` | 否；可重建解释层 |

## 4. 幂等与过期

同一 `project + period_type + period_start + period_end` 只有一个 Journal 条目。

确定性摘要使用稳定 JSON 生成 `source_hash`。同周期再次生成时：

- 来源未变化：复用已有条目，不制造重复记录。
- 来源变化：重建 deterministic summary，更新 source hash/revision，并使旧 AI 解释失效。

作者备注使用 `updated_at` 乐观并发保护，避免后台复盘刷新覆盖作者正在保存的备注。

## 5. 定时复盘

定时设置属于项目本地配置，仅支持 `off / daily / weekly`。

- 只在本地应用运行并打开项目时补生成。
- 应用关闭期间无云端 scheduler、账号服务或远程推送。
- 打开作品时最多补上一份最近完整周期；唯一周期约束与幂等逻辑阻止重复生成。
- 周期边界使用项目节奏配置的 IANA `time_zone`；无有效配置时使用本地中文创作默认时区。
- DST 地区按当地午夜换算真实 UTC 边界，不强行假设每天固定 24 小时。
- 只读项目只读取现有 Journal，不触发补生成写入。

## 6. AI 边界

Journal AI 使用现有 Generation 基础设施：

- `runType = journal_summarize`
- `scopeType = project`
- 不绑定 Chapter、Draft 或 continuation
- 输入仅为 deterministic summary、其 source hash，以及最多 12,000 字符的现有 project StoryDigest
- 不扫描全项目正文
- 不允许 AI 写入 Canon、Continuity、Planning、Draft、Version 或 Validation
- Provider 失败不会删除或阻塞 deterministic summary

AI 输出只作为复盘解释文本。`generation_result_refs` 使用 `journal_entry` 记录结果身份，便于 GenerationRun 审计。

## 7. 导航

确定性摘要最多保存 100 个来源导航锚点，来源包括：

- 本周期写过的章节
- 本周期创建的版本
- 本周期更新的人物/设定实体
- 本周期处理的检查项
- 本周期更新的灵感

Renderer 将这些锚点转换为既有 `AuthorNavigationTarget`，继续走 Atomic Navigation，不建立第二套导航系统。

## 8. Clone / Restore

`project_journal_preferences` 与 `project_journal_entries` 纳入项目克隆策略并跟随项目身份重映射；Journal 自身不持有外部路径或云端身份。

恢复仍以项目数据库快照为边界。Journal 引用的业务对象 ID 与项目一起恢复，因此无需另建恢复协议。

## 9. 性能边界

- 单次聚合窗口最大 366 天。
- 日常/每周复盘只查询对应时间窗口记录。
- StoryDigest 直接读取已有摘要，不回扫正文。
- 导航锚点各来源有明确 LIMIT，总量上限 100。
- Journal 列表分页读取，默认每页 30、最大 100。
- AI 网络请求继续位于现有 Provider Runtime，不占用 SQLite 写队列等待网络。

## 10. 禁止事项

M12-01 不允许引入：

- `project_events` 或通用 Event Sourcing/Event Bus；
- 所有业务写路径的 Journal 双写；
- 第二套 writing session、字数、版本历史或 StoryDigest；
- 云端 Journal、云端定时器或远程推送；
- Journal → Canon/Continuity/Planning 的反向权威写入。

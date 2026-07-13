# WorldForge 数据库Schema规格

> 状态：Approved  
> 适用版本：V1.0  
> 原则：`app.sqlite`只保存应用级信息；每个项目的`project.sqlite`是唯一权威数据源。

## 1. 数据库运行参数

项目数据库初始化后执行：

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
```

所有业务写入由Core Service单写队列串行执行。

## 2. `app.sqlite`

### `app_settings`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| key | TEXT | PRIMARY KEY | 设置键 |
| value_json | TEXT | NOT NULL | JSON值 |
| updated_at | TEXT | NOT NULL | ISO时间 |

### `recent_projects`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| project_id | TEXT | PRIMARY KEY | 项目ID |
| workspace_path | TEXT | UNIQUE NOT NULL | 工作空间路径 |
| display_name | TEXT | NOT NULL | 展示名 |
| last_opened_at | TEXT | NOT NULL | 最近打开时间 |
| missing_since | TEXT | NULL | 路径失效时间 |

### `provider_configs`

只保存Provider元数据，不保存凭据正文。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | Provider ID |
| name | TEXT | 名称 |
| protocol | TEXT | `openai_compatible` / `anthropic` / `custom` |
| base_url | TEXT | 服务地址 |
| model | TEXT | 默认模型 |
| credential_ref | TEXT NULL | 系统凭据引用 |
| timeout_ms | INTEGER | 超时 |
| options_json | TEXT | 高级选项 |

## 3. `project.sqlite`核心表

### 3.1 项目与层级

#### `projects`

单项目单行。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | 项目ID |
| name | TEXT | 名称 |
| channel | TEXT | male/female/unspecified |
| active_style_profile_id | TEXT NULL | 当前文风 |
| schema_version | INTEGER | Schema版本 |
| created_at / updated_at | TEXT | 时间 |

#### `volumes`

`id, project_id, title, order_key, status, deleted_at`

#### `chapters`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | 章节ID |
| volume_id | TEXT FK | 所属卷 |
| title | TEXT | 标题 |
| order_key | TEXT | 排序键 |
| status | TEXT | pending/outlined/writing/reviewing/finalized |
| target_word_min/max | INTEGER | 目标字数 |
| active_draft_id | TEXT FK NULL | 活动Draft |
| final_version_id | TEXT FK NULL | 定稿Version |
| deleted_at | TEXT NULL | 软删除 |

#### `plot_nodes`

`id, project_id, parent_id, node_type, title, goal, core_conflict, expected_result, order_key, status`

#### `scene_beats`

`id, chapter_id, plot_node_id, order_key, goal, conflict, expected_result, scene_type, estimated_word_ratio, is_required`

关联表：`scene_beat_entities(scene_beat_id, entity_id, role)`。

### 3.2 正文、候选与版本

#### `drafts`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | Draft ID |
| chapter_id | TEXT UNIQUE FK | 每章一个活动Draft |
| revision | INTEGER | 当前Revision |
| created_at / updated_at | TEXT | 时间 |

#### `draft_blocks`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | 当前记录ID |
| draft_id | TEXT FK | Draft |
| logical_block_id | TEXT | 跨版本逻辑ID |
| order_key | TEXT | 排序 |
| block_type | TEXT | paragraph/dialogue/heading/separator |
| text | TEXT | 正文 |
| source | TEXT | manual/ai/mixed/imported |
| locked | INTEGER | 0/1 |
| content_hash | TEXT | 冲突校验 |
| revision | INTEGER | 最近修改Revision |

索引：`UNIQUE(draft_id, logical_block_id)`、`INDEX(draft_id, order_key)`。

#### `candidates`

`id, chapter_id, generation_run_id, candidate_type, base_draft_revision, completeness, status, title, created_at`

候选类型：skeleton/full/rewrite/merge。完整度：complete/partial。

#### `candidate_blocks`

`id, candidate_id, logical_block_id, order_key, block_type, text, source_block_hash`

#### `versions`

`id, chapter_id, parent_version_id, version_type, label, source_draft_revision, content_hash, created_at`

版本类型：manual/finalized/candidate_apply/recovery/import。

#### `version_blocks`

`id, version_id, logical_block_id, order_key, block_type, text, source`

业务层禁止UPDATE/DELETE已发布Version和VersionBlock。

#### `draft_patch_log`

`id, draft_id, from_revision, to_revision, patch_json, inverse_patch_json, operation_type, created_at`

用于短期撤销和采用回退；老Patch可合并为检查点。

#### `candidate_apply_records`

`id, candidate_id, draft_id, from_revision, to_revision, selected_blocks_json, checkpoint_version_id, created_at`

### 3.3 设定与连续性

#### `entities`

`id, project_id, entity_type, name, aliases_json, summary, status, created_at, updated_at`

类型：character/location/faction/item/ability/rule/event/custom。

#### `canon_facts`

`id, entity_id, fact_key, value_json, description, source_type, source_id, confirmed_at`

同实体同`fact_key`可有历史记录，但只有一条current标记。

#### `entity_states`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | 状态记录 |
| entity_id | TEXT FK | 实体 |
| state_key | TEXT | 状态键 |
| value_json | TEXT | 值 |
| valid_from_chapter_id | TEXT FK | 生效章节 |
| valid_until_chapter_id | TEXT FK NULL | 失效章节 |
| record_status | TEXT | current/historical/superseded/invalid |
| evidence_json | TEXT | 正文块证据 |
| source_version_id | TEXT FK | 来源Version |

索引：`INDEX(entity_id, state_key, record_status)`。

#### `state_proposals`

`id, chapter_id, entity_id, state_key, old_value_json, proposed_value_json, evidence_json, confidence_level, status, resolved_at`

状态：pending/accepted/edited/rejected。

#### `timeline_events`

`id, project_id, title, start_value, end_value, precision, chapter_id, location_id, description`

关联：`timeline_event_entities`、`timeline_dependencies`。

#### `knowledge_states`

`id, information_key, character_id, knowledge_status, acquired_chapter_id, source_block_id, notes`

状态：knows/believes/suspects/misunderstands/unknown。

#### `foreshadowings`

`id, project_id, title, content, status, planted_chapter_id, recycle_start_chapter_id, recycle_end_chapter_id, revealed_chapter_id, is_overdue`

关系：`foreshadowing_relations(from_id, to_id, relation_type)`，类型depends_on/blocked_by/mutually_exclusive/enhances。

#### `ending_snapshots`

`id, chapter_id UNIQUE, source_version_id, snapshot_json, content_hash, stale, created_at`

### 3.4 AI与约束

#### `generation_runs`

`id, request_id UNIQUE, chapter_id, run_type, base_draft_revision, provider_id, model, status, retry_count, started_at, completed_at, error_code, usage_json`

#### `constraint_packages`

`id, generation_run_id, content_hash, token_estimate, package_json, trim_log_json, created_at`

#### `validation_issues`

`id, chapter_id, version_id, issue_type, severity, anchor_json, expected_json, description, suggestion, source_type, status, created_at`

#### `style_profiles`

保存文风参数、来源、锁定范围和指纹；参数放`parameters_json`，避免Schema为每个指标频繁扩展。

### 3.5 搜索、笔记与日记

- `story_todos(id, target_type, target_id, title, description, status, tags_json)`
- `comments(id, target_type, target_id, block_id, content, created_at)`
- `research_notes(id, title, content, source_url, attachment_id, created_at)`
- `project_diaries(id, trigger_type, period_start, period_end, status, content_json, source_refs_json, created_at)`

AI日记是派生信息，不作为Canon或EntityState真源。

### 3.6 备份、回收站与设置

- `backup_records(id, backup_type, path, hash, verified, label, created_at, deleted_at)`
- `trash_entries(id, entity_type, entity_id, original_parent_id, original_order_key, deleted_at)`
- `project_settings(key PRIMARY KEY, value_json, updated_at)`
- `project_dictionary(term PRIMARY KEY, normalized_term, category, action, notes)`

## 4. FTS5

建议虚表：

- `fts_draft_blocks`
- `fts_version_blocks`
- `fts_entities`
- `fts_research_notes`

FTS内容由触发器或显式索引任务更新。业务表是真源；FTS可删除并完整重建。

## 5. 删除规则

- 卷、章节、场景默认软删除。
- Draft、Candidate和派生记录可按引用策略清理。
- Version默认永久保留，只有用户明确执行项目空间清理且无引用时才允许删除非定稿Version。
- Canon、状态、伏笔等存在引用时，永久删除必须先展示影响。

## 6. 事务边界

以下操作必须单事务：

1. Draft Patch与Revision递增。
2. Candidate采用与ApplyRecord。
3. Version及VersionBlock创建。
4. 状态提案解决、EntityState更新和尾快照生成。
5. 拆章、并章和跨章移动。
6. 导入提交。
7. 每个Migration。

## 7. 仍需在实现阶段冻结的细节

- UUID格式与生成库。
- `order_key`使用间隔整数还是LexoRank风格字符串。
- Patch压缩和检查点阈值。
- FTS中文分词策略。
- StyleProfile参数JSON Schema。

这些细节必须通过M0/M1 Spike和测试确定，不影响本Schema的领域边界。

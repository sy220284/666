# WorldForge V1.0 数据库Schema规格

> 状态：Frozen  
> 原则：`app.sqlite`只保存应用级信息；每项目`project.sqlite`是唯一权威数据源。

## 1. 全局约束

- 业务主键：小写带连字符UUID，由Core使用`crypto.randomUUID()`生成。
- 排序键：SQLite `INTEGER`，按64位整数使用，初始间隔1024。
- 时间：UTC ISO-8601毫秒字符串。
- 内容Hash：SHA-256，输入为标准化UTF-8语义内容。
- 所有业务写入通过Core单写队列。

项目库初始化执行：

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
```

## 2. `app.sqlite`

### 2.1 `app_settings`

`key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL`

### 2.2 `recent_projects`

| 字段           | 类型 | 约束            |
| -------------- | ---- | --------------- |
| project_id     | TEXT | PRIMARY KEY     |
| workspace_path | TEXT | UNIQUE NOT NULL |
| display_name   | TEXT | NOT NULL        |
| last_opened_at | TEXT | NOT NULL        |
| missing_since  | TEXT | NULL            |

### 2.3 `provider_configs`

| 字段                    | 类型      | 说明                                   |
| ----------------------- | --------- | -------------------------------------- |
| id                      | TEXT PK   | Provider ID                            |
| name                    | TEXT      | 名称                                   |
| protocol                | TEXT      | openai_compatible / anthropic / custom |
| base_url                | TEXT      | 服务地址                               |
| model                   | TEXT      | 默认模型                               |
| credential_ref          | TEXT NULL | OS凭据引用                             |
| timeout_ms              | INTEGER   | 超时                                   |
| options_json            | TEXT      | 高级选项                               |
| created_at / updated_at | TEXT      | 时间                                   |

不得保存凭据正文。

### 2.4 `window_preferences`

单例表，只保存应用窗口和本地显示偏好，不保存项目正文：

| 字段                                 | 类型       | 说明                              |
| ------------------------------------ | ---------- | --------------------------------- |
| singleton_id                         | INTEGER PK | 固定为1                           |
| display_id                           | TEXT       | Electron显示器ID                  |
| bounds_x_dip / bounds_y_dip          | INTEGER    | 窗口左上角DIP坐标                 |
| bounds_width_dip / bounds_height_dip | INTEGER    | 非最大化窗口DIP尺寸               |
| scale_factor                         | REAL       | 保存时显示器缩放因子，范围0.5—8.0 |
| maximized                            | INTEGER    | 0/1                               |
| workspace_alignment                  | TEXT       | center/left/right                 |
| ui_scale_percent                     | INTEGER    | 90—150，步进10                    |
| body_font_size                       | INTEGER    | 14—28 CSS px                      |
| content_width                        | TEXT       | narrow/normal/wide/adaptive       |
| updated_at                           | TEXT       | UTC ISO-8601毫秒时间              |

该表由`0002_window_preferences.sql`创建。Electron Main负责读取窗口状态并处理显示器事件，Core Service通过单写队列执行唯一持久化写入；Renderer和Main均不得直接打开`app.sqlite`。从已有Schema升级前创建经`quick_check`验证、合并WAL并设为`0600`的SQLite恢复点。

## 3. `project.sqlite`

### 3.1 迁移与项目

#### `schema_migrations`

`version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL, app_version TEXT NOT NULL`

#### `migration_journal`

用于涉及数据库外文件的可恢复迁移：

`id TEXT PK, migration_version INTEGER, stage TEXT, payload_json TEXT, status TEXT, created_at TEXT, updated_at TEXT`

#### `projects`

`id TEXT PK, name TEXT, channel TEXT, active_style_profile_id TEXT NULL, schema_version INTEGER, created_at TEXT, updated_at TEXT`

#### `project_briefs`

`id TEXT PK, project_id TEXT UNIQUE FK, concept TEXT, reading_promise TEXT, protagonist_goal TEXT, core_conflict TEXT, ending_intent TEXT, required_json TEXT, forbidden_json TEXT, updated_at TEXT`

### 3.2 卷、章与规划

#### `volumes`

`id TEXT PK, project_id TEXT FK, title TEXT, order_key INTEGER, status TEXT, deleted_at TEXT NULL`

M1-03由`migrations/project/0002_volume_chapter_lifecycle.sql`建立。当前具名契约对卷状态采用与章节一致的`pending/outlined/writing/reviewing/finalized`最小生命周期；数据库保留`TEXT`列，避免在缺少独立冻结卷状态枚举时加入不可逆约束。

#### `chapters`

| 字段                | 类型         | 说明                                         |
| ------------------- | ------------ | -------------------------------------------- |
| id                  | TEXT PK      | 章节ID                                       |
| volume_id           | TEXT FK      | 所属卷                                       |
| title               | TEXT         | 标题                                         |
| order_key           | INTEGER      | 64位整数排序键                               |
| status              | TEXT         | pending/outlined/writing/reviewing/finalized |
| target_word_min/max | INTEGER NULL | 目标字数                                     |
| active_draft_id     | TEXT FK NULL | 当前活动Draft                                |
| final_version_id    | TEXT FK NULL | 当前定稿Version                              |
| deleted_at          | TEXT NULL    | 软删除                                       |

M1-03先建立`active_draft_id`和`final_version_id`可空引用字段。M1-04通过追加Migration `0003_draft_editor.sql`建立Draft目标表并补齐`chapters.active_draft_id → drafts.id`数据库外键；`final_version_id`仍保持可空且不写入，直到M1-07建立Version目标表。

#### `plot_nodes`

`id TEXT PK, project_id TEXT FK, parent_id TEXT NULL, node_type TEXT, title TEXT, goal TEXT, core_conflict TEXT, expected_result TEXT, order_key INTEGER, status TEXT`

#### `scene_beats`

`id TEXT PK, chapter_id TEXT FK, plot_node_id TEXT NULL, order_key INTEGER, goal TEXT, conflict TEXT, expected_result TEXT, scene_type TEXT, estimated_word_ratio REAL NULL, is_required INTEGER`

关联：`scene_beat_entities(scene_beat_id, entity_id, role)`。

### 3.3 Draft、Candidate与Version

#### `drafts`

| 字段                    | 类型    | 说明            |
| ----------------------- | ------- | --------------- |
| id                      | TEXT PK | Draft ID        |
| chapter_id              | TEXT FK | 所属章节        |
| status                  | TEXT    | active/archived |
| revision                | INTEGER | 当前Revision    |
| created_at / updated_at | TEXT    | 时间            |

每章可有历史Draft，但只能有一个活动Draft：

```sql
CREATE UNIQUE INDEX uq_active_draft_per_chapter
ON drafts(chapter_id)
WHERE status = 'active';
```

`chapters.active_draft_id`必须指向该活动Draft。

#### `draft_blocks`

| 字段             | 类型      | 说明                                 |
| ---------------- | --------- | ------------------------------------ |
| id               | TEXT PK   | 记录ID                               |
| draft_id         | TEXT FK   | Draft                                |
| logical_block_id | TEXT      | 跨版本逻辑ID                         |
| order_key        | INTEGER   | 排序                                 |
| block_type       | TEXT      | paragraph/dialogue/heading/separator |
| text             | TEXT      | 正文                                 |
| attributes_json  | TEXT      | 语义属性                             |
| source           | TEXT      | manual/ai/mixed/imported             |
| locked           | INTEGER   | 0/1                                  |
| content_hash     | TEXT NULL | SHA-256                              |
| revision         | INTEGER   | 最近修改Revision                     |

索引：`UNIQUE(draft_id, logical_block_id)`、`INDEX(draft_id, order_key)`。

M1-04实现映射：新建章节在同一事务创建一个`status='active'`的Draft和一个空paragraph DraftBlock；旧v2项目第一次打开尚无Draft的章节时按需创建同样结构。`chapters.active_draft_id`、`drafts.chapter_id`和`draft_blocks.draft_id`形成数据库级归属约束，每章活动Draft由部分唯一索引保证。编辑器保存的是有序DraftBlock快照，Tiptap JSON只在Renderer内重建，不持久化为第二真源。

M1-04尚未提前实现M1-05的Block Patch、Revision递增与内容Hash：当前Draft和DraftBlock的`revision`保持0，`content_hash`明确保存为NULL；不得以占位Hash冒充已验证内容。M1-05将以追加实现替换过渡快照入口并补齐这些不变量。

#### `candidates`

M2-02由`0007_candidate_version_model.sql`建立Candidate真源：

`id TEXT PK, chapter_id TEXT FK, generation_run_id TEXT NULL, candidate_type TEXT, base_draft_id TEXT FK, base_draft_revision INTEGER, completeness TEXT, status TEXT, title TEXT, source_version_id TEXT FK NULL, content_hash TEXT, created_at TEXT, resolved_at TEXT NULL`

类型：skeleton/full/rewrite/merge；完整度：complete/partial；状态：pending/accepted/discarded。`pending`时`resolved_at`必须为空，accepted/discarded时必须非空。Core读取Candidate时重新计算每块语义Hash和Candidate聚合Hash；不匹配的数据不得进入Diff或Apply。

#### `candidate_blocks`

`id TEXT PK, candidate_id TEXT FK, logical_block_id TEXT, order_key INTEGER, block_type TEXT, text TEXT, attributes_json TEXT, beat_id TEXT NULL, source_block_hash TEXT NULL, content_hash TEXT`

同Candidate内`logical_block_id`和`order_key`分别唯一。M2-03的`candidate_block_sources(candidate_block_id, source_logical_block_id, source_order)`保存拆分、合并和来源顺序；主键防止同一来源重复，`source_order`在同块内唯一。

#### `versions`

M1-07由`migrations/project/0005_manual_versions.sql`建立不可变历史版本：

`id TEXT PK, chapter_id TEXT FK, source_draft_id TEXT FK, source_revision INTEGER, title TEXT, description TEXT, label TEXT NULL, word_count INTEGER, content_hash TEXT, created_at TEXT`

当前阶段只创建作者手动Version。Core不暴露Version或VersionBlock的UPDATE/DELETE业务命令；定稿只更新`chapters.final_version_id`和章节状态，历史Version内容保持不变。创建前必须完成Draft强制flush，并以`draft_id + baseRevision`校验当前活动Draft。

#### `backup_records`

M1-08由`migrations/project/0006_operation_recovery.sql`记录已经完成SQLite在线备份、`integrity_check`、`foreign_key_check`和SHA-256验证的重大操作恢复点：

`id TEXT PK, project_id TEXT FK, operation TEXT, backup_file_name TEXT, size_bytes INTEGER, sha256 TEXT, created_at TEXT, verified_at TEXT`

备份数据库与同名元数据保存在应用本地恢复目录，不放入项目工作区。恢复只允许生成新`.worldforge`目录和新项目ID；任何失败均清理临时副本，不覆盖源项目。

#### `version_blocks`

`version_id TEXT FK, logical_block_id TEXT, order_key INTEGER, block_type TEXT, text TEXT, attributes_json TEXT, source TEXT, locked INTEGER, content_hash TEXT`

主键为`(version_id, logical_block_id)`，同Version内`order_key`唯一。恢复历史Version时归档当前Draft，复制VersionBlock为新的活动Draft；Version及其Hash不发生变化。

#### `draft_patch_log`

`id TEXT PK, draft_id TEXT FK, request_id TEXT UNIQUE, base_revision INTEGER, committed_revision INTEGER, operations_json TEXT, before_blocks_json TEXT, after_blocks_json TEXT, created_at TEXT`

`(draft_id, committed_revision)`唯一。重复`request_id`必须在校验原baseRevision、操作集合、快照Schema与逐块语义Hash后返回该次提交的原始结果，不能把当前Draft伪装成历史提交结果，也不能把同一requestId绑定到新Patch。

#### `candidate_apply_checkpoints`

`id TEXT PK, candidate_id TEXT FK, draft_id TEXT FK, source_revision INTEGER, blocks_json TEXT, content_hash TEXT, created_at TEXT`

采用前完整DraftBlock快照与语义Hash一起保存。Preview Undo和Undo读取时必须验证Checkpoint归属、sourceRevision、快照Schema和Hash；失败时拒绝回退且不修改Draft。

#### `candidate_apply_records`

`id TEXT PK, request_id TEXT UNIQUE, candidate_id TEXT UNIQUE FK, draft_id TEXT FK, checkpoint_id TEXT UNIQUE FK, base_revision INTEGER, committed_revision INTEGER, selection_json TEXT, operations_json TEXT, inverse_operations_json TEXT, applied_blocks_json TEXT, status TEXT, applied_at TEXT, undone_revision INTEGER NULL, undone_at TEXT NULL`

状态为applied/undone。每个Candidate只能产生一个ApplyRecord；正向与inverse日志使用规范Draft Patch操作并与前后快照交叉校验。成功的Apply/Undo在重启后按原requestId返回首次提交快照，不重复写Draft。Undo把Checkpoint恢复为新的Draft Revision，并把记录原子更新为undone，不删除原应用历史。

#### `candidate_conflict_sets`

`id TEXT PK, candidate_id TEXT FK, draft_id TEXT FK, apply_record_id TEXT FK NULL, phase TEXT, attempted_revision INTEGER, current_revision INTEGER, conflicts_json TEXT, created_at TEXT, resolved_at TEXT NULL`

`phase`为apply/undo。Revision、Hash、LockGuard、结构、重复采用和`undo-stale`均持久化为ConflictSet；冲突路径不得写正文。

### 3.4 实体与连续性

#### `entities`

`id TEXT PK, project_id TEXT FK, entity_type TEXT, name TEXT, aliases_json TEXT, summary TEXT, status TEXT, created_at TEXT, updated_at TEXT`

类型：character/location/faction/item/ability/rule/event/custom。

#### `canon_facts`

`id TEXT PK, entity_id TEXT FK, fact_key TEXT, value_json TEXT, description TEXT, source_type TEXT, source_id TEXT NULL, is_current INTEGER, confirmed_at TEXT`

同实体同`fact_key`最多一条`is_current=1`。

#### `entity_states`

`id TEXT PK, entity_id TEXT FK, state_key TEXT, value_json TEXT, valid_from_chapter_id TEXT FK, valid_until_chapter_id TEXT NULL, record_status TEXT, evidence_json TEXT, source_version_id TEXT FK`

状态：current/historical/superseded/invalid。

#### `state_proposals`

| 字段                | 类型         | 说明                             |
| ------------------- | ------------ | -------------------------------- |
| id                  | TEXT PK      | 提案ID                           |
| chapter_id          | TEXT FK      | 来源章节                         |
| proposal_type       | TEXT         | entity_state/arc_milestone       |
| entity_id           | TEXT FK NULL | entity_state目标                 |
| arc_milestone_id    | TEXT FK NULL | arc_milestone目标                |
| state_key           | TEXT NULL    | 状态键                           |
| old_value_json      | TEXT NULL    | 旧值                             |
| proposed_value_json | TEXT         | 新值或节点状态                   |
| evidence_json       | TEXT         | 证据锚点                         |
| confidence_level    | TEXT         | high/medium/low                  |
| status              | TEXT         | pending/accepted/edited/rejected |
| resolved_at         | TEXT NULL    | 解决时间                         |

约束：两类目标只能填写其一；pending不得修改权威状态。

#### `timeline_events`

`id TEXT PK, project_id TEXT FK, title TEXT, start_value TEXT, end_value TEXT NULL, precision TEXT, chapter_id TEXT NULL, location_id TEXT NULL, description TEXT`

关联：`timeline_event_entities`、`timeline_dependencies`。

#### `knowledge_states`

`id TEXT PK, information_key TEXT, character_id TEXT FK, knowledge_status TEXT, acquired_chapter_id TEXT NULL, source_block_id TEXT NULL, notes TEXT`

状态：knows/believes/suspects/misunderstands/unknown。

#### `foreshadowings`

`id TEXT PK, project_id TEXT FK, title TEXT, content TEXT, status TEXT, planted_chapter_id TEXT NULL, recycle_start_chapter_id TEXT NULL, recycle_end_chapter_id TEXT NULL, revealed_chapter_id TEXT NULL, is_overdue INTEGER`

状态：planned/planted/reinforced/partially_revealed/revealed/cancelled。

#### `foreshadowing_relations`

`from_id TEXT FK, to_id TEXT FK, relation_type TEXT`

类型：depends_on/blocked_by/mutually_exclusive/enhances。

#### `ending_snapshots`

`id TEXT PK, chapter_id TEXT UNIQUE FK, source_version_id TEXT FK, snapshot_json TEXT, content_hash TEXT, stale INTEGER, created_at TEXT`

#### `character_arcs`

`id TEXT PK, entity_id TEXT FK, title TEXT, arc_type TEXT, status TEXT, description TEXT, created_at TEXT, updated_at TEXT`

状态：planning/developing/resolved。

#### `arc_milestones`

`id TEXT PK, arc_id TEXT FK, chapter_id TEXT NULL, order_key INTEGER, milestone_type TEXT, description TEXT, status TEXT, depends_on_json TEXT, resolved_at TEXT NULL`

状态：planned/hit/skipped。状态变化必须经`state_proposals(proposal_type='arc_milestone')`确认。

### 3.5 AI、Prompt与校验

#### `generation_runs`

| 字段                      | 类型         | 说明                                                  |
| ------------------------- | ------------ | ----------------------------------------------------- |
| id                        | TEXT PK      | Run ID                                                |
| request_id                | TEXT UNIQUE  | 幂等ID                                                |
| chapter_id                | TEXT FK NULL | 章节                                                  |
| run_type                  | TEXT         | skeleton/chapter/rewrite/merge/validate/state_extract |
| base_draft_revision       | INTEGER NULL | 基线                                                  |
| provider_id               | TEXT         | Provider                                              |
| model                     | TEXT         | 模型                                                  |
| prompt_id                 | TEXT         | Prompt ID                                             |
| prompt_version            | INTEGER      | Prompt版本                                            |
| constraint_hash           | TEXT         | 约束包Hash                                            |
| snapshot_source           | TEXT NULL    | snapshot/fallback_live_query/none                     |
| status                    | TEXT         | queued/running/succeeded/failed/cancelled             |
| retry_count               | INTEGER      | 重试数                                                |
| started_at / completed_at | TEXT         | 时间                                                  |
| error_code                | TEXT NULL    | 错误码                                                |
| usage_json                | TEXT         | Token统计                                             |

#### `constraint_packages`

`id TEXT PK, generation_run_id TEXT UNIQUE FK, content_hash TEXT, token_estimate INTEGER, package_json TEXT, trim_log_json TEXT, created_at TEXT`

#### `model_support_profiles`

`id TEXT PK, provider_id TEXT, model TEXT, task_type TEXT, prompt_id TEXT, prompt_version INTEGER, status TEXT, evaluated_at TEXT NULL, fixture_set_version TEXT NULL, metrics_json TEXT, limitations_json TEXT`

唯一键：`provider_id, model, task_type, prompt_id, prompt_version`。

#### `validation_issues`

`id TEXT PK, chapter_id TEXT NULL, version_id TEXT NULL, issue_type TEXT, severity TEXT, anchor_json TEXT, expected_json TEXT, description TEXT, suggestion TEXT, source_type TEXT, status TEXT, created_at TEXT`

#### `style_profiles`

`id TEXT PK, project_id TEXT FK, name TEXT, source TEXT, channel TEXT, locked INTEGER, parameters_json TEXT, created_at TEXT, updated_at TEXT`

#### `genre_rhythm_profiles`

`id TEXT PK, project_id TEXT UNIQUE FK, channel TEXT, hook_density_target_json TEXT, chapter_ending_hook_required INTEGER, update_pace_target_words INTEGER, golden_chapters_threshold_json TEXT, enabled INTEGER, updated_at TEXT`

RHY结果为P3建议级，不写入阻断严重度。

### 3.6 修订、搜索与设置

- `story_todos(id, target_type, target_id, title, description, status, tags_json, source_issue_id, created_at, updated_at)`
- `comments(id, target_type, target_id, block_id, content, created_at, updated_at)`
- `project_dictionary(term PRIMARY KEY, normalized_term, category, action, notes)`
- `project_settings(key PRIMARY KEY, value_json, updated_at)`
- `search_index_queue(id TEXT PK, target_type TEXT, target_id TEXT, operation TEXT, status TEXT, created_at TEXT, updated_at TEXT)`

研究笔记、附件和项目日记属于P1/V1.5，V1.0 P0初始Schema不预建相关表。

### 3.7 备份与回收站

- `backup_records(id, project_id, operation, backup_file_name, size_bytes, sha256, created_at, verified_at)`
- `trash_entries(id, entity_type, entity_id, original_parent_id, original_order_key INTEGER, deleted_at)`

`0002_volume_chapter_lifecycle.sql`仅允许`volume/chapter`两类最小回收记录，并对`(entity_type, entity_id)`去重。软删除对象仍保留在权威业务表；恢复在Core单事务内重新分配同级64位排序键并删除对应TrashEntry。

`0009_structure_operation_recovery.sql`扩展恢复点操作为`move-blocks/permanent-delete`。永久删除预览统计卷、章、Draft、DraftBlock、Version与Candidate；存在Version或Candidate引用时拒绝执行。无阻断引用时，Core先创建已验证恢复点，再按PatchLog→DraftBlock→Draft→Chapter→Volume的引用顺序在单事务内清理。

拆章和跨章移动保留被移动块的`logicalBlockId`，源/目标Draft分别写入`draft_patch_log`并递增一次Revision。合章将源正文复制到目标Draft后把源章移入回收站，因而原章仍可恢复；历史Version/VersionBlock始终不更改。

## 4. FTS5

V1.0使用：

- `fts_draft_blocks`
- `fts_version_blocks`
- `fts_entities`

正文与中文长文本优先使用FTS5 `trigram` tokenizer。少于3字符的查询使用标准化LIKE、精确别名或短词索引。

FTS由显式`search_index_queue`更新；失败只标记索引stale，不回滚已提交正文。FTS可以删除并完整重建。

## 5. 删除与不可变规则

- 卷、章节和SceneBeat默认软删除。
- Draft可归档；活动Draft由部分唯一索引约束。
- Candidate和派生数据按引用与空间策略清理。
- Version和VersionBlock无业务UPDATE路径；定稿Version默认不可删除。
- Canon、状态、伏笔和弧光存在引用时，永久删除必须展示影响。

## 6. 强制事务边界

1. Draft Patch与Revision递增。
2. Candidate采用、ApplyRecord和必要Checkpoint。
3. Version及VersionBlock创建。
4. StateProposal解决与EntityState或ArcMilestone更新。
5. EndingSnapshot生成。
6. 拆章、并章和跨章移动。
7. 导入提交。
8. 每个Migration。

## 7. 实现同步要求

任何Schema变化必须同步：

- 数据字典。
- Migration和兼容策略。
- IPC输入输出Schema。
- Repository与事务测试。
- 追踪矩阵和任务卡。

## M1-09 导入导出事务映射

M1-09不新增Schema。确认导入复用`volumes`、`chapters`、`drafts`、`draft_blocks`、`versions`、`version_blocks`及M1-08的`backup_records`：

1. 预览阶段不执行数据库写入。
2. 确认前先创建`operation='import'`的已验证恢复点。
3. 新卷、章节、活动Draft、`source='imported'`块和“导入基线”Version在同一Core写事务提交。
4. 失败时业务写入整体回滚；已验证恢复点保留。
5. 导出只读取`versions/version_blocks`，不读取可能继续变化的活动Draft。

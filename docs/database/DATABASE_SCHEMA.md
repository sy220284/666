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

M1-03先建立`active_draft_id`和`final_version_id`可空引用字段。M1-04通过追加Migration `0003_draft_editor.sql`建立Draft目标表并补齐`chapters.active_draft_id → drafts.id`数据库外键；M1-07建立Version后补齐定稿引用语义。

#### `plot_nodes`

`id TEXT PK, project_id TEXT FK, parent_id TEXT NULL, node_type TEXT, title TEXT, goal TEXT, core_conflict TEXT, expected_result TEXT, order_key INTEGER, status TEXT`

#### `scene_beats`

`id TEXT PK, project_id TEXT FK, chapter_id TEXT FK, plot_node_id TEXT NULL, title TEXT, goal TEXT, core_conflict TEXT, expected_result TEXT, beat_type TEXT, word_target_percent INTEGER, is_required INTEGER, order_key INTEGER, character_ids_json TEXT, location_ids_json TEXT, deleted_at TEXT NULL, updated_at TEXT`

关联：`scene_beat_block_links`、`scene_beat_entities`。

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

新建章节在同一事务创建一个`status='active'`的Draft和一个空paragraph DraftBlock。`chapters.active_draft_id`、`drafts.chapter_id`和`draft_blocks.draft_id`形成数据库级归属约束。编辑器保存有序DraftBlock快照，Tiptap JSON只在Renderer内重建，不持久化为第二真源。

#### `candidates`

M2-02由`0007_candidate_version_model.sql`建立Candidate真源：

`id TEXT PK, chapter_id TEXT FK, generation_run_id TEXT NULL, candidate_type TEXT, base_draft_id TEXT FK, base_draft_revision INTEGER, completeness TEXT, status TEXT, title TEXT, source_version_id TEXT FK NULL, content_hash TEXT, created_at TEXT, resolved_at TEXT NULL`

类型：skeleton/full/rewrite/merge；完整度：complete/partial；状态：pending/accepted/discarded。`pending`时`resolved_at`必须为空，accepted/discarded时必须非空。Core读取Candidate时重新计算逐块语义Hash和Candidate聚合Hash；不匹配的数据不得进入Diff或Apply。

#### `candidate_blocks`

`id TEXT PK, candidate_id TEXT FK, logical_block_id TEXT, order_key INTEGER, block_type TEXT, text TEXT, attributes_json TEXT, beat_id TEXT NULL, source_block_hash TEXT NULL, content_hash TEXT`

同Candidate内`logical_block_id`和`order_key`分别唯一。`candidate_block_sources(candidate_block_id, source_logical_block_id, source_order)`保存拆分、合并和来源顺序；主键防止同一来源重复。

#### `versions`

M1-07由`migrations/project/0005_manual_versions.sql`建立不可变历史版本：

`id TEXT PK, chapter_id TEXT FK, source_draft_id TEXT FK, source_revision INTEGER, title TEXT, description TEXT, label TEXT NULL, word_count INTEGER, content_hash TEXT, created_at TEXT`

Core不暴露Version或VersionBlock的UPDATE/DELETE业务命令；定稿只更新`chapters.final_version_id`和章节状态。创建前必须完成Draft强制flush，并以`draft_id + baseRevision`校验当前活动Draft。

#### `version_blocks`

`version_id TEXT FK, logical_block_id TEXT, order_key INTEGER, block_type TEXT, text TEXT, attributes_json TEXT, source TEXT, locked INTEGER, content_hash TEXT`

主键为`(version_id, logical_block_id)`，同Version内`order_key`唯一。恢复历史Version时归档当前Draft，复制VersionBlock为新的活动Draft；Version及其Hash不发生变化。

#### `draft_patch_log`

`id TEXT PK, draft_id TEXT FK, request_id TEXT UNIQUE, base_revision INTEGER, committed_revision INTEGER, operations_json TEXT, before_blocks_json TEXT, after_blocks_json TEXT, created_at TEXT`

`(draft_id, committed_revision)`唯一。重复`request_id`必须在校验原baseRevision、操作集合、快照Schema与逐块语义Hash后返回该次提交的原始结果。

#### `backup_records`

`id TEXT PK, project_id TEXT FK, operation TEXT, backup_file_name TEXT, size_bytes INTEGER, sha256 TEXT, created_at TEXT, verified_at TEXT`

备份数据库与同名元数据保存在应用本地恢复目录。恢复只允许生成新`.worldforge`目录和新项目ID；失败清理临时副本，不覆盖源项目。

#### `candidate_apply_checkpoints`

`id TEXT PK, candidate_id TEXT FK, draft_id TEXT FK, source_revision INTEGER, blocks_json TEXT, content_hash TEXT, created_at TEXT`

采用前完整DraftBlock快照与语义Hash一起保存。Preview Undo和Undo读取时必须验证Checkpoint归属、sourceRevision、快照Schema和Hash。

#### `candidate_apply_records`

`id TEXT PK, request_id TEXT UNIQUE, candidate_id TEXT UNIQUE FK, draft_id TEXT FK, checkpoint_id TEXT UNIQUE FK, base_revision INTEGER, committed_revision INTEGER, selection_json TEXT, operations_json TEXT, inverse_operations_json TEXT, applied_blocks_json TEXT, status TEXT, applied_at TEXT, undone_revision INTEGER NULL, undone_at TEXT NULL`

状态为applied/undone。Apply、Checkpoint、Patch日志、Revision递增、ApplyRecord和Candidate状态在同一事务提交；Undo创建新的Draft Revision，不删除原应用历史。

#### `candidate_conflict_sets`

`id TEXT PK, candidate_id TEXT FK, draft_id TEXT FK, apply_record_id TEXT FK NULL, phase TEXT, attempted_revision INTEGER, current_revision INTEGER, conflicts_json TEXT, created_at TEXT, resolved_at TEXT NULL`

`phase`为apply/undo。Revision、Hash、LockGuard、结构、重复采用和`undo-stale`均持久化为ConflictSet；冲突路径不得写正文。

### 3.4 实体与连续性

#### `entities`

`id TEXT PK, project_id TEXT FK, entity_type TEXT, name TEXT, aliases_json TEXT, summary TEXT, status TEXT, archived_at TEXT NULL, created_at TEXT, updated_at TEXT`

类型：character/location/faction/item/ability/rule/event/custom。状态为active/archived；归档时间与状态必须一致。同项目、同类型、同规范化名称只允许一个active实体。

#### `canon_facts`

`id TEXT PK, project_id TEXT FK, entity_id TEXT FK, fact_key TEXT, value_json TEXT, description TEXT, source_type TEXT, source_id TEXT NULL, status TEXT, confirmed_at TEXT, superseded_at TEXT NULL, created_at TEXT`

状态为current/historical。部分唯一索引保证同实体同`fact_key`最多一条current；作者确认新值时，旧current在同一事务转为historical并记录`superseded_at`。Core仅接受author权限。

#### `scene_beat_entities`

`project_id TEXT FK, scene_beat_id TEXT FK, entity_id TEXT FK, role TEXT, created_at TEXT`

主键为`(scene_beat_id, entity_id, role)`。SceneBeat与Entity使用包含`project_id`的复合外键，跨项目引用在SQLite层阻断。

#### `entity_states`

由`0013_state_timeline_knowledge.sql`建立：

`id TEXT PK, project_id TEXT FK, entity_id TEXT, state_key TEXT, value_json TEXT, valid_from_chapter_id TEXT FK, valid_until_chapter_id TEXT FK NULL, record_status TEXT, evidence_json TEXT, source_version_id TEXT FK, created_at TEXT, superseded_at TEXT NULL`

约束与语义：

- `(entity_id, project_id)`复合外键绑定同项目Entity。
- `value_json`必须为合法JSON；`evidence_json`必须为JSON数组。
- `record_status`为`current/historical/superseded/invalid`。
- 部分唯一索引`idx_entity_states_current(entity_id, state_key) WHERE record_status='current'`保证同实体同状态键只有一个current。
- 章节有效区间为`[valid_from_chapter_id, valid_until_chapter_id)`；终点为空表示持续有效。
- current记录的`superseded_at`必须为空；其他状态必须有`superseded_at`。
- `source_version_id`必须属于同项目不可变Version；EvidenceAnchor由Core校验项目归属。

#### `timeline_events`

`id TEXT PK, project_id TEXT FK, title TEXT, start_value TEXT, end_value TEXT NULL, precision TEXT, chapter_id TEXT FK NULL, location_id TEXT, description TEXT, status TEXT, archived_at TEXT NULL, created_at TEXT, updated_at TEXT`

约束与语义：

- `precision`为`exact/day/month/year/approximate/unknown`。
- `status`为`active/archived`，归档时间与状态必须一致。
- `(id, project_id)`唯一，`location_id + project_id`通过复合外键绑定同项目Location Entity。
- 仅对可比较时间范围执行确定性冲突；`approximate/unknown`不伪造硬顺序。

#### `timeline_event_entities`

`project_id TEXT FK, event_id TEXT, entity_id TEXT, role TEXT, created_at TEXT`

`WITHOUT ROWID, STRICT`。主键为`(event_id, entity_id, role)`；角色为`participant/witness/subject`。Event和Entity都通过包含`project_id`的复合外键阻断跨项目引用。

#### `timeline_event_dependencies`

`project_id TEXT FK, event_id TEXT, dependency_event_id TEXT, created_at TEXT`

`WITHOUT ROWID, STRICT`。主键为`(event_id, dependency_event_id)`；两端均绑定同项目TimelineEvent，并由CHECK拒绝自依赖。Core额外拒绝依赖循环和确定性逆序。

#### `knowledge_states`

`id TEXT PK, project_id TEXT FK, information_key TEXT, character_id TEXT, knowledge_status TEXT, valid_from_chapter_id TEXT FK, valid_until_chapter_id TEXT FK NULL, source_version_id TEXT FK NULL, source_logical_block_id TEXT NULL, notes TEXT, record_status TEXT, created_at TEXT, superseded_at TEXT NULL`

约束与语义：

- `(character_id, project_id)`复合外键绑定同项目Character Entity。
- `knowledge_status`为`knows/believes/suspects/misunderstands/unknown`。
- `record_status`为`current/historical/invalid`。
- 部分唯一索引`idx_knowledge_states_current(character_id, information_key) WHERE record_status='current'`保证同人物同信息键只有一个current。
- 章节有效区间使用同一半开语义。
- `source_version_id`与`source_logical_block_id`至少一个非空；Version归属由数据库和Core校验，logicalBlock使用稳定逻辑ID。
- current记录的`superseded_at`必须为空；其他状态必须有`superseded_at`。

#### `state_proposals`

由`0016_state_proposal_snapshot.sql`建立，`0017_state_proposal_valid_until.sql`追加有限期终点：

`id TEXT PK, project_id TEXT FK, chapter_id TEXT FK, source_version_id TEXT FK, proposal_type TEXT, source TEXT, entity_id TEXT NULL, state_key TEXT NULL, arc_milestone_id TEXT NULL, previous_value_json TEXT NULL, proposed_value_json TEXT, evidence_json TEXT, confidence REAL, status TEXT, resolved_value_json TEXT NULL, valid_until_chapter_id TEXT FK NULL, created_at TEXT, resolved_at TEXT NULL`

约束与语义：

- `proposal_type`为`entity_state/arc_milestone`；两类目标严格互斥，ArcMilestone提案不得设置`valid_until_chapter_id`。
- `source`为`rule/provider_stub`，`confidence`范围为0—1。
- `proposed_value_json`与可选`resolved_value_json`必须为合法JSON；Evidence必须为非空JSON数组。
- `status`为`pending/accepted/edited/rejected`；pending必须没有解决时间和最终值。
- EntityState提案的非空终点必须是同项目活动章节，并严格位于提案起始章节之后；区间采用`[chapter_id, valid_until_chapter_id)`半开语义。
- 部分唯一索引分别保证同章节、同来源Version、同Entity状态键或同ArcMilestone最多一条pending提案。
- pending只写候选账本，不修改EntityState或ArcMilestone；作者批量裁决与权威状态更新在单事务完成，`accept/edit_accept`均将终点写入`entity_states.valid_until_chapter_id`。

#### `foreshadowings`

由`0014_foreshadowing_character_arc.sql`建立：

`id TEXT PK, project_id TEXT FK, title TEXT, description TEXT, status TEXT, reveal_from_chapter_id TEXT FK NULL, reveal_by_chapter_id TEXT FK NULL, created_at TEXT, updated_at TEXT`

约束与语义：

- 状态为`planned/planted/reinforced/partially_revealed/revealed/cancelled`。
- 回收窗口按项目内章节顺序校验；起点不得晚于终点。
- `(id, project_id)`唯一，关系表通过复合外键阻断跨项目引用。
- Core拒绝非法状态流转、依赖循环、自依赖和已激活互斥冲突。

#### `foreshadowing_chapters`

`project_id TEXT FK, foreshadowing_id TEXT, chapter_id TEXT FK, role TEXT, created_at TEXT`

`WITHOUT ROWID, STRICT`。主键为`(foreshadowing_id, chapter_id, role)`；角色为`plant/reinforce/partial_reveal/reveal/reference`。

#### `foreshadowing_relations`

`project_id TEXT FK, source_foreshadowing_id TEXT, target_foreshadowing_id TEXT, relation_kind TEXT, created_at TEXT`

`WITHOUT ROWID, STRICT`。主键为`(source_foreshadowing_id, target_foreshadowing_id, relation_kind)`；类型为`depends_on/blocks/mutually_exclusive/reinforces`。数据库拒绝自关联，Core额外校验依赖环与互斥激活冲突。

#### `ending_snapshots`

由`0016_state_proposal_snapshot.sql`建立：

`id TEXT PK, project_id TEXT FK, chapter_id TEXT FK, source_version_id TEXT FK, status TEXT, content_json TEXT, stale_reasons_json TEXT, created_at TEXT, stale_at TEXT NULL`

约束与语义：

- `status`为`valid/stale`；valid没有`stale_at`，stale必须记录失效时间。
- `(chapter_id, source_version_id)`唯一；部分唯一索引保证同项目同章节最多一条valid快照。
- `content_json`保存已确认EntityState、KnowledgeState、Foreshadowing和ArcMilestone最小入口。
- 快照缺失或stale时读取返回`fallback_live_query`并直查权威当前表，不把旧快照当作有效输入。

#### `derived_invalidations`

由`0016_state_proposal_snapshot.sql`建立：

`id TEXT PK, project_id TEXT FK, source_chapter_id TEXT FK, source_version_id TEXT FK, target_chapter_id TEXT FK NULL, scope TEXT, change_type TEXT, created_at TEXT`

`scope`为`continuity/arc/timeline/foreshadowing/validation/cache`；`change_type`为`entity_state/arc_milestone/event/timeline/foreshadowing`。旧章语义变化只记录并使后续章节派生快照失效；纯`prose`修改不写入该表，也不触发状态级联。

#### `character_arcs`

`id TEXT PK, project_id TEXT FK, character_id TEXT, title TEXT, arc_type TEXT, custom_type TEXT NULL, status TEXT, author_intent TEXT, created_at TEXT, updated_at TEXT`

类型为`growth/darkening/awakening/fall/redemption/custom`；状态为`planned/active/completed/abandoned`。自定义类型仅允许在`arc_type='custom'`时填写；Character通过复合外键绑定同项目活动人物。

#### `arc_milestones`

`id TEXT PK, project_id TEXT FK, arc_id TEXT, title TEXT, description TEXT, sort_index INTEGER, planned_chapter_id TEXT FK NULL, actual_chapter_id TEXT FK NULL, status TEXT, confirmation_source TEXT NULL, created_at TEXT, updated_at TEXT`

状态为`planned/hit/skipped`，确认来源为`author/state_proposal`。planned必须没有实际章节和确认来源；hit/skipped必须具有确认来源。同一Arc内`sort_index`唯一，列表按`sort_index, id`确定性排序。

#### `arc_milestone_dependencies`

`project_id TEXT FK, milestone_id TEXT, dependency_milestone_id TEXT, created_at TEXT`

主键为`(milestone_id, dependency_milestone_id)`；两端绑定同项目节点并拒绝自依赖。Core拒绝依赖循环，命中节点前要求前置节点已hit。

#### `arc_milestone_timeline_dependencies`

`project_id TEXT FK, milestone_id TEXT, timeline_event_id TEXT, created_at TEXT`

主键为`(milestone_id, timeline_event_id)`；节点与TimelineEvent均通过复合外键绑定同项目。

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
- `search_index_queue(id TEXT PK, target_type TEXT, target_id TEXT, operation TEXT, status TEXT, created_at, updated_at)`

研究笔记、附件和项目日记属于P1/V1.5，V1.0 P0初始Schema不预建相关表。

### 3.7 备份与回收站

- `backup_records(id, project_id, operation, backup_file_name, size_bytes, sha256, created_at, verified_at)`
- `trash_entries(id, entity_type, entity_id, original_parent_id, original_order_key INTEGER, deleted_at)`

`0002_volume_chapter_lifecycle.sql`仅允许`volume/chapter`两类最小回收记录，并对`(entity_type, entity_id)`去重。软删除对象仍保留在权威业务表；恢复在Core单事务内重新分配同级64位排序键并删除对应TrashEntry。

`0009_structure_operation_recovery.sql`扩展恢复点操作为`move-blocks/permanent-delete`。永久删除预览统计卷、章、Draft、DraftBlock、Version与Candidate；存在Version或Candidate引用时拒绝执行。无阻断引用时，Core先创建已验证恢复点，再按引用顺序在单事务内清理。

`0010_project_brief_outline.sql`建立`project_briefs`与`plot_nodes`。ProjectBrief按项目唯一保存；PlotNode使用自引用父级、64位整数orderKey、同级唯一顺序，并通过复合外键阻断跨项目挂接。

`0011_scene_beats.sql`建立`scene_beats`与`scene_beat_block_links`。正文关联只指向DraftBlock，删除SceneBeat会清理关联，正文表不会被SceneBeat级联删除。

`0012_entity_canon.sql`建立`entities`、`canon_facts`与`scene_beat_entities`，项目Schema升级为12。跨项目引用、重复current和带引用永久删除由数据库与Core双层阻断。

`0013_state_timeline_knowledge.sql`建立`entity_states`、`timeline_events`、`timeline_event_entities`、`timeline_event_dependencies`与`knowledge_states`，项目Schema升级为13。五张表均为STRICT；两张关系表为WITHOUT ROWID；当前状态/知情记录使用部分唯一索引；项目复合外键阻断跨项目人物、地点、事件和来源引用。

`0014_foreshadowing_character_arc.sql`建立伏笔、人物弧光、弧光节点与依赖关系，项目Schema升级为14。状态机、章节回收窗口、依赖环与互斥由数据库约束和Core共同校验。

`0015_scene_beat_entity_truth.sql`统一SceneBeat人物/地点引用关系，项目Schema升级为15。关系表成为权威真源，旧JSON镜像由触发器同步，跨项目、类型错误和归档引用在数据库层阻断。

`0016_state_proposal_snapshot.sql`建立`state_proposals`、`ending_snapshots`与`derived_invalidations`，项目Schema升级为16。pending提案保持非权威；作者裁决、权威状态更新与尾快照重建使用单事务；纯文字修订不传播，语义变化只使后续派生数据stale。

拆章和跨章移动保留被移动块的`logicalBlockId`，源/目标Draft分别写入`draft_patch_log`并递增一次Revision。历史Version/VersionBlock始终不更改。

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
- Canon、EntityState、KnowledgeState和TimelineEvent使用保留历史的失效/归档命令，不以物理删除替代历史账本。
- 伏笔和弧光存在引用时，永久删除必须展示影响。

## 6. 强制事务边界

1. Draft Patch与Revision递增。
2. Candidate采用、ApplyRecord和必要Checkpoint。
3. Version及VersionBlock创建。
4. EntityState新值写入、旧current历史化与章节终点更新。
5. KnowledgeState新值写入、旧current历史化与章节终点更新。
6. TimelineEvent本体、人物关系和依赖关系保存。
7. StateProposal批量裁决、EntityState或ArcMilestone更新与EndingSnapshot重建。
8. 旧章语义变化的后续Snapshot失效与DerivedInvalidation记录。
9. 拆章、并章和跨章移动。
10. 导入提交。
11. 每个Migration。

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

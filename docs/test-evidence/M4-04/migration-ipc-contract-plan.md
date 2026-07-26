# M4-04 Migration、IPC与共享合同总计划

> 状态：编码前冻结；C1—C6 按实际纵向实现校准
>
> 原则：历史Migration不修改；新增表必须在同一内部阶段出现真实消费方；所有业务写入继续进入Core单写队列。

## 1. 已发现合同冲突

| 冲突                                                    | 处理决定                                               |
| ------------------------------------------------------- | ------------------------------------------------------ |
| ModelSupport代码为`untested`，冻结规格为`unverified`    | 新写入统一`unverified`；兼容解析历史`untested`并归一化 |
| Candidate枚举含Skeleton，Document强制至少一个Block      | 改为Skeleton/Prose判别联合；历史Prose数据保持可读      |
| TaskProtocol只有`resultIds/candidateIds`                | 增加可选`GenerationResultRef`；旧字段保留兼容读取      |
| StateProposal来源CHECK不含`provider`                    | 通过表重建加入`provider`及Batch外键，明确数据映射      |
| Search Core存在但无正式IPC                              | 扩展现有Search合同和Utility Project路由                |
| IPC规格使用transfer/backup命名，代码已有textIo/recovery | 保留现有服务和通道族，增加兼容命令，不建立平行协调器   |

## 2. Migration序列

### `0022_project_settings_continuation.sql`

- 建立`project_settings(key, value_json, updated_at)`。
- 保存最后活动卷章、编辑锚点、工作台位置和项目级披露设置。
- 编辑锚点只用于恢复定位，回读时必须验证Project、Chapter、Draft Revision和Block Hash。
- 不保存正文副本，不把Renderer临时UI状态提升为业务真源。

### `0023_generation_runtime.sql`

- `generation_runs`：requestId、taskId、runType、项目/章节、基线、Provider/Model、Prompt、状态、usage、error和时间。
- `constraint_packages`：Run唯一引用、内容Hash、来源、来源Version、token估算和trimLog。
- `generation_result_refs`：严格区分`candidate`与`state_proposal_batch`。
- `generation_partial_buffers`：可恢复但尚未成为Candidate的受控partial；保存/丢弃后进入终态。
- `model_support_profiles`：Provider、Model、Task、Prompt版本唯一。
- 项目打开时将失去内存任务的queued/running Run按真实结果收口，不伪造流恢复。

### `0024_structured_candidates.sql`

- 建立`candidate_skeleton_revisions`和当前Revision引用，保留原始模型结果及作者派生Revision。
- 建立`candidate_source_mappings`，支持BeatSourceMapping和SegmentSourceMapping。
- 按Migration政策重建`candidates`，补GenerationRun外键和严格类型约束。
- 数据库Trigger与Core双层阻止Skeleton写入`candidate_blocks`正文链。
- 历史Candidate全部按Prose兼容迁移，内容Hash和块数量必须复核。

### `0025_state_validation.sql`

- 建立`state_proposal_batches`，绑定GenerationRun、Final Version和snapshotSource。
- 重建`state_proposals`，增加`provider`来源及Batch关系。
- 建立`validation_batches`、`validation_issues`、`story_todos`与`story_comments`。
- Issue锚点保存Version、logicalBlockId、expectedHash、quote和rangeHint，不保存第二份正文。
- 扩展Generation输入与结果引用，支持不可变Version输入、StateProposalBatch和ValidationBatch。
- 明确复制字段、行数、唯一索引、区间Trigger和Hash/外键检查。
- 历史`rule/provider_stub`提案保持原值和裁决状态。

### `0026_search_replace_rhythm.sql`

- 为既有`draft_patch_log`追加Core决定的七类`mutationOrigin`，不建立第二套Mutation账本。
- `replace_plans`与`replace_plan_items`保存Core权威替换预览和不可伪造锚点。
- `writing_sessions`：有效输入起止、人工净增、有效时长和跨午夜分段。
- `genre_rhythm_profiles`：阈值、频道、启用状态、目标、空闲阈值和项目时区。
- 历史无法归类的Patch不回填为manual_edit，统计从迁移上线时间开始。
- 节奏结果按权威数据即时派生为P3建议，不新建阻断真源。

### `0027_backup_tracks.sql`（C7计划）

- 扩展`backup_records`：daily/major/named、名称、备注、作者保护、Migration保护、Schema版本。
- 建立项目级`backup_policy`：日常保留数、空间配额和清理策略。
- 现有操作Checkpoint确定性迁移为major。
- 自动清理不得删除最后已验证备份、关键Migration点或作者保护项。

## 3. AppSettings兼容

- 继续使用现有`app_settings`表，不新增App SQL Migration。
- AppSettings Schema升级时增加V1到V2的纯代码迁移器。
- Beginner/Professional、Theme和ReduceMotion保持单一状态源。
- Onboarding完成度及默认路径属于应用设置，不进入项目正文数据库。

## 4. Generation共享合同

```text
GenerationRun
├─ identity: runId / requestId / taskId
├─ scope: projectId / chapterId / baseDraftRevision
├─ task: skeleton / chapter / rewrite / merge / validate / state_extract
├─ prompt: promptId / promptVersion / taskType
├─ context: constraintHash / sources / trimLog / snapshotSource
├─ provider: providerId / actualModel / outputMode / supportStatus
├─ lifecycle: queued / running / succeeded / failed / cancelled
├─ resultRefs: Candidate | StateProposalBatch
└─ partial: unavailable / available / saved / discarded
```

终态规则：

- Run成功、结果对象和ResultRef在同一项目写事务内提交。
- Candidate或Batch写入失败时Run不得标记succeeded。
- 取消先停止未来delta，再记录真实终态。
- partial保存生成`completeness=partial`的Prose Candidate；丢弃只清理partial缓冲。
- Skeleton不允许partial正文应用；结构化输出不完整时保留失败Run和诊断码。

## 5. TaskProtocol兼容扩展

- 保留现有MessagePort、序号、ACK、背压、20—50ms批处理和任务快照。
- `TaskSnapshot`增加可选`resultRefs`，旧`resultIds`继续读取。
- 完成事件增加通用结果引用，同时保留Candidate事件兼容当前Renderer。
- `state_extract`结果引用指向StateProposalBatch。
- TaskProtocol继续管理实时内存状态；GenerationRun管理持久化事实。

## 6. Candidate联合

```text
Candidate
├─ SkeletonCandidate
│  ├─ structuredPayload
│  ├─ revisions
│  └─ zero prose blocks
└─ ProseCandidate
   ├─ full / rewrite / merge
   ├─ complete / partial
   └─ one or more prose blocks
```

Skeleton进入Preview、Diff、Apply、Version、Final和正文导出的成功次数必须为0。

## 7. IPC与Preload计划

| 域           | 命令                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------- |
| Generation   | `startGeneration/getRun/listRuns/cancelGeneration/savePartial/discardPartial/getModelSupport` |
| Candidate    | `list/get/discard/updateSkeleton`；Fixture命令继续只在测试模式注册                            |
| Validation   | `run/list/resolve/ignore/silence/downgrade/markFalsePositive`                                 |
| Todo/Comment | `create/update/complete/reopen/list/delete`及批注CRUD                                         |
| Search       | `search/getIndexState/rebuildIndex/previewReplace/applyReplace`及项目词典CRUD                 |
| Rhythm       | `get/run/updateProfile`                                                                       |
| TextIO       | 扩展现有Preview/Commit/Export命令支持DOCX，不建第二协调器                                     |
| Recovery     | 扩展现有create/list/verify/protect/delete/policy/restoreToCopy                                |
| Project      | `getContinuation/saveContinuation`并由Core校验锚点                                            |

所有命令要求：

- Main校验可信Renderer URL及strict命令Schema。
- Preload只暴露具名白名单和strict结果Schema。
- Renderer不得提交权威ID、结果全文、mutationOrigin、备份验证状态或Provider事实。
- Main和Core错误只返回稳定错误码、必要冲突摘要和诊断ID。

## 8. 凭据与网络数据流

```text
Renderer提交providerId
→ Main读取Provider配置
→ CredentialBroker按providerId校验归属并临时解密
→ 专用Generation命令把凭据仅放入请求内存
→ Core Provider Adapter发起用户主动请求
→ 请求结束后释放引用
```

禁止：

- 凭据进入project.sqlite、GenerationRun、Task Event、日志或Renderer。
- Provider获得项目ID、路径、credentialRef或无关本地元数据。
- Renderer绕过Main直接发起模型网络请求。

## 9. 原子事务边界

- Generation成功：Run终态 + Candidate/Batch + ResultRef。
- StateProposal裁决：提案状态 + 权威EntityState/ArcMilestone + EndingSnapshot。
- Candidate采用：Checkpoint + Patch + ApplyRecord + Candidate状态 + mutation ledger。
- SafeReplace：Checkpoint + 全量Patch + mutation ledger。
- Import：Checkpoint + 结构/Draft/Version + mutation ledger。
- Restore：新项目副本 + 验证 + restore/system来源登记。

任何子步骤失败均回滚数据库事务；外部文件写入遵循临时文件、fsync、原子替换和清理流程。

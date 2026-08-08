# M10-18 验证摘要

任务：M10-18 导入幂等、实体删除与弧光依赖一致性收口

实现提交：`1c4d522c71061a8ee5caa235d7f314b50033cb9c`

本任务完成三个跨域一致性闭环：

- Import Commit 复用现有有界幂等 Promise Cache，把 Plan/source 复核、Recovery checkpoint、随机 ID、SQLite transaction 与最终结果纳入同一 requestId 生命周期；相同命令并发/完成后重放共享同一结果，不重复 checkpoint，不生成第二套持久 ID；同 requestId 不同 payload 映射为既有 `IMPORT_COMMIT_FAILED`。
- Entity Permanent Delete 的权威依赖裁决移入同一 `writeProject` 事务；Preview 继续只做 UI 提示。删除时重新检查 SceneBeat、Timeline location、Timeline entity link、Character Arc 等独立领域引用，关闭 Preview→Delete TOCTOU；Canon Fact 等既有 CASCADE 从属数据保持原语义。
- Arc Milestone 的 Timeline Event dependency 从“仅持久化”升级为真实运行约束：保存时拒绝不存在/archived Event；Catalog 在 reference chapter 下暴露 attention/warnings；`hit` transition 以实际命中章节复用同一判定，未锚定或晚于命中章节时稳定返回 `NARRATIVE_CONFLICT`。
- 新增专项 Integration 回归 `tests/integration/m10-18-import-entity-arc-consistency.test.ts`，覆盖并发/已完成 Import replay、requestId payload 冲突、Entity 跨域引用与 Preview 后新增依赖竞态、CASCADE 从属删除，以及 Timeline dependency 未锚定/章节先后/满足后的命中语义。

边界保持：

- 未修改任何已发布 Migration、数据库 Schema、IPC Channel、协议版本、公共 Contract、生产依赖或锁文件。
- 未建立第二套幂等缓存、Entity 引用索引、Timeline 状态机或 Arc 依赖存储。
- 未扩大 Renderer、Preload、文件系统、网络或凭据能力面。
- 未降低 Coverage、安全、性能、Build 或 Electron E2E 门禁。
- TASK_INDEX 登记过程中发现的两处无关历史链接漂移已恢复到原权威路径，不带入 M10-18。

Draft 静态验证：Quality run `31246270654` 已通过 Task Validation、Workspace、Boundary、Format、Lint、Typecheck。完整 Unit / Integration / Migration / Coverage / Security / Performance / Build / Electron E2E 由 Ready 阶段仓库永久矩阵进行最终裁决。

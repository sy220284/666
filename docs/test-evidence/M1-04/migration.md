# Project Schema v2 → v3

Migration：`migrations/project/0003_draft_editor.sql`

## Schema差异

- 新增`drafts`：章节归属、active/archived状态、Revision和时间；部分唯一索引保证每章最多一个活动Draft。
- 新增`draft_blocks`：Draft归属、logicalBlockId、64位排序键、四类块、文本、严格语义属性、来源、锁定、可空Hash和Revision。
- 重建`chapters`以补齐`active_draft_id → drafts.id`外键，同时保留全部v2列、约束、数据和索引。
- 建立`drafts.chapter_id → chapters.id`、`draft_blocks.draft_id → drafts.id`以及`UNIQUE(draft_id, logical_block_id)`。
- 将现有`projects.schema_version`确定性更新为3；Migration不伪造旧章节正文或Draft。

## 初始化与旧项目

- 新建starter项目在项目创建事务内写入第一卷、第一章、活动Draft和空paragraph DraftBlock。
- 后续新建章节在卷章事务内同时创建活动Draft和空块。
- 从v2升级的既有章节保持`active_draft_id=NULL`；第一次`draft.get`在Core单写事务中按需创建活动Draft和空块。
- 每个记录ID和logicalBlockId由Core使用UUID生成，初始orderKey为1024。

## 升级、恢复点与回滚

1. ProjectDatabase验证v2历史、checksum、`quick_check`和现有外键。
2. 工作区服务在迁移前创建经验证、权限为`0600`的SQLite恢复点；v1直接升级时恢复点仍保存原v1数据库。
3. 单事务重建Chapter并创建Draft表、外键和索引，随后写入`schema_migrations(version=3)`。
4. 执行`quick_check`和`foreign_key_check`，同步manifest的`projectSchemaVersion=3`。
5. 在v3 `after-sql`注入中断时，`drafts`/`draft_blocks`均不存在，数据库保持v2并以`migration-failed`只读打开。

## Draft写入原子性

`draft.saveSnapshot`先验证活动Project/Chapter/Draft和所有已有logicalBlockId，再在同一串行事务中替换有序块。`after-block-delete`故障注入会回滚删除和后续写入，原文档完整不变；跨Draft logicalBlockId在任何删除前被拒绝。

## 延期字段

M1-04不提前实现M1-05语义：`revision`保持0，`content_hash`保存NULL。M1-05必须通过批准的实现和测试建立Patch、Revision、Hash与冲突不变量；不得回改已合并的v3 Migration。

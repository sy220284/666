# WorldForge 数据库Migration策略

> 状态：Frozen  
> 适用：`app.sqlite`与`project.sqlite`

## 1. 基本原则

1. Migration只追加，不修改已合并或已发布脚本。
2. `app.sqlite`和`project.sqlite`使用独立版本序列。
3. 每个Migration必须在一个事务中完成；SQLite不支持的DDL变更采用建新表、迁移、校验、替换流程。
4. 任何不可逆变更前创建重大操作恢复点。
5. 升级失败时旧数据库必须保持可读，应用进入只读或恢复流程，不继续写入。
6. Migration不得访问网络、调用AI或依赖Renderer状态。

## 2. 文件命名

```text
migrations/
├── app/
│   ├── 0001_initial.sql
│   └── 0002_provider_metadata.sql
└── project/
    ├── 0001_initial.sql
    ├── 0002_draft_candidate_version.sql
    └── 0003_continuity.sql
```

命名格式：`NNNN_short_description.sql`。编号一经合并不可复用。

## 3. Migration元数据

每个数据库包含：

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  app_version TEXT NOT NULL
);
```

启动时校验：

- 已应用脚本checksum是否与仓库一致。
- 数据库版本是否高于当前应用支持版本。
- 是否存在中断标记或未完成迁移。

## 4. 标准执行流程

```text
打开项目
→ quick_check
→ 读取schema_migrations
→ 判断兼容性
→ 创建迁移前恢复点
→ 关闭业务写入
→ 逐个事务执行Migration
→ 校验外键与关键行数
→ integrity_check
→ 更新manifest和Schema版本
→ 恢复正常写入
```

## 5. 表重建流程

SQLite需要重建表时：

1. 创建`<table>__new`。
2. 按明确字段映射复制数据。
3. 对源表与新表执行行数、主键、外键和关键Hash校验。
4. 重建索引和触发器。
5. 重命名旧表为临时备份。
6. 将新表替换为正式表。
7. 完成事务后再清理临时旧表。

禁止使用`SELECT *`进行结构迁移。

## 6. 数据回填

- 可确定回填：在Migration中完成。
- 需要解析大量正文的回填：Migration只新增字段和待处理标记，升级后由可恢复后台任务执行。
- AI推断结果不得用于Schema Migration回填。
- 派生数据如FTS、统计、摘要和日记可标记为待重建。

## 7. 中断与恢复

- Migration事务中断：SQLite回滚当前脚本；重新启动时从未应用版本继续。
- 表外文件迁移中断：使用`migration_journal`记录阶段，恢复时选择继续或回滚。
- 校验失败：停止升级，保留迁移前备份，项目只读打开。
- 不自动删除失败迁移产生的诊断信息，默认不含正文。

## 8. 测试矩阵

每个Migration至少测试：

1. 空数据库直接升级。
2. 前一版本升级。
3. 所有受支持旧版本逐级升级。
4. 重复运行不重复修改。
5. 事务中途故障注入。
6. 数据量较大时的时间和磁盘占用。
7. 升级后`foreign_key_check`、`quick_check`与关键业务查询。
8. FTS和派生索引重建。

## 9. 禁止事项

- 修改已发布Migration。
- 在Migration中静默删除业务数据。
- 在未创建恢复点时执行不可逆变更。
- 将Migration失败转成普通警告后继续写作。
- 因开发方便关闭外键后忘记恢复。

## 10. 完成证据

Migration任务必须提交：

- 旧Schema与新Schema差异。
- SQL脚本。
- 数据映射说明。
- 故障注入结果。
- 升级性能数据。
- 恢复和回滚步骤。

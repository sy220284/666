# WorldForge V1.0 数据库Migration策略

> 状态：Frozen  
> 适用：`app.sqlite`与`project.sqlite`

## 1. 原则

1. Migration只追加，不修改已合并或发布脚本。
2. app库和项目库使用独立版本序列。
3. 每个数据库DDL/DML Migration在一个事务中完成。
4. 不可逆变更前创建重大操作恢复点。
5. 升级失败时旧数据库保持可恢复，应用进入只读或恢复流程。
6. Migration不得访问网络、调用AI或依赖Renderer临时状态。
7. P1/V1.5功能通过后续追加Migration建立，不预建空表。

## 2. 文件命名

```text
migrations/
├─ app/
│  ├─ 0001_initial.sql
│  └─ 0002_provider_metadata.sql
└─ project/
   ├─ 0001_initial.sql
   ├─ 0002_draft_candidate_version.sql
   └─ 0003_continuity.sql
```

格式：`NNNN_short_description.sql`。编号一经合并不可复用。

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

项目库还包含`migration_journal`，只用于数据库事务外的文件复制、目录迁移或可恢复大回填阶段记录。

启动校验：脚本checksum、数据库版本、中断日志和兼容状态。

## 4. 标准流程

```text
打开项目
→ quick_check
→ 读取schema_migrations与migration_journal
→ 判断兼容性
→ 创建迁移前恢复点
→ 停止业务写入
→ 按顺序执行数据库Migration
→ 执行或恢复表外阶段
→ foreign_key_check / quick_check / 关键行数与Hash
→ 更新manifest与Schema版本
→ 恢复正常写入
```

## 5. 表重建

1. 创建`<table>__new`。
2. 使用明确字段映射复制数据，禁止`SELECT *`。
3. 校验行数、主键、外键和关键Hash。
4. 重建索引和触发器。
5. 事务内替换正式表。
6. 事务成功后清理临时旧表。

## 6. 大数据回填

- 可确定且规模可控：在Migration事务中完成。
- 大量正文解析：Migration只新增字段和待处理标记；升级后运行可取消、可恢复的Core长任务。
- 长任务阶段写入`migration_journal`，应用关闭后可继续或回滚。
- AI推断不得参与Migration回填。
- FTS、统计、ValidationIssue和节奏建议可标记待重建。

## 7. 中断与恢复

- 数据库事务中断：SQLite回滚当前脚本，重启后从未应用版本继续。
- 表外阶段中断：读取migration_journal，明确提供继续或回滚。
- 校验失败：停止升级，保留迁移前备份，只读打开。
- 失败诊断默认不含正文、Prompt和凭据。

## 8. 测试矩阵

每个Migration至少测试：

1. 空库升级。
2. 前一版本升级。
3. 所有受支持旧版本逐级升级。
4. 重复运行不重复修改。
5. 事务故障注入。
6. migration_journal各阶段中断与恢复。
7. 大数据时间和磁盘占用。
8. 升级后外键、quick_check和核心业务查询。
9. FTS和派生数据重建。

## 9. 禁止事项

- 修改已发布Migration。
- 静默删除业务数据。
- 无恢复点执行不可逆变更。
- 将Migration失败降为普通警告后继续写作。
- 忘记恢复外键。
- 在Migration中创建未进入当前范围的P1/V1.5表。

## 10. 完成证据

提交：旧/新Schema差异、SQL、数据映射、故障注入、升级性能、恢复与回滚步骤。

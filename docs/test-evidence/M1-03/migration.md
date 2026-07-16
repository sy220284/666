# Project Schema v1 → v2

Migration：`migrations/project/0002_volume_chapter_lifecycle.sql`

## Schema差异

- 新增`volumes`：项目归属、标题、64位排序键、状态、软删除时间。
- 新增`chapters`：卷归属、标题、64位排序键、章节五态、目标字数、可空Draft/Version引用和软删除时间。
- 新增`trash_entries`：对象类型/ID、原父节点、原排序键和删除时间；同一对象最多一条活动回收记录。
- 新增活动对象标题唯一索引、父节点/排序查询索引和Trash删除时间索引。
- 将现有`projects.schema_version`确定性更新为2；不修改作者正文或其他业务数据。

## 升级与恢复点

1. ProjectDatabase检查v1历史、checksum、`quick_check`和外键。
2. 在应用用户数据的`recovery/project-migrations/<projectId>/`创建SQLite Online Backup。
3. 恢复点执行`quick_check`、WAL截断、`journal_mode=DELETE`，权限设为目录`0700`、文件`0600`后原子改名。
4. 单事务执行v2 SQL并写入`schema_migrations`。
5. 执行`quick_check`与`foreign_key_check`，同步`manifest.json.projectSchemaVersion=2`。

恢复点不覆盖源项目；完整恢复到新副本属于M1-08。

## 故障与重复运行

- 实际v2脚本在`after-sql`注入中断时整笔事务回滚：`volumes`不存在、`projects.schema_version`仍为1、数据库只读返回`migration-failed`。
- 清除注入后从v1重新执行可成功到v2。
- 已到v2的项目再次打开为`current`，不重复写迁移记录。
- v1真实工作区升级测试验证恢复点仍为Schema 1，源数据库与manifest升级为Schema 2。

## 数据量与性能边界

v2只新增空业务表、索引并更新单行Project元数据，不解析正文、不访问网络、不运行AI、不执行大数据回填。Migration专项共19项在本地约2秒完成；生产规模压力与磁盘策略仍由M8升级矩阵补齐。

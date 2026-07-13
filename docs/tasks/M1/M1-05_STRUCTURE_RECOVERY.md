# M1-05 回收站、拆章、并章与跨章移动

> 状态：Planned  
> 优先级：P0  
> 分支：`feat/m1-structure-recovery`

## 目标

闭环卷、章、场景和正文块的软删除、恢复与高风险结构调整。

## 依赖

M1-04。

## 关联

- 需求：REQ-014、REQ-015
- 验收：P0-034、P0-035、P0-056

## 必读文档

- `docs/decisions/ADR-005-lock-revision-backup.md`
- `docs/ui/INTERACTION_STATES.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/testing/SECURITY_TEST_CASES.md`

## 实施内容

1. 卷、章、场景软删除与TrashEntry。
2. 恢复原位置，位置冲突时选择新位置。
3. 永久删除前执行引用检查和二次确认。
4. 拆章、并章和SceneBeat跨章移动预览。
5. 所有高风险操作前创建重大恢复点。
6. 结构操作通过统一Patch与锁定校验。
7. 历史Version保持不变。

## 测试

原位置占用、锁定块、引用存在、事务中断、恢复取消、永久删除取消、跨章关联失效和统计一致性。

## 完成条件

任何失败路径下原结构和正文保持完整；结构操作后卷章顺序、Draft块、场景关联和字数统计一致。

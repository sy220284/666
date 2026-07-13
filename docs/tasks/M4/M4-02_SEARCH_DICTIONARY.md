# M4-02 当前章搜索、FTS5、替换与词典

> 状态：Planned  
> 优先级：P0  
> 分支：`feat/m4-search-dictionary`

## 目标

完成单章与全项目的中文搜索、安全批量替换、索引重建和项目词典。

## 依赖

M3全部完成、M1编辑核心完成。

## 关联

- 需求：REQ-032、REQ-033
- 验收：P0-045—P0-047

## 必读文档

- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/contracts/IPC_CONTRACTS.md`
- `docs/testing/PERFORMANCE_BUDGETS.md`

## 实施内容

1. 当前章查找与替换。
2. 正文、Version、实体和笔记FTS5。
3. 检测并启用trigram tokenizer；短于3字符使用精确/LIKE路径。
4. 显式索引队列、stale状态和重建。
5. 批量替换预览、命中锚点和ReplacePlan。
6. 提交前重新校验Revision、Hash和锁定。
7. 锁定块默认跳过。
8. 提交前创建重大恢复点。
9. 项目词典：专名、忽略、替换建议和类别。

## 测试

中文短词与短语、别名、索引损坏重建、ReplacePlan过期、锁定跳过、批量事务失败和恢复点。

## 完成条件

搜索结果来自权威业务数据；索引可重建；批量替换无静默覆盖且可通过恢复点撤销。

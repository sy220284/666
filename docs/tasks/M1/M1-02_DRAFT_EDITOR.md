# M1-02 Draft、Tiptap与自动保存

> 状态：Planned  
> 优先级：P0  
> 分支：`feat/m1-draft-editor`

## 目标

建立稳定的中文块级编辑器、Draft持久化映射、自动保存和统一字数统计。

## 依赖

M1-01。

## 关联

- 需求：REQ-007—REQ-009
- 验收：P0-013—P0-016、P0-019

## 必读文档

- `docs/ui/EDITOR_INTERACTION_SPEC.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/testing/PERFORMANCE_BUDGETS.md`

## 实施内容

1. 建立Draft、DraftBlock和必要Migration。
2. Tiptap节点：paragraph、dialogue、heading、separator。
3. 实现logicalBlockId与整数间隔orderKey。
4. 将编辑事务转换为Block Patch。
5. 实现800ms空闲自动保存和保存状态。
6. composition期间合并中文输入事务。
7. 粘贴白名单清理。
8. 当前章查找与统一字数统计。
9. 切章、创建Version和关闭前强制flush。

## 性能

- 2K键入P95≤50ms。
- 自动保存P95≤150ms。

## 测试

中文拼音、五笔、长段落、连续输入、粘贴网页、撤销重做、关闭重开、切章和保存失败。

## 完成条件

编辑器正文可由DraftBlock重建；保存状态与Core事务一致；中文输入无丢字、重复和半组合提交。

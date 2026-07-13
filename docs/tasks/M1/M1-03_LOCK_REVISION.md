# M1-03 锁定、Block Patch与Revision

> 状态：Planned  
> 优先级：P0  
> 分支：`feat/m1-lock-revision`

## 目标

统一所有正文修改路径，使其经过结构化Patch、Revision、Hash和双层锁定校验。

## 依赖

M1-02。

## 关联

- 需求：REQ-010、REQ-011
- 验收：P0-017—P0-019

## 必读文档

- `docs/ui/EDITOR_INTERACTION_SPEC.md`
- `docs/decisions/ADR-005-lock-revision-backup.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/contracts/ERROR_CODES.md`

## 实施内容

1. 实现insert、update、delete、move Patch。
2. 每批Patch携带baseRevision。
3. update/delete/move携带expectedHash。
4. 实现Tiptap锁定扩展和Core LockGuard。
5. 一次事务只递增一次Revision。
6. 任一操作失败整批回滚。
7. 生成冲突错误、锁定跳过摘要和必要inverse patch。
8. 实现拆分、合并和logicalBlockId继承规则。

## 测试

锁定更新、删除、移动、合并；旧Revision；Hash变化；批量Patch部分失败；重复requestId；事务故障。

## 硬保证

- 锁定块破坏率为0。
- Revision静默覆盖率为0。

## 完成条件

编辑、AI采用、替换和结构操作能够复用同一Patch与LockGuard基础，不存在绕过Core的正文写入路径。

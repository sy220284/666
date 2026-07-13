# M1-04 Candidate、Version与采用撤销

> 状态：Planned  
> 优先级：P0  
> 分支：`feat/m1-candidate-version`

## 目标

完成Draft、Candidate、Version三层正文模型，以及Candidate采用、即时撤销和重启后回退。

## 依赖

M1-03。

## 关联

- 需求：REQ-012、REQ-013
- 验收：P0-020、P0-021、P0-030、P0-031

## 必读文档

- `docs/decisions/ADR-003-draft-candidate-version.md`
- `docs/decisions/ADR-004-ai-cannot-overwrite-draft.md`
- `docs/ui/CANDIDATE_REVIEW_SPEC.md`
- `docs/database/DATABASE_SCHEMA.md`

## 实施内容

1. 建立Candidate、CandidateBlock和complete/partial状态。
2. 建立Version、VersionBlock不可变Repository。
3. 支持创建Version与恢复为新Draft。
4. 建立Candidate ApplyRecord、采用前Checkpoint和inverse patch。
5. 实现整稿、块级和SceneBeat级采用基础接口。
6. 实现Ctrl/Cmd+Z整体撤销本次采用。
7. 支持应用重启后恢复到采用前状态。

## 非目标

本任务使用Fixture Candidate，不实现真实AI生成和复杂Diff界面。

## 测试

未确认Candidate不改变Draft；Version不可变；整稿和部分采用；锁定与Revision冲突；即时撤销；重启恢复；已处理Candidate重复采用。

## 完成条件

未确认Candidate写入Draft次数为0；Version无业务更新路径；采用和撤销均为原子、可审计操作。

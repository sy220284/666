# M1 里程碑：编辑与版本核心

> 状态：Approved summary  
> 一任务一文件为唯一执行依据。

## 目标

完成项目工作空间、中文块级编辑、锁定与Revision、Candidate/Version分离以及结构恢复。

## 任务

1. [`M1-01 项目工作空间与路径边界`](M1/M1-01_PROJECT_WORKSPACE.md)
2. [`M1-02 Draft、Tiptap与自动保存`](M1/M1-02_DRAFT_EDITOR.md)
3. [`M1-03 锁定、Block Patch与Revision`](M1/M1-03_LOCK_REVISION.md)
4. [`M1-04 Candidate、Version与采用撤销`](M1/M1-04_CANDIDATE_VERSION.md)
5. [`M1-05 回收站、拆章、并章与跨章移动`](M1/M1-05_STRUCTURE_RECOVERY.md)

## 退出条件

- 中文编辑、自动保存和统一字数稳定。
- 锁定块破坏与Revision静默覆盖均为0。
- 未确认Candidate不能进入Draft。
- Version不可变，采用与结构操作可撤销和恢复。
- 项目、路径和只读边界通过安全测试。

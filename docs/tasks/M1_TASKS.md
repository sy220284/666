# M1 任务卡：编辑与版本核心

## M1-01 项目工作空间与路径边界

- 目标：完成项目创建、打开、关闭、移动和异常只读打开。
- 依赖：M0。
- 分支：`feat/m1-project-workspace`
- 关联：REQ-002—004，P0-008—011。

### 实现

- 创建`.worldforge`工作空间、manifest和项目库。
- activeProjectId与数据库连接绑定。
- 最近项目注册。
- Core路径规范化、真实路径和允许根目录校验。
- 关闭项目完成待提交写入和WAL检查点。
- 项目移动：关闭→复制→完整性/Hash验证→更新路径。
- 数据库异常时只读打开并保留导出能力。

### 测试

项目外路径、跨项目ID、符号链接、移动中断、缺失目录和损坏数据库。

---

## M1-02 Draft、Tiptap与自动保存

- 目标：建立稳定的中文块级编辑器和权威Draft映射。
- 依赖：M1-01。
- 分支：`feat/m1-draft-editor`
- 关联：REQ-007—009，P0-013—016、019。

### 实现

- Draft、DraftBlock和初始Migration。
- Tiptap节点：paragraph/dialogue/heading/separator。
- `logicalBlockId`和`orderKey`。
- 编辑事务转Block Patch。
- 800ms空闲自动保存与显式保存状态。
- IME composition合并。
- 粘贴白名单清理。
- 当前章查找和统一字数统计。

### 性能

2K键入P95≤50ms；自动保存P95≤150ms。

### 测试

中文输入、长段落、快速连续输入、关闭重开、粘贴网页内容、撤销重做和章节切换。

---

## M1-03 锁定、Block Patch与Revision

- 目标：所有正文修改统一经过可验证Patch和双层锁定。
- 依赖：M1-02。
- 分支：`feat/m1-lock-revision`
- 关联：REQ-010、011，P0-017、018、019。

### 实现

- Patch：insert/update/delete/move。
- `baseRevision`与`expectedHash`。
- Tiptap锁定扩展与Core LockGuard。
- 一次事务只递增一次Revision。
- 冲突错误和跳过锁定摘要。
- Patch与inverse patch日志。

### 测试

锁定更新/删除/移动、旧Revision、块Hash变化、批量Patch部分失败、事务故障和重复requestId。

### 硬保证

锁定块破坏率和Revision静默覆盖率为0。

---

## M1-04 Candidate、Version与采用撤销

- 目标：完成三层正文模型及安全回退。
- 依赖：M1-03。
- 分支：`feat/m1-candidate-version`
- 关联：REQ-012、013，P0-020、021、030、031。

### 实现

- Candidate/CandidateBlock与complete/partial状态。
- Version/VersionBlock不可变Repository。
- Version创建与恢复到新Draft。
- Candidate ApplyRecord、采用前Checkpoint和inverse patch。
- Ctrl/Cmd+Z整体撤销采用。
- 重启后通过ApplyRecord恢复到采用前。

### 非目标

本任务不实现AI生成和复杂Diff，只使用Fixture Candidate。

### 测试

未确认候选不改变Draft；不可变Version；整稿/部分采用；撤销；重启恢复；Candidate已解决状态。

---

## M1-05 回收站、拆章、并章与跨章移动

- 目标：闭环内容生命周期和高风险结构操作。
- 依赖：M1-04。
- 分支：`feat/m1-structure-recovery`
- 关联：REQ-014、015，P0-034—035、056。

### 实现

- 卷、章、场景软删除与TrashEntry。
- 恢复原位置；冲突时选择新位置。
- 永久删除引用检查与二次确认。
- 拆章、并章和场景跨章移动预览。
- 所有高风险操作前创建重大恢复点。
- 历史Version保持不变。

### 测试

原位置被占用、锁定块、引用存在、事务中断、撤销、恢复和永久删除取消。

### 完成条件

结构操作后卷章顺序、Draft块、场景关联和字数统计一致；失败时原状态完整。

# WorldForge 任务卡模板

> 状态：Active  
> 适用：后续独立任务和维护任务  
> 执行分支：固定`work`  
> 目标分支：固定`main`

## 1. 基本规则

- 已Verified任务卡保持冻结；后续扩展必须新立项。
- 新建及活动Runtime使用`executionBranch: work`。
- 历史Runtime中的旧来源分支保持冻结，不得为表面统一修改。
- 禁止填写或生成任务专属分支名。
- 一个正式PR可以承载当前获批任务范围，且仓库同一时刻只允许一个`work → main` PR。

## 2. Planned任务卡必须包含

1. 基本信息、状态和优先级；
2. 目标、阶段定位和非目标；
3. 依赖与真实承接基线；
4. 关联需求、功能ID和验收；
5. 必读文档与影响范围；
6. 数据、Migration、IPC、事件、错误码、UI、安全、恢复和性能边界；
7. 自动化、人工验收、Evidence和完成条件；
8. 来源PR与主分支验证绑定方案。

## 3. Planned任务卡模板

```markdown
# <TASK-ID> <任务名称>

> 状态：Planned
> 里程碑：<阶段>
> 优先级：P0 / P1 / P2
> 执行分支：work
> 目标分支：main

## 目标

## 阶段定位

## 非目标

## 依赖

## 真实承接基线

## 关联

- 需求：
- 功能ID：
- 验收：

## 必读文档

## 主要影响范围

## 数据库与Migration

## IPC、事件与错误码

## UI闭环

## 安全、隐私与恢复

## 性能预算

## 实施内容

## 自动化测试

## 人工验收

## Evidence

保存到：`docs/test-evidence/<TASK-ID>/`

## 回滚策略

## 完成条件
```

## 4. Runtime最小结构

```json
{
  "schemaVersion": 2,
  "id": "<TASK-ID>",
  "status": "PLANNED",
  "executionBranch": "work",
  "dependencies": [],
  "allowedPaths": [],
  "forbiddenPaths": [],
  "verification": [],
  "verificationBinding": null
}
```

任务进入`IN_PROGRESS`前，必须补齐真实基线、范围、允许路径、禁止路径、失败路径和验证命令。

任务登记`IMPLEMENTED`时，增加：

```json
{
  "verificationBinding": {
    "sourcePr": 0,
    "mainContext": "main-verification",
    "taskContext": "task-verification/<TASK-ID>"
  }
}
```

`sourcePr`在PR建立后写入。最终受检Head由GitHub PR、Controlled Merge输入和Main Verification共同证明，不写入Runtime，避免提交SHA自引用。最终main SHA和验证运行由GitHub提交状态绑定，不通过第二个关闭PR补写。

## 5. UI与失败路径

用户功能至少覆盖：

- 空状态；
- 加载/进行中；
- 成功；
- 失败；
- 取消；
- 冲突；
- 只读；
- 恢复；
- 关闭与重启。

必须检查非法输入、目标不存在、重复请求、Revision/Hash冲突、锁定、项目越界、数据库/磁盘/网络失败和恢复失败。

## 6. Definition of Done

任务只有同时满足以下条件才能登记`IMPLEMENTED`：

- 目标真实接通，非目标未提前引入；
- 实现、测试、文档和Evidence存在于同一受检work Head；
- Contracts→Core→Main→Preload→Renderer→测试纵向闭环；
- 成功、失败、取消、冲突、只读、恢复和重启路径覆盖；
- Schema、Migration、IPC、UI、安全和文档同步；
- 测试真实运行并记录；
- 无TODO、空函数、固定假数据和伪造成功；
- Runtime、TASK_INDEX和追踪矩阵同步；
- `verificationBinding`绑定当前PR和稳定状态上下文。

有效`VERIFIED`还要求Main Verification及任务验证提交状态成功，且GitHub来源PR、来源Head与最终main绑定完全一致。

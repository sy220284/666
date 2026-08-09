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
- 代码结构遵循高内聚、低耦合；文件行数只用于观察，不作为强制拆分或合并失败条件。
- 禁止为了缩短文件，将同一状态机、事务或业务生命周期机械拆成多个无语义文件。
- Draft允许中间Evidence随实施推进；Ready必须使用Schema 2 manifest绑定最新实现提交，绑定提交之后只允许当前任务状态与Evidence收口路径。

## 2. Planned任务卡必须包含

1. 基本信息、状态和优先级；
2. 目标、阶段定位和非目标；
3. 依赖与真实承接基线；
4. 关联需求、功能ID和验收；
5. 必读文档与影响范围；
6. 数据、Migration、IPC、事件、错误码、UI、安全、恢复和性能边界；
7. 自动化、人工验收、Evidence和完成条件；
8. 来源PR与主分支验证绑定方案；
9. 涉及重构时，说明职责边界、状态所有权、依赖方向和拆分依据。

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

## 职责、状态所有权与依赖方向

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

## 5. Evidence收口规则

- manifest必须列出`summary.md`、`commands.txt`、`known-risks.md`并校验字节数与SHA-256。
- Draft阶段可以使用中间Evidence，但不得伪造最终验收结论。
- PR转Ready前，当前任务manifest必须使用Schema 2，并以完整40位`implementationCommit`绑定最新实现提交。
- `implementationCommit`之后只允许修改当前任务卡、当前Runtime、`TASK_INDEX.md`和当前任务Evidence目录。
- 产品代码、测试、脚本、配置、工作流或其他任务Evidence出现在收口区间时，Evidence必须失败；应重新完成实现验证并更新`implementationCommit`，禁止扩大收口白名单绕过。
- Evidence manifest不绑定包含自身的最终Head，也不预写未来Squash SHA；最终main与任务有效Verified继续由提交状态证明。

## 6. UI与失败路径

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

## 7. 结构治理要求

重构、拆分或合并模块时必须依据：

- 是否存在两个可独立演进的业务能力；
- 是否存在不同状态机、事务边界、错误模型或生命周期；
- 是否形成稳定公共接口；
- 是否出现循环依赖、反向依赖或私有实现穿透；
- 是否存在多个模块直接写入同一内部状态；
- 测试是否必须初始化大量无关能力。

单纯的文件行数、函数数量、测试数量或目录视觉长度不能作为拆分理由。大型文件只要职责单一、状态集中、依赖清晰，可以保留。

## 8. Definition of Done

任务只有同时满足以下条件才能登记`IMPLEMENTED`：

- 目标真实接通，非目标未提前引入；
- 实现、测试、文档和Evidence存在于同一受检work Head；
- Contracts→Core→Main→Preload→Renderer→测试纵向闭环；
- 成功、失败、取消、冲突、只读、恢复和重启路径覆盖；
- Schema、Migration、IPC、UI、安全和文档同步；
- 测试真实运行并记录；
- 无TODO、空函数、固定假数据和伪造成功；
- Runtime、TASK_INDEX和追踪矩阵同步；
- `verificationBinding`绑定当前PR和稳定状态上下文；
- Ready Evidence绑定最新实现提交，且其后不存在非收口变更；
- 结构变化符合职责内聚、依赖方向和单一状态所有权，不以行数制造碎片。

有效`VERIFIED`还要求Main Verification及任务验证提交状态成功，且GitHub来源PR、来源Head与最终main绑定完全一致。

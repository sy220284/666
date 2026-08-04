# M10-03 IPC与协议维护治理

> 状态：In Progress
> 里程碑：M10维护治理
> 优先级：P1
> 执行分支：work
> 目标分支：main

## 目标

关闭全量复核后确认的五项有效问题：

1. 五组专项Main IPC统一接入`handler-guard.register()`异常保护；
2. 修正项目执行入口的当前已验证仓库基线语义；
3. 收敛Preload命令Envelope、调用与结果校验公共实现；
4. 在DEC-004补齐`set-lock` Block Patch操作；
5. 明确`RegisteredCommandSchema`只覆盖中央主桥命令的范围，并提供准确命名入口。

## 阶段定位

这是M10-02全量代码审计后的维护治理任务。保持现有产品行为、IPC Channel、命令字符串、数据库Schema、Migration和公开Bridge方法不变，只修复异常传播缺口与维护性漂移风险。

## 非目标

- 不为`SerializedWriteQueue`增加无法中断同步原生调用的表面超时；
- 不改造Provider幂等缓存淘汰算法；
- 不修改`ACTIVE_TASK.json`兼容锚点；
- 不修改64位排序键的SQLite/IPC承载设计；
- 不新增生产依赖、数据库表、Migration、产品功能或第二套协议真源。

## 依赖

- M10-02 Verified；
- PR #309合并后的已验证基线`bb415f3da773160928efda20b877083b321601a0`；
- `main == work`且无开放PR。

## 真实承接基线

- 当前仓库基线：`main@bb415f3da773160928efda20b877083b321601a0`；
- M10-02审计矩阵基线：`ca83d48c7493bba21252a37f9aec024d6aa0ca79`；
- 当前状态：`VERIFIED_HOLD`，本任务激活后转为维护实施状态。

## 关联

- 需求：全量复核确认的2项Medium、3项Low问题治理；
- 功能ID：IPC-GUARD-UNIFY、EXECUTION-BASELINE、PRELOAD-RUNTIME、DEC-004-SYNC、CENTRAL-COMMAND-SCHEMA；
- 验收：五项问题均有实现、边界测试和文档闭环；两项Info保持记录但不进入阻断。

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/tasks/TASK_AUTHORIZATION.json`
- `docs/tasks/TASK_INDEX.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/tasks/M10/M10-02_FULL_CODE_AUDIT.md`
- `docs/test-evidence/M9-03/AR-08_CONTRACTS_SPLIT_VERIFICATION.md`
- `docs/test-evidence/M9-03/AR-09_PRELOAD_SPLIT_VERIFICATION.md`
- `docs/test-evidence/M9-03/AR-10_MAIN_IPC_SPLIT_VERIFICATION.md`

## 主要影响范围

- `apps/desktop/main/src/handler-guard.ts`
- 五组专项Main IPC注册模块及其组合入口
- `apps/desktop/preload/src/bridge-runtime.ts`
- Continuity、Narrative Planning、State Proposal、Validation、Search、Rhythm、Candidate Bridge
- `packages/contracts/src/protocol-registry.ts`
- `packages/contracts/src/app-runtime-contracts.ts`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- 对应Unit、Security和边界测试

## 数据库与Migration

无数据库或Migration变更。所有持久化格式保持不变。

## IPC、事件与错误码

- 不修改Channel、Command、`PROTOCOL_VERSION`和成功结果Schema；
- 五组专项Handler的未知异常必须转换为`CommandFailure`；
- 错误码固定为`COMMON_INTERNAL_999`；
- 返回`diagnosticId`和作者可理解的重试/诊断导出提示；
- 日志失败不得阻止错误转换；
- 正常业务失败继续使用现有领域错误语义。

## UI闭环

无新增UI。Renderer不再因专项Main IPC意外异常收到裸Rejected Promise；现有失败展示继续消费标准`CommandFailure`。

## 安全、隐私与恢复

- 未知异常不得通过IPC泄露堆栈、SQL、路径、正文或凭据；
- 日志只记录安全字段和`diagnosticId`；
- Preload继续保持命名白名单和严格结果Schema校验；
- 回滚可恢复到任务前基线，不涉及数据迁移。

## 性能预算

仅增加常数级注册包装与公共函数调用，不引入网络、磁盘或数据库开销。不得改变现有性能预算。

## 实施内容

1. 建立可复用的Guarded Invoke注册适配层；
2. 将Candidate Preview、Generation、Continuity、Narrative Planning聚合域和Provider注册接入统一Guard；
3. 扩展`bridge-runtime.ts`为命令Envelope与结果解析单一实现；
4. 删除专项Bridge中的重复`ipcRenderer.invoke`和Envelope实现；
5. 更新项目执行入口的“审计基线/当前仓库基线”双层表述；
6. 补齐DEC-004的`set-lock`定义和语义；
7. 新增准确的`CentralBridgeCommandSchema`名称，保留旧名称兼容并标明范围；
8. 添加回归测试锁定上述边界。

## 自动化测试

- Guard未知异常：Core结果不符合契约、Schema.parse抛错、Logger抛错；
- 五组专项IPC均确认通过统一Guard注册；
- Preload专项Bridge不得直接调用`ipcRenderer.invoke`或自行构造协议公共字段；
- 中央命令Schema准确命名与旧名称兼容；
- DEC-004与现行`set-lock`契约一致；
- 完整永久门禁和Full Work Validation通过。

## 人工验收

- 复核Renderer收到的未知异常为标准失败对象；
- 复核公开Bridge方法、Channel和命令字符串无变化；
- 复核项目执行入口的当前SHA与真实`main/work`一致；
- 复核两项Info未被误纳入发布阻断。

## Evidence

保存到：`docs/test-evidence/M10-03/`

## 回滚策略

Squash合并前可整体回退本任务提交；合并后按PR回退。无Migration和数据转换，不需要数据恢复步骤。

## 完成条件

- 五项确认问题全部关闭；
- 两项Info保持暂不处理并记录理由；
- 实现、测试、任务卡、Runtime、索引、执行入口和Evidence位于同一受检Head；
- Draft及Ready永久门禁、Full Work Validation全部成功；
- Controlled Merge后Main Verification与`task-verification/M10-03`成功；
- Work Synchronization后`main == work`。

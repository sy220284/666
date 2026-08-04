# M10-03 IPC与协议维护治理

> 状态：Implemented  
> 优先级：P1  
> 执行分支：work  
> 目标分支：main

## 目标

关闭全量复核确认的五项问题：

1. Candidate Preview、Generation、Continuity、Narrative Planning聚合域和Provider统一接入Main IPC异常保护；
2. 修正项目执行入口的当前已验证仓库基线；
3. 收敛Preload命令Envelope、Invoke和结果Schema校验；
4. DEC-004补齐`set-lock`；
5. 明确中央主桥命令Schema范围。

两项Info继续暂不处理：`SerializedWriteQueue`系统级超时、Provider幂等缓存O(n)淘汰。

## 基线与依赖

- 依赖：M10-02 Verified；
- 最新已验证仓库基线：`bb415f3da773160928efda20b877083b321601a0`；
- M10-02审计矩阵基线：`ca83d48c7493bba21252a37f9aec024d6aa0ca79`；
- 来源PR：#310。

## 不变量

- 不修改数据库Schema、Migration、持久化格式；
- 不修改IPC Channel、Command字符串、`PROTOCOL_VERSION`和正式错误码；
- 不修改公开Bridge方法；
- 不修改`ACTIVE_TASK.json`与`ACTIVE_TASK.md`兼容锚点；
- 不新增生产依赖、产品功能或第二套协议真源。

## 实施结果

### Main IPC

- `handler-guard.ts`增加按`IpcMain`实例隔离的统一注册入口；
- Candidate Preview、Generation、Continuity、Narrative Planning聚合域通过统一入口注册；
- Provider由中央组合入口的受控代理复用同一Guard；
- 未知异常统一转换为`COMMON_INTERNAL_999`、`diagnosticId`、可重试标记和作者可理解提示；
- Logger同时抛错时仍返回标准`CommandFailure`。

### Preload

- `bridge-runtime.ts`统一生成`protocolVersion/requestId/sentAt/projectId`；
- 公共运行时统一执行`ipcRenderer.invoke`和结果Schema解析；
- Continuity、Narrative Planning、State Proposal、Validation、Search、Rhythm、Candidate均复用公共实现。

### 文档与契约

- `PROJECT_EXECUTION_ENTRY.md`区分审计基线与当前已验证仓库基线；
- DEC-004补齐`set-lock`、`expectedHash`、单批次Revision和事务回滚语义；
- 新增`CentralBridgeCommandSchema`准确名称；
- `RegisteredCommandSchema`继续兼容，专项命令继续使用各自严格Schema。

## 测试

新增或更新测试锁定：

- 五组专项IPC生产注册进入统一Guard；
- Handler异常及Logger异常转换为标准失败；
- 专项Preload不得重复构造协议字段或直接调用`ipcRenderer.invoke`；
- DEC-004与现行`set-lock`一致；
- 中央命令Schema准确命名与旧名称兼容；
- 项目执行入口引用正确基线。

实现代码提交`8430b527272e14e7249b498a4d1d8b3409f4a92a`已通过Draft阶段Workspace、Boundaries、Format、Lint、Typecheck，以及Security、Performance、Evidence、Task Governance和PR Policy。

## Evidence

- `docs/test-evidence/M10-03/summary.md`
- `docs/test-evidence/M10-03/commands.txt`
- `docs/test-evidence/M10-03/known-risks.md`
- `docs/test-evidence/M10-03/manifest.json`

## 风险与回滚

- 进程内Guard无法中断永久阻塞的同步原生调用，该项保持Info；
- Provider 1000项缓存淘汰仍为O(n)，该项保持Info；
- 旧Schema名称暂时保留，后续大版本再评估移除；
- 可整体回退PR #310，无数据迁移恢复步骤。

## 完成条件

- Ready完整Quality、Security、Performance、Evidence、Task Governance、PR Policy全部成功；
- Unit、Integration、Migration、Coverage、Build、Electron E2E、三平台Package Smoke和Windows微软拼音验收成功；
- 使用`expected_head_sha`受控Squash合并；
- Main Verification与`task-verification/M10-03`成功；
- Work Synchronization后`main == work`。

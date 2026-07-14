# M0-04 IPC、错误码、事件与任务协议

> 状态：Planned  
> 里程碑：M0 工程、安全与运行底座  
> 优先级：P0  
> 建议分支：`feat/m0-ipc-event-task-protocol`

## 目标

建立严格可验证的命令通道、稳定错误码、可排序可恢复的长任务事件和取消机制。

## 阶段定位

应用可安全启动、Core可监管、SQLite/IPC/测试底座可用，关键技术风险有量化结论。

## 非目标

- 不实现具体业务Use Case。
- 不接入真实模型。

## 依赖

M0-02、M0-03

## 关联

- 需求：REQ-028
- 功能ID：AI-009
- 验收：P0-003、P0-023、P0-024

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/contracts/IPC_CONTRACTS.md`
- `docs/contracts/EVENT_PROTOCOL.md`
- `docs/contracts/ERROR_CODES.md`
- `docs/security/THREAT_MODEL.md`

## 主要影响范围

- `packages/contracts/`
- `apps/desktop/main/`
- `apps/desktop/preload/`
- `packages/core-service/`
- `tests/integration/`
- `tests/security/`

## 实施内容

1. 实现CommandEnvelope、Success、Failure和EventEnvelope的strict Zod Schema。
2. 按命令建立独立输入输出Schema、受控命令名和Preload白名单。
3. 冻结稳定错误码及Renderer行为，不允许任意字符串错误码替代契约。
4. 建立MessagePort事件：started、stage、delta、usage、completed、cancelled、failed。
5. 同一taskId维护eventId去重、sequence递增、缺号检测和task.getSnapshot恢复。
6. Provider增量按20—50ms或字符阈值批量，支持慢Renderer背压。
7. 建立取消信号、不可取消阶段说明、多任务隔离和应用关闭处理。

## 测试与证据

- 未注册命令、额外字段、非法枚举、协议版本不匹配和跨项目ID被拒绝。
- 乱序、重复、缺号、延迟和慢消费者事件可恢复且不无限积压。
- 取消反馈≤500ms，取消后无未来正文delta。
- 多个taskId和页面切换不串任务。

证据保存到：`docs/test-evidence/M0-04/`

## 完成条件

- 协议快照、Preload白名单、错误映射、取消和任务恢复全部通过。
- Renderer不依赖Provider原始格式或内部异常对象。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。

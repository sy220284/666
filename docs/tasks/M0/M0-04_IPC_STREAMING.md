# M0-04 IPC与流式事件协议

> 状态：Planned  
> 优先级：P0  
> 分支：`feat/m0-ipc-streaming`

## 目标

建立安全命令通道、标准响应、稳定错误码和可取消的长任务流式事件。

## 依赖

M0-01、M0-02。

## 关联

- 需求：REQ-028
- 验收：P0-003、P0-023、P0-024

## 必读文档

- `docs/contracts/IPC_CONTRACTS.md`
- `docs/contracts/EVENT_PROTOCOL.md`
- `docs/contracts/ERROR_CODES.md`
- `docs/security/THREAT_MODEL.md`

## 实施内容

1. 实现CommandEnvelope与Success/Failure Schema。
2. 建立Preload具名白名单注册机制。
3. 建立MessagePort事件：started、stage、delta、usage、completed、cancelled、failed。
4. delta按20—50ms或字符阈值批量。
5. 同一taskId维护递增sequence与eventId去重。
6. 实现`task.getSnapshot`恢复缺号和页面重连。
7. 实现取消命令和标准错误映射。
8. 处理慢Renderer背压与多任务隔离。

## 测试

- 乱序、重复、缺号和延迟事件。
- 单Token输入被批量发送。
- 慢Renderer时Core不无限积压。
- 切页与多任务不串taskId。
- 取消反馈≤500ms，取消后无未来正文delta。

## 完成条件

协议测试、Preload白名单测试和取消路径全部通过，Renderer不依赖厂商原始错误或事件格式。

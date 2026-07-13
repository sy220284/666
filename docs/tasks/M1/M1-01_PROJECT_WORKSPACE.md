# M1-01 项目工作空间与路径边界

> 状态：Planned  
> 优先级：P0  
> 分支：`feat/m1-project-workspace`

## 目标

完成项目创建、打开、关闭、移动、最近项目登记和异常只读打开。

## 依赖

M0全部完成。

## 关联

- 需求：REQ-002—REQ-004
- 验收：P0-008—P0-011

## 必读文档

- `docs/architecture/ARCHITECTURE.md`
- `docs/security/THREAT_MODEL.md`
- `docs/database/SCHEMA_COMPATIBILITY.md`
- `docs/contracts/IPC_CONTRACTS.md`

## 实施内容

1. 创建`.worldforge`工作空间、manifest和项目数据库。
2. activeProjectId与数据库连接绑定。
3. 最近项目登记、移除与路径丢失处理。
4. Core路径规范化、真实路径和允许根目录校验。
5. 关闭项目前flush写队列并处理WAL检查点。
6. 项目移动：关闭→复制→完整性与Hash验证→更新路径。
7. 数据库异常或高版本时只读打开，并保留浏览与导出。

## 测试

项目外路径、跨项目ID、符号链接逃逸、移动中断、缺失目录、只读目录和损坏数据库。

## 完成条件

原项目在任何失败路径下保持可用；跨项目和路径越界写入为0；异常项目可安全只读浏览与导出。

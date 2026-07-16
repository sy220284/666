# M1-02 项目工作空间、路径边界与只读打开

> 状态：Implemented  
> 里程碑：M1 基础写作MVP  
> 优先级：P0  
> 建议分支：`feat/m1-project-workspace-paths`

## 目标

完成项目创建、打开、关闭、移动、活动项目隔离和异常只读打开。

## 阶段定位

交付无AI也能长期写作、自动保存、版本、导入导出和恢复的基础产品。

## 非目标

- 不实现正文编辑和大纲。
- 不实现完整备份保留策略。

## 依赖

M1-01

## 关联

- 需求：REQ-002、REQ-003、REQ-004
- 功能ID：PRJ-001、PRJ-002、PRJ-003、PRJ-004
- 验收：P0-008—P0-011

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/contracts/IPC_CONTRACTS.md`
- `docs/database/SCHEMA_COMPATIBILITY.md`
- `docs/security/THREAT_MODEL.md`

## 主要影响范围

- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/main/`
- `apps/desktop/preload/`
- `apps/desktop/renderer/`
- `migrations/project/`
- `tests/security/`
- `tests/e2e/`

## 实施内容

1. 创建.worldforge工作空间、manifest和project.sqlite，初始化最小Project记录。
2. Core维护唯一activeProjectId，所有项目命令校验项目、实体和路径归属。
3. 实现路径规范化、realpath、允许根目录和符号链接逃逸防护。
4. 关闭项目前flush写队列、执行必要WAL checkpoint并清理项目上下文。
5. 项目移动使用关闭→复制→Hash/完整性验证→更新路径；失败保持原项目。
6. 数据库损坏或高版本Schema时只读打开，保留浏览、导出和恢复入口。

## 测试与证据

- 项目外路径、跨项目ID、符号链接逃逸、只读目录和缺失目录。
- 移动中断、目标冲突、磁盘不足和Hash不一致。
- 只读模式拒绝全部写命令且不修改原数据库。

证据保存到：`docs/test-evidence/M1-02/`

## 完成条件

- 新建、打开、关闭、移动和只读路径均可通过真实UI完成。
- 任何失败路径下原项目保持可用。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。

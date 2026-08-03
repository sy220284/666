# WorldForge 当前活动任务

> 本文件是 `docs/tasks/ACTIVE_TASK.json` 的兼容镜像。全局分支与PR授权以 `docs/tasks/TASK_AUTHORIZATION.json` Schema 2为准。

## 当前状态

```text
VERIFIED_HOLD
```

- 兼容锚点任务：`M8-09`
- 任务卡：`docs/tasks/M8/M8-09_V1_STABILITY_HARDENING.md`
- 唯一工作分支：`work`
- 稳定分支：`main`
- 全局授权模式：`single-work-pr`
- 兼容状态机模式：`implementation-pr`（仅供旧校验读取）
- 当前活动开发任务：无

## 当前仓库执行规则

```text
最新已验证main
→ 唯一work
→ 实施、测试、文档与Evidence
→ 唯一work → main PR
→ 永久门禁
→ Controlled Merge（Squash）
→ Main Verification
→ 任务有效状态关闭
→ Work Synchronization受控重置work到main
```

禁止任务专属分支、验证分支、治理分支、纯Evidence分支和纯关闭PR。

## 兼容说明

- `ACTIVE_TASK.json.authorization.mode`保留旧值，只维持历史状态机和旧命令兼容。
- `TASK_AUTHORIZATION.json`是唯一全局机器授权真源，当前Schema为2。
- 新建及活动Runtime使用`executionBranch: work`。
- 已Verified历史Runtime中的旧来源分支保持冻结。
- 新任务必须重新立项；不得沿用已关闭任务Runtime继续开发。

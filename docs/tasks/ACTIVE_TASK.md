# WorldForge 当前活动任务

> 本文件是 `docs/tasks/ACTIVE_TASK.json` 的兼容镜像。全局授权以 `docs/tasks/TASK_AUTHORIZATION.json` Schema 2为准。

## 当前状态

```text
VERIFIED_HOLD
```

- 兼容锚点任务：`M8-09`
- 任务卡：`docs/tasks/M8/M8-09_V1_STABILITY_HARDENING.md`
- 唯一工作分支：`work`
- 稳定分支：`main`
- 全局授权模式：`single-work-pr`
- 兼容状态机模式：`implementation-pr`（仅供旧状态读取）

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

- `ACTIVE_TASK.json.authorization.mode`只维持历史状态机兼容。
- 新建及活动Runtime使用`executionBranch: work`。
- 已Verified历史Runtime中的来源分支保持冻结。

# 仓库治理入口

当前有效分支与任务治理入口：

- `single-work-policy.mjs`：唯一`work → main`合并请求、任务Runtime和路径边界。
- `single-work-taskctl.mjs`：Schema 2本地状态校验与兼容镜像同步。
- `branch-inventory-policy.mjs`：仓库只允许`main`和`work`。
- `work-synchronization.mjs`：Main Verification成功后的work受控重置。
- `parallel-task-policy.mjs`、`verification-hold-taskctl.mjs`和`scripts/taskctl.mjs`仅保留兼容转发，不包含旧分支或旧状态机实现。

全局机器授权以`docs/tasks/TASK_AUTHORIZATION.json`为准。

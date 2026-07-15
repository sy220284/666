# WorldForge 开发自动化控制规范

> 状态：Active  
> 适用分支：`main`  
> 授权来源：作者于 2026-07-15 明确预授权连续执行。

## 1. 目标

把任务选择、依赖检查、修改范围、质量验证、证据归档和状态回写组成可执行闭环。自动化只替代重复操作，不降低任务卡、测试、安全和数据边界。

## 2. 权威状态

- `docs/tasks/ACTIVE_TASK.json`：机器可读的唯一活动任务状态。
- `docs/tasks/ACTIVE_TASK.md`：由 JSON 生成的人类可读镜像。
- `docs/tasks/TASK_INDEX.md`：任务依赖和完成状态。
- 独立任务卡：目标、非目标、实现范围和验收要求。

若 JSON 与 Markdown 镜像不一致，CI 失败并以 JSON 为准重新生成镜像。

## 3. 连续主线模式

```text
激活一张任务
→ 验证依赖与允许路径
→ 最小完整实现
→ 本地验证
→ main原子提交
→ GitHub质量门
→ 证据与追踪回写
→ 标记Verified
→ 自动激活下一张依赖已满足的任务
```

约束：

1. 同一时刻只有一张 `IN_PROGRESS` 任务。
2. 每张任务使用独立原子提交或连续提交组，提交信息必须包含任务 ID。
3. 任何失败转为 `BLOCKED`，保留复现、日志、数据安全状态和回退方式。
4. 不允许跳过失败测试、伪造证据、绕开阶段门或提前实现未来任务。
5. 冻结架构发生真实冲突时暂停受影响任务，只处理冲突本身。

## 4. 自动门禁

- `pnpm task:validate`：活动任务、任务索引、授权和必读文件。
- `pnpm task:preflight`：本次变更是否越过允许路径或命中禁止路径。
- `pnpm check:workspaces`：包清单、入口和构建脚本。
- `pnpm check:boundaries`：跨层依赖和 Renderer/Domain/Contracts 的 Node 边界。
- `pnpm task:verify`：证据目录最低结构。
- GitHub `Task Governance`：任务状态与修改范围。
- GitHub `Quality`：安装、格式、Lint、类型、测试、边界和构建。

## 5. 测试路由

基础命令由 M0-01 建立。专项测试只能在对应底座任务完成后启用；尚未建立的命令必须明确返回“未就绪”，不能以空测试假装通过。

| 变更 | 追加验证 |
|---|---|
| Migration、Repository | `test:migration`、`test:integration` |
| Electron、IPC、路径、安全 | `test:security`、`test:e2e` |
| Editor、Candidate、Revision、Lock | `test:unit`、`test:integration`、`test:e2e` |
| Prompt、Provider、约束包 | `test:eval`、`test:integration` |
| 性能、DPI | `test:perf`、`test:e2e` |

## 6. 证据

每张任务保留 `summary.md`、`commands.txt`、`known-risks.md`；专项任务再加入测试结果、截图和性能报告。未运行、失败或环境限制必须如实写入。

# WorldForge 开发自动化控制规范

> 状态：Active  
> 适用分支：`main`  
> 授权来源：作者于 2026-07-15 明确预授权连续执行，并于2026-07-16调整为实现优先顺序推进。

## 1. 目标

把任务选择、依赖检查、修改范围、质量验证、证据归档和状态回写组成可执行闭环。自动化只替代重复操作，不降低任务卡、测试、安全和数据边界。

## 2. 权威状态

- `docs/tasks/ACTIVE_TASK.json`：机器可读的唯一活动任务状态。
- `docs/tasks/ACTIVE_TASK.md`：由 JSON 生成的人类可读镜像。
- `docs/tasks/TASK_INDEX.md`：任务依赖和完成状态。
- 独立任务卡：目标、非目标、实现范围和验收要求。

`pnpm task:validate`会重新生成预期镜像并与`ACTIVE_TASK.md`逐字比较。JSON与Markdown不一致时CI直接失败，必须运行`pnpm task:sync`修复，禁止手工维持两个状态源。

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

### 3.1 实现优先主线模式

`implementation-mainline`用于先完成各任务卡的真实编程，再统一处理非编程验收：

```text
唯一活动任务
→ 最小完整端到端实现
→ 必要专项测试
→ main实现提交与GitHub质量门
→ 标记Implemented并登记deferredVerification
→ 激活下一张实现依赖已满足的任务
```

延期项统一包括标准证据包、截图、人工与穷尽质量矩阵、追踪矩阵Verified状态和最终关闭。延期不等于省略：`Implemented`只能满足本模式下的后续编程依赖，不能用于发布、P0验收或Verified声明。代码、测试、Migration、安全和数据边界失败不得延期，必须立即阻断。

## 4. 自动门禁

- `pnpm task:validate`：活动任务、任务索引、授权、必读文件及JSON/Markdown镜像一致性。
- `pnpm task:preflight`：本次变更是否越过允许路径或命中禁止路径。
- `pnpm check:workspaces`：包清单、入口和构建脚本。
- `pnpm check:boundaries`：跨层依赖和 Renderer/Domain/Contracts 的 Node 边界。
- `pnpm task:verify`：证据目录最低结构。
- `pnpm task:activate -- <TASK-ID>`：校验依赖并从任务卡生成下一张活动任务。
- `pnpm task:advance -- --ci=success --commit=<SHA>`：实现优先模式下把当前卡登记为Implemented、记录延期验证并激活下一张实现依赖已满足的任务。
- `pnpm task:close -- --ci=success --commit=<SHA>`：关闭Implemented任务并自动激活下一张依赖已满足的任务。
- GitHub `Task Governance`：按需拉取比较基准，验证任务状态、镜像、修改范围和证据结构。
- GitHub `Quality`：调用`.github/workflows/quality-core.yml`，以聚合检查`quality`作为开发合并判据。

PR产生新提交时，旧的Quality和Task Governance运行会自动取消；`main`运行不会取消。每个作业设置独立超时，避免Runner无界挂起。

## 5. 开发质量核心

`.github/workflows/quality-core.yml`只服务开发阶段的PR与`main`质量验证，包含：

```text
static-checks
├─ task:validate
├─ workspace / boundary
└─ format / lint / typecheck

tests（并行矩阵）
├─ unit
├─ integration
├─ migration
└─ security

desktop-e2e
├─ Electron Playwright
├─ xvfb显示环境
└─ 失败截图、trace与显示证据

build
package-smoke

quality
└─ 聚合全部结果；任一必要作业失败则失败
```

所有测试、E2E、构建和打包作业都会上传独立诊断产物。中间作业失败不会阻止其他并行作业执行，因此一次CI即可暴露全部独立问题。

## 6. 测试路由

基础命令由 M0-01 建立。专项测试只能在对应底座任务完成后启用；尚未建立的命令必须明确返回“未就绪”，不能以空测试假装通过。

| 变更 | 追加验证 |
|---|---|
| Migration、Repository | `test:migration`、`test:integration` |
| Electron、IPC、路径、安全 | `test:security`、`test:e2e` |
| Editor、Candidate、Revision、Lock | `test:unit`、`test:integration`、`test:e2e` |
| Prompt、Provider、约束包 | `test:eval`、`test:integration` |
| 性能、DPI | `test:perf`、`test:e2e` |

PR和`main`使用并行专项测试；`pnpm test`保留为本地完整回归命令，不再作为CI中混合所有故障域的单一步骤。

## 7. 发布边界

Release保持冻结且仅允许手工触发，不接入开发PR质量门，不建立夜间构建或自动发布。发布流程继续由`.github/workflows/release.yml`和M8-03验收任务控制；未到发布阶段不得由日常开发自动化触发。

## 8. 证据

每张任务保留 `summary.md`、`commands.txt`、`known-risks.md`；专项任务再加入测试结果、截图和性能报告。未运行、失败或环境限制必须如实写入。

GitHub Actions诊断产物默认保留14天。自动上传产物用于定位与复核，不自动等同于任务卡的最终Verified证据。

# WorldForge 开发自动化控制规范

> 状态：Active  
> 集成分支：`main`  
> 授权来源：作者于2026-07-17明确要求，后续所有改动必须提交Pull Request，禁止机器人或自动化直接写入`main`。

## 1. 目标

把任务选择、依赖检查、修改范围、质量验证、证据归档、受控合并、主线复核和状态回写组成可执行闭环。自动化只替代重复操作，不降低任务卡、测试、安全、数据边界和审查控制。

## 2. 权威状态

- `docs/tasks/ACTIVE_TASK.json`：机器可读的唯一活动任务状态。
- `docs/tasks/ACTIVE_TASK.md`：由JSON生成的人类可读镜像。
- `docs/tasks/TASK_INDEX.md`：任务依赖和完成状态。
- 独立任务卡：目标、非目标、实现范围和验收要求。

`pnpm task:validate`会重新生成预期镜像并与`ACTIVE_TASK.md`逐字比较。JSON与Markdown不一致时CI直接失败，必须运行`pnpm task:sync`修复，禁止手工维持两个状态源。

## 3. 任务分支与PR模式

```text
激活一张任务
→ 创建独立任务分支
→ 验证依赖与允许路径
→ 最小完整实现
→ 本地验证
→ 提交Pull Request
→ 六项永久门禁
→ 审查条件复核
→ Controlled Merge通过Merge API执行squash
→ Main Verification复核最终main提交
→ 证据与追踪回写
→ 激活下一张依赖已满足的任务
```

约束：

1. 同一时刻只有一张`IN_PROGRESS`任务。
2. 每张任务使用独立非`main`分支，分支名使用`work/`、`feat/`、`fix/`、`refactor/`、`test/`、`docs/`或`chore/`前缀。
3. 所有代码、文档、任务状态和证据变更必须通过Pull Request进入`main`。
4. 机器人和GitHub Actions不得执行`git push main`；只有仓库内已审计的Controlled Merge脚本可在六项门禁全部成功后调用Pull Request Merge API。
5. PR必须通过`pr-policy`、`task-governance`、`quality / quality`、`security`、`performance`和`evidence`；任一必要检查失败即禁止合并。
6. Controlled Merge必须阻止Draft、Changes Requested、未解决线程、头SHA变化和落后于当前main的分支。
7. 每张任务使用独立原子提交或连续提交组，提交信息必须包含任务ID。
8. 任何失败转为`BLOCKED`，保留复现、日志、数据安全状态和回退方式。
9. 不允许跳过失败测试、伪造证据、绕开阶段门或提前实现未来任务。
10. 冻结架构发生真实冲突时暂停受影响任务，只处理冲突本身。
11. `main`上的提交只允许来自满足Ruleset的PR合并。
12. 合并后必须产生针对最终squash SHA的`main-verification`状态；空白状态不视为主线复核完成。

### 3.1 实现优先PR模式

`implementation-pr`用于先完成各任务卡的真实编程，再统一处理明确延期的非编程验收，同时保留PR审查和受控合并：

```text
唯一活动任务
→ 独立任务分支
→ 最小完整端到端实现
→ 必要专项测试
→ 创建或更新PR
→ 六项远端门禁全部通过
→ 在同一PR中登记Implemented及deferredVerification
→ 在同一PR中准备下一任务状态
→ 受控squash合并
→ 最终main提交复核
→ 下一任务另开分支和PR
```

任务实现、当前任务状态回写和下一任务激活默认放在同一PR。只有修复历史状态、策略漂移或独立治理缺陷时，才允许额外创建治理型PR，避免每张任务重复运行一次完整CI。

延期项统一包括标准证据包、截图、人工与穷尽质量矩阵、追踪矩阵Verified状态和最终关闭。延期不等于省略：`Implemented`只能满足本模式下的后续编程依赖，不能用于发布、P0验收或Verified声明。代码、测试、Migration、安全和数据边界失败不得延期，必须立即阻断。

### 3.2 Draft与正式评审

Draft PR用于持续开发和快速反馈：

```text
Draft
├─ PR Policy
├─ Task Governance
├─ Evidence
├─ Quality静态检查
├─ Security快速扫描
└─ Performance延期状态

Ready for Review
└─ 同名六项检查重新执行完整门禁
```

`ready_for_review`必须触发完整Quality、Security和Performance；`converted_to_draft`必须取消旧重型运行并恢复轻量检查。Draft阶段的绿色状态不具备合并资格，Controlled Merge仍以PR实时状态为准。

### 3.3 治理型PR

`policy/`、`chore/governance-`和`fix/governance-`分支可以修改治理白名单中的工作流、策略脚本、门禁文档与固定治理测试。治理型PR仍必须通过六项永久门禁，不得借治理白名单修改产品代码。

## 4. 自动门禁

- `pnpm task:validate`：活动任务、任务索引、授权模式、PR分支、必读文件及JSON/Markdown镜像一致性。
- `pnpm task:preflight`：本次变更是否越过允许路径或命中禁止路径。
- `pnpm check:workspaces`：包清单、入口和构建脚本。
- `pnpm check:boundaries`：跨层依赖和Renderer/Domain/Contracts的Node边界。
- `pnpm task:verify`：证据目录最低结构。
- `pnpm task:activate -- <TASK-ID>`：校验依赖并从任务卡生成下一张活动任务。
- `pnpm task:reopen -- <TASK-ID>`：暂停尚未编程的当前任务，重新打开已登记到`deferredVerification`的Implemented任务处理审计缺口。
- `pnpm task:advance -- --ci=success --commit=<SHA>`：实现优先模式下在PR分支登记当前卡为Implemented、记录延期验证并准备下一任务状态。
- `pnpm task:close -- --ci=success --commit=<SHA>`：在PR分支关闭Implemented任务并准备下一张依赖已满足的任务。
- GitHub `PR Policy`：验证真实PR头分支、治理白名单及永久工作流策略。
- GitHub `Task Governance`：验证任务状态、镜像、修改范围和证据结构。
- GitHub `Security`：Draft保留快速扫描，Ready执行依赖审计和应用安全测试。
- GitHub `Performance`：Draft返回延期状态，Ready执行性能预算及AI协议与评估基线。
- GitHub `Evidence`：验证发生变化的每个任务证据包及Manifest完整性。
- GitHub `Quality`：调用`.github/workflows/quality-core.yml`，以聚合检查`quality / quality`作为合并判据。
- GitHub `Controlled Merge`：从main读取已审计脚本，串行复核全部门禁和审查状态，调用Merge API完成squash。
- GitHub `Main Verification`：由Controlled Merge显式调度，验证最终main SHA、来源PR和来源门禁，再运行完整Linux质量复核。

PR产生新提交时，同一PR旧门禁运行会自动取消。每个作业设置独立超时，避免Runner无界挂起。

`Quality`、`Security`、`Performance`、`Evidence`和`Task Governance`只监听PR，不监听普通`push main`。受控合并后的唯一质量入口是`Main Verification`，避免因令牌触发限制产生空白状态，也避免双重全量验证。

## 5. 开发质量核心

`.github/workflows/quality-core.yml`服务开发PR、合并后主线复核与Release，包含：

```text
static-checks
├─ task:validate
├─ workspace / boundary
└─ format / lint / typecheck

tests（并行矩阵）
├─ unit
├─ integration
└─ migration

security-tests（按调用方开关）
performance-eval（按调用方开关）

desktop-e2e
build
package-smoke
quality（聚合结果）
```

Draft只执行`static-checks`和聚合Job。Ready PR执行测试、E2E、Build和Package Smoke；独立`Security`与`Performance`负责对应永久检查。`Main Verification`和`Release`重新启用全部套件，确保最终提交和发布产物不只依赖历史结果。

诊断产物只在Job失败时上传，默认保留7天。Actions Artifact用于定位失败，不自动等同于任务卡的最终Verified证据。

## 6. 测试路由

| 变更 | 追加验证 |
|---|---|
| Migration、Repository | `test:migration`、`test:integration` |
| Electron、IPC、路径、安全 | `test:security`、`test:e2e` |
| Editor、Candidate、Revision、Lock | `test:unit`、`test:integration`、`test:e2e` |
| Prompt、Provider、约束包 | `test:eval`、`test:integration` |
| 性能、DPI | `test:perf`、`test:e2e` |

Ready PR门禁仍采用全量关键套件。风险分级跳过只有在统一影响分类器经过影子验证且漏判为零后才能实施。

## 7. 发布边界

Release保持冻结且仅允许手工触发，不接入开发PR自动发布，不建立夜间发布。发布流程继续由`.github/workflows/release.yml`和M8-03验收任务控制；未到发布阶段不得由日常开发自动化创建Release。

## 8. 证据

每张任务保留`summary.md`、`commands.txt`、`known-risks.md`、人工验收、质量矩阵、测试结果和截图清单。`manifest.json`必须逐文件登记相对路径、字节数和SHA-256；Evidence门禁同时拒绝路径逃逸、符号链接、哈希漂移、截图清单不一致和未登记文件。仓库根测试输出继续忽略，但`docs/test-evidence/**/test-results/`必须纳入版本控制。未运行、失败或环境限制必须如实写入。

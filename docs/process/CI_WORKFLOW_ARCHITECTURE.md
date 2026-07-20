# WorldForge CI与永久门禁架构

## 1. 工作流分层

| 工作流 | 触发 | 职责 | 必需检查 |
|---|---|---|---|
| `PR Policy` | PR→main | 分支、治理白名单和永久CI策略 | `pr-policy` |
| `Task Governance` | PR→main | 任务状态、镜像、允许路径和任务转换 | `task-governance` |
| `Quality` | PR→main | Draft静态检查；Ready关键测试、E2E、Build和现有Package Smoke | `quality / quality` |
| `Security` | PR→main | 凭据扫描始终执行；依赖与应用安全按变更路由 | `security` |
| `Performance` | PR→main、手动 | 按任务声明和性能敏感路径执行 | `performance` |
| `Evidence` | PR→main、每周、手动 | PR校验变化证据；定时/手动全量重放 | `evidence` |
| `Controlled Merge` | 永久检查完成 | 聚合相同Head SHA并squash合并 | 否 |
| `Main Verification` | 合并后幂等调度 | 核验最终SHA、来源门禁和静态一致性 | `main-verification` |
| `Repository Governance` | 治理PR、每周、手动 | 审计永久自动化与原生Ruleset | 否 |
| `Branch Hygiene` | 每周、手动 | 报告并可选清理安全废弃分支 | 否 |
| `Release` | 手动 | 完整发布门和三平台打包 | 否 |

`quality-core.yml`由Quality、Main Verification和Release复用。调用方通过输入决定静态模式或完整发布模式。

## 2. Draft快速反馈

Draft保留固定检查名称，但只运行低成本路径：

```text
PR Policy
Task Governance
Evidence变化文档检查
Quality静态检查
Security凭据扫描
Performance快速路由
```

Draft结果不能授权合并。转为Ready后，同一Head重新运行必要门禁。

## 3. Ready门禁

进入main前仍要求六项检查成功：

```text
pr-policy
+ task-governance
+ quality / quality
+ security
+ performance
+ evidence
```

其中：

- Quality运行关键测试、Electron E2E、Build和现有Package Smoke；
- Security的Dependency Audit只在依赖或Workflow输入变化时执行；
- Application Security只在任务要求或Main/Preload/IPC/Core/Migration等安全边界变化时执行；
- Performance只在任务要求`test:perf`、性能敏感路径变化或手动触发时执行；
- 未命中重型路由的工作流仍返回同名成功检查，Controlled Merge无需猜测缺失状态；
- Evidence只校验本次变化的任务证据文档。

## 4. 职责去重

三个治理门禁必须各自单一负责：

```text
PR Policy
└─ PR分支、自动化布局、CI策略

Task Governance
└─ ACTIVE_TASK、镜像、allowedPaths、任务转换

Evidence
└─ 证据文档完整性与来源提交
```

Task Governance不得重复调用`taskctl pr-policy`或Evidence结构校验。Evidence不得重复验证任务分支和allowedPaths。

## 5. Controlled Merge

Controlled Merge从`main`读取已审计脚本，聚合相同PR Head SHA的六项检查，并再次确认：

- PR为Ready且未变更Head；
- 分支未落后`main`；
- 没有Changes Requested；
- 没有未解决线程；
- 六项检查属于当前Head的最新运行；
- 路由后的Security与Performance步骤真实成功。

合并固定使用squash，并向Merge API绑定受检SHA。

## 6. Main Verification

合并后不再重复完整发布级套件。Main Verification执行：

1. 最终`main` SHA和输入SHA一致；
2. 来源PR、来源Head和merge SHA一致；
3. 来源六项永久检查成功；
4. 在最终提交上执行task、workspace、boundary、format、lint、typecheck；
5. 发布`main-verification`状态。

下一次Controlled Merge只等待当前main的最终状态，不重复运行Unit、Integration、Migration、E2E、Package、Security和Performance。

## 7. Evidence

Evidence采用文档记录：

```text
summary.md
commands.txt
known-risks.md
manifest.json
```

不要求截图、截图清单、单独人工验收文件或单独质量矩阵。人工复核和质量结论直接写入`summary.md`。

运行范围：

- PR：校验变化目录；
- 每周或手动：全量重放全部`Verified`任务；
- 里程碑与Release：按需手动全量运行。

Actions Artifact只用于失败诊断，不能替代版本化文档，也不应为了证据生成无人查看的截图。

## 8. 阶段关闭

实现优先模式下，任务完成真实代码和专项验证后可登记`Implemented`并进入延期账本。普通任务不再逐张创建纯Evidence/Verified关闭PR。

M3-06至M3-10连续实现，M3-10后统一执行M3批次复验；进入M4前完成M3全部必要关闭。

## 9. 安全与发布边界

- Secret Scan每个PR执行；
- 数据、Migration、恢复、IPC、路径和凭据边界失败始终阻断；
- Release保持手动触发，完整执行Quality、Security、Performance和三平台Package；
- 日常开发优化不得削弱发布门或数据安全门。

## 10. 永久自动化约束

- 工作流必须通用，不得硬编码任务ID、固定PR、固定任务分支或一次性修复；
- 禁止`pull_request_target`、`repository_dispatch`和业务工作流直接写`main`；
- Checkout关闭凭据持久化；
- 正式门禁验证已提交PR Head，前后执行clean-tree检查；
- 新增或改变永久能力必须同步更新CI策略和本架构文档。

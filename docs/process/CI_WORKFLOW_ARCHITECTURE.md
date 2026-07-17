# WorldForge CI与永久门禁架构

## 1. 正式工作流

| 工作流 | 触发 | 职责 | 是否建议设为必需检查 |
|---|---|---|---|
| `PR Policy` | PR→main | 校验真实PR分支、治理例外范围、工作流权限和禁止直推/自动合并规则 | 是：`pr-policy` |
| `Task Governance` | PR→main、main合并后 | 校验活动任务、状态镜像、修改路径和证据结构 | 是：`task-governance` |
| `Quality` | PR→main、main合并后 | 静态检查、四类测试、Electron E2E、Build、Package Smoke与唯一聚合门 | 是：`quality / quality` |
| `Security` | PR→main、main合并后 | 锁文件高危依赖审计与仓库凭据扫描 | 是：`security` |
| `Branch Hygiene` | 每周、手动 | 只读列出已合并/过期/无PR分支，生成清理报告；不自动删除 | 否 |
| `Release` | 手动 | 复用Quality，执行发布门、三平台独立Build+Package、校验和及GitHub Release | 否，使用`release`环境人工审批 |

`quality-core.yml`是可复用实现，不单独配置为分支必需检查。

## 2. PR合并门

所有进入`main`的PR必须同时满足：

```text
pr-policy
+ task-governance
+ quality / quality
+ security
= 允许人工合并
```

机器人和GitHub Actions不得：

- 直接推送`main`；
- 自动合并PR；
- 使用`pull_request_target`或`workflow_run`间接取得高权限；
- 在开发工作流中申请`contents: write`；
- 使用保留凭据的Checkout。

唯一写权限例外是手动Release的发布Job，用于创建不可变GitHub Release。

## 3. 私有仓库安全策略

当前仓库是个人私有仓库。GitHub CodeQL和Dependency Review在未购买并启用GitHub Code Security时不可作为稳定必需门，因此采用：

- `pnpm audit --audit-level=high`阻断高危依赖；
- 强模式凭据扫描阻断GitHub、AWS、Google、Slack及私钥；
- 现有`tests/security`验证IPC、路径、只读和数据库安全边界；
- GitHub账户侧继续启用Dependabot alerts和security updates。

获得GitHub Code Security授权后，可另行增加CodeQL和Dependency Review，但不得在功能不可用时把它们配置成必需检查。

## 4. 分支治理

- 当前任务分支必须与`ACTIVE_TASK.json.activeTask.branch`一致。
- 任务PR完成并激活下一任务时，PR头分支可匹配合并前活动任务分支。
- `policy/`、`chore/governance-`、`fix/governance-`仅允许修改治理白名单路径。
- 每周Branch Hygiene报告将分支分类为：默认分支、活动任务、开放PR、可删除候选、孤立工作。
- 分支删除必须人工执行；自动化不得删除分支。

## 5. Release约束

Release仅允许`workflow_dispatch`手工触发，并要求：

1. 当前引用为`main`；
2. M8-03发布验收门通过；
3. 完整Quality通过；
4. Linux、Windows、macOS各自在本Job内执行`pnpm build`后再`pnpm package`；
5. 发布Job进入`release`环境；
6. 已存在的Tag或Release拒绝覆盖；
7. 所有资产生成SHA-256清单。

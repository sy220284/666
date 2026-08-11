# CI工具链与历史多任务设计

> 状态：Superseded  
> 被替代规则：`docs/tasks/TASK_AUTHORIZATION.json` Schema 2、`AGENTS.md`、`docs/PROJECT_EXECUTION_ENTRY.md`、`docs/process/DEVELOPMENT_AUTOMATION.md`

## 1. 当前仍有效的历史能力

本文原方案中的以下能力继续有效：

- GitHub Actions可手动导出版本锁定的离线格式化/质量工具链；
- 无数据依赖的质量Job可以并行运行；
- main写入、Controlled Merge、Main Verification、任务事实关闭和发布保持串行；
- 工具链Artifact必须包含来源SHA、锁文件摘要、版本清单和SHA-256。

## 2. 已废弃部分

以下设计不得继续执行或作为新代码依据：

- 每个任务创建独立分支；
- 多个产品任务PR并行；
- `parallel-pr`授权模式；
- `work/<TASK-ID>`、`feat/*`、`fix/*`、`policy/*`等临时分支；
- 任务专属验证分支；
- 独立Evidence关闭PR。

历史提交和Evidence中的旧分支名只作为来源记录保留。

注意：当前永久`governance`不是上述“任务治理临时分支”。它是仓库固定三分支模型的一部分，与产品`work`组成两条长期集成lane。

## 3. 当前执行模型

```text
产品：最新已验证main → work → main PR
治理：最新已验证main → governance → main PR
→ 四项永久门禁
→ Controlled Merge（Squash，main写入串行）
→ Main Verification
→ 产品任务需要时发布task-verification/<TASK-ID>
→ Integration Branch Synchronization
→ Branch Inventory保持main/work/governance
```

每条集成lane最多一个开放PR。`work`与`governance`可以并行准备，但main合并、Main Verification和同一主线状态推进始终串行。

## 4. 工具链导出

`Toolchain Export`可通过`workflow_dispatch`触发，也可由同仓库`work → main`或`governance → main`的Quality按机器清单风险路由调用；它不新增永久Required Context。

输入：

- 完整40位`source_sha`；
- `formatter`或`quality`配置；
- Linux、Windows或macOS托管Runner。

输出：

- 最小`package.json`；
- 生成的`pnpm-lock.yaml`；
- 离线pnpm Store；
- `manifest.json`；
- `SHA256SUMS.txt`。

上传前必须在干净临时目录执行离线冻结安装并核对工具版本。

## 5. 并行边界

允许并行：

- 同一PR Head上无数据依赖的Quality、Security、Performance内部Job；
- `work`产品lane与`governance`治理lane各自准备一个PR；
- Release中的只读资格检查与独立平台准备；
- 本地独立工作区中的不冲突分析和实现。

必须串行或受控：

- main写入；
- Controlled Merge；
- Main Verification；
- 产品任务最终Verified事实发布；
- 同一集成lane的Ref重置；
- Publish。

一条lane合并后，另一条lane仅在无开放PR且没有独有提交时自动fast-forward；存在开放PR时明确skip，不能覆盖并行工作。

## 6. 引用规则

后续文档和脚本不得引用本文的旧多任务分支方案作为活动规范。当前权威入口为：

```text
AGENTS.md
docs/PROJECT_EXECUTION_ENTRY.md
docs/process/DEVELOPMENT_AUTOMATION.md
docs/process/CI_WORKFLOW_ARCHITECTURE.md
docs/process/WORKFLOW_EXECUTION_ORDER.md
```

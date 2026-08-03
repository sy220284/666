# CI工具链与历史多任务设计

> 状态：Superseded  
> 被替代规则：`docs/tasks/TASK_AUTHORIZATION.json` Schema 2、`AGENTS.md`、`docs/process/DEVELOPMENT_AUTOMATION.md`

## 1. 当前有效部分

本文原方案中的以下能力继续有效：

- GitHub Actions可手动导出版本锁定的离线格式化/质量工具链；
- 无数据依赖的质量Job可以并行运行；
- main写入、Main Verification、任务关闭和发布保持串行；
- 工具链Artifact必须包含来源SHA、锁文件摘要、版本清单和SHA-256。

## 2. 已废弃部分

以下设计自Schema 2授权起全部废弃，不得继续执行或作为新代码依据：

- 多个任务分支；
- 多个Draft或Ready PR并行；
- `parallel-pr`授权模式；
- `work/<TASK-ID>`、`feat/*`、`fix/*`、`policy/*`等分支；
- PR正文标记作为多分支路由入口；
- 任务专属验证分支；
- 独立治理关闭PR。

历史提交和Evidence中出现的旧分支名只作为来源记录保留，不得复用。

## 3. 当前执行模型

```text
最新已验证main
→ 唯一work
→ 所有任务实施、测试、文档和Evidence集成
→ 唯一work → main PR
→ 六项永久门禁
→ Controlled Merge（Squash）
→ Main Verification
→ 任务有效状态关闭
→ Work Synchronization受控重置work到main
```

仓库长期只允许`main`和`work`，同一时刻最多一个开放正式PR。

## 4. 工具链导出

`Toolchain Export`继续由`workflow_dispatch`触发，不属于PR必需检查。

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

- 同一PR Head上无数据依赖的Quality、Security、Performance、Evidence Job；
- Release中的只读资格检查与独立平台准备；
- 本地独立工作区中的不冲突分析和实现。

禁止并行：

- 多个正式PR；
- 多个正式分支；
- main写入；
- Main Verification；
- 任务有效关闭；
- Work Synchronization；
- Publish。

## 6. 引用规则

后续文档和脚本不得引用本文的多分支章节作为活动规范。发现旧引用时，应改指：

```text
AGENTS.md
docs/PROJECT_EXECUTION_ENTRY.md
docs/process/DEVELOPMENT_AUTOMATION.md
docs/process/CI_WORKFLOW_ARCHITECTURE.md
```

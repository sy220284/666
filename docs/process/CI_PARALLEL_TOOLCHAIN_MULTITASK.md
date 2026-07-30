# CI并行、离线工具链与多任务治理最终设计

## 1. 目标

本方案同时交付三项仓库级能力：

1. GitHub Actions可手动导出可验证的离线格式化/质量工具链。
2. 无数据依赖的质量门禁并行运行，缩短PR和发布关键路径。
3. 任务、分支和PR不设置仓库级数量上限；实际按少量并行PR运行，`main`写入保持串行。

实际使用预计最多同时开放5个PR，因此不引入100+ PR分页、无界队列或复杂公平调度。

## 2. 最终执行模型

```text
多个任务
├─ 多个分支
├─ 多个Draft PR
└─ 多个Ready PR
      ↓
各PR按自身Head独立执行永久门禁
      ↓
受控合并每次只选择一个合格PR
      ↓
Squash Merge绑定受检Head SHA
      ↓
Main Verification
      ↓
继续处理其他Ready PR
```

仓库不在任务状态、分支或PR层配置数量上限。GitHub平台自身的Runner容量不属于仓库治理限制。

## 3. 多任务兼容迁移

### 3.1 新真源

- `docs/tasks/TASK_AUTHORIZATION.json`：全局授权与主线写入模式。
- `docs/tasks/runtime/<TASK-ID>.json`：每张活动任务的独立机器状态。
- PR正文标记：`<!-- worldforge-task: M8-07 -->`。

旧的`ACTIVE_TASK.json`与`ACTIVE_TASK.md`暂时保留为兼容锚点，供历史关闭流程和旧命令使用；带任务标记的PR由并行任务策略读取独立运行时文件，不再要求来源分支等于唯一活动分支。

### 3.2 约束

- 一个PR绑定一个主任务。
- 一个任务可以对应多个分支和多个PR。
- 普通任务PR只能修改其运行时文件和`allowedPaths`覆盖范围。
- 治理分支可以迁移全局授权和多张运行时文件，但仍受任务允许路径与永久门禁约束。
- 任务依赖仍必须满足。
- 任务状态关闭仍需Evidence和主线可达性。
- 没有任务标记的PR继续执行旧治理路径，保证历史兼容。

## 4. 永久工具链导出

`Toolchain Export`仅由`workflow_dispatch`触发，不属于PR必需检查。

输入：

- 完整40位`source_sha`；
- `formatter`或`quality`配置；
- Linux、Windows或macOS托管Runner。

输出目录包含：

- 最小`package.json`；
- 生成的`pnpm-lock.yaml`；
- 离线pnpm Store；
- `manifest.json`；
- `SHA256SUMS.txt`。

上传前必须在干净临时目录执行`pnpm --offline --frozen-lockfile`并核对工具版本。

## 5. 门禁并行化

### 5.1 Performance

`performance`与`ai-eval`使用独立Runner并行。必需检查名仍为`performance`；受控合并等待整个Performance工作流成功，因此两个子任务缺一不可。

### 5.2 Main Verification

来源PR/受检Head核验与最终main静态核验并行，最终状态发布等待两者成功。

### 5.3 Release

Release Quality、发布资格检查并行启动。三平台正式Package Matrix只执行一次；`quality-core`中的Package Smoke在Release调用时关闭。Publish等待Quality、Release Gate和三平台Package全部成功。

### 5.4 Electron E2E

Electron E2E分片属于下一次性能测量后的实施项。必须先拆分超大规格文件，再启用Shard，避免单文件继续独占关键路径。本PR不通过重复执行测试伪造并行收益。

## 6. 串行硬边界

以下顺序不可并行：

- 当前PR受控合并 → Main Verification → 下一PR写入main；
- Build → Package → Asset Verify → Packaged Startup Smoke；
- 实现进入main → 最终Evidence绑定 → Verified；
- Quality + Release Gate + Package Matrix → Publish。

## 7. 验收

- 带不同任务标记的PR可以同时通过分支与路径治理。
- 同一PR的新Head只取消自身旧运行，不影响其他PR。
- 工具链Artifact可离线安装并运行对应工具。
- Performance两个子任务均真实执行。
- Main Verification两条只读分支并行，最终状态仍聚合。
- Release不再重复执行三平台Package Smoke。
- 任一永久门禁失败仍阻断合并。

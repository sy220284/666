# M8-06 最终验证摘要

## 结论

M8-06发布资格与任务治理硬化已完成最终验证。实现PR #231受控压缩合并为main提交`66e17c99ba84a6f8f40dce6bec97df7c6d7898e9`，Main Verification运行`30519100282`成功。

发布工具已经移除对固定任务`M8-02`的依赖。发布资格由全部独立任务、最终`VERIFIED_HOLD`、延期验证账本、最终任务一致性以及受检提交可达性共同决定。

## 实现范围

- `scripts/release-tool.mjs`
  - 同时读取`TASK_INDEX.md`与`ACTIVE_TASK.json`。
  - 要求全部独立任务为Verified。
  - 要求活动任务处于最终`VERIFIED_HOLD`。
  - 要求`activeTask.id`、`verificationHold.taskId`和`lastVerifiedTask.id`一致。
  - 要求`finalTask=true`、`nextTaskId=null`。
  - 要求`deferredVerification`与`deferredTasks`为空。
  - 要求最终保持清单无重复并精确覆盖独立任务索引。
  - 使用`git merge-base --is-ancestor`验证实现提交和Evidence提交可达。
  - 将被吸收历史任务区排除在独立任务发布判定之外。
- `.github/workflows/release.yml`
  - Release资格检查和发布前复核均获取完整Git历史。
  - 创建校验和与GitHub Release之前再次执行动态发布门。
- `tests/unit/release-tool.test.ts`
  - 覆盖未完成任务、延期账本、保持状态、清单一致性、提交可达性、被吸收任务和合法放行路径。
- 文档
  - 发布资格规范、任务索引、路线图、P0维护矩阵、README、变更记录和开发自动化规范已经同步。

## 验证结果

实现PR最终Head为`64d3de74aacada8671d1ac932978c67c9534d8be`，永久门禁全部成功：

| 门禁 | 运行 | 结果 |
|---|---:|---|
| PR Policy | 30518250676 | success |
| Task Governance | 30518250667 | success |
| Evidence | 30518250717 | success |
| Quality | 30518250847 | success |
| Security | 30518250691 | success |
| Performance | 30518250702 | success |
| Repository Governance | 30518250694 | success |

受控压缩合并生成main提交`66e17c99ba84a6f8f40dce6bec97df7c6d7898e9`。Main Verification运行`30519100282`成功，`validate-main`、静态检查、聚合质量和最终状态发布均成功。

## 边界复核

- 未修改产品业务功能、数据库Schema或Migration。
- 未扩大V1.0自用便携交付边界。
- 未执行真实GitHub Release。
- 发布工具只判定资格，不替代完整Quality、Security、Performance和三平台构建。
- 历史已Verified任务和Evidence保持冻结。

## 最终状态

M8-06满足Verified关闭条件。全部38张独立任务完成验证，延期账本清空，项目进入最终`VERIFIED_HOLD`。

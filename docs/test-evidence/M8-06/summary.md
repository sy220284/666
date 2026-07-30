# M8-06 验证摘要

## 结论

M8-06发布资格与任务治理硬化已完成实现验证。受检实现提交为`6cf8b81e8ceff9b87c26ad29eaa8bfb0f4c73841`。

发布工具已经移除对固定任务`M8-02`的依赖。发布资格改由全部独立任务、最终`VERIFIED_HOLD`、延期验证账本、最终任务一致性以及受检提交可达性共同决定。

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
  - 新增发布资格规范。
  - 同步任务索引、路线图、P0维护矩阵、README、变更记录和开发自动化规范。

## 验证结果

受检实现提交的永久门禁全部成功：

| 门禁 | 运行 | 结果 |
|---|---:|---|
| PR Policy | 30516672698 | success |
| Task Governance | 30516672657 | success |
| Evidence | 30516672691 | success |
| Quality | 30516672758 | success |
| Security | 30516672817 | success |
| Performance | 30516672653 | success |
| Repository Governance | 30516672658 | success |

Quality包含格式、Lint、类型检查、单元、集成、Migration、Electron E2E、覆盖率、构建及Linux、Windows、macOS打包启动冒烟，均成功。

## 边界复核

- 未修改产品业务功能、数据库Schema或Migration。
- 未扩大V1.0自用便携交付边界。
- 未执行真实GitHub Release。
- 发布工具只判定资格，不替代完整Quality、Security、Performance和三平台构建。
- 历史已Verified任务和Evidence保持冻结。

## 当前状态

M8-06可以登记为Implemented。后续仍需正式PR最终Head六项Ready门禁、受控压缩合并、Main Verification及独立治理关闭，完成后才能标记Verified。

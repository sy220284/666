# M10-09 Evidence 收口与自动合并竞态治理

> 状态：Implemented  
> 里程碑：M10 稳定性与治理续作  
> 优先级：P0  
> 执行分支：`work`  
> 目标分支：`main`  
> 主线基线：`c5a4d118249fb67bded67e9d7c7fd286b10a9e03`

## 目标

修复 Ready PR 在最终 Evidence 尚未绑定最新实现提交时被 Controlled Merge 自动合并的竞态，并将 M10-08 已通过全量验证的最终 Evidence 受控同步到主线。

## 触发事实

M10-08 实施 Head `437e639055bb852e9e63ecada0455d3a0b8a7954` 完成全部永久检查后，Controlled Merge 于 2026-08-05 10:53:20（UTC+8）立即合并 PR #316。最终 Evidence 原子提交随后才写入 `work`，未进入合并树。现有 Evidence 策略只验证 `implementationCommit` 是 PR Head 的祖先，没有验证该提交之后是否仍存在产品、测试、脚本、配置或工作流变化，因此旧 Evidence 可以保持绿色并触发自动合并。

## 依赖

- M10-08 已通过 `task-verification/M10-08=success`；
- 当前 `main` 已通过 `main-verification=success`；
- 当前工作分支已从受控合并后的 `main` 重新同步。

## 非目标

- 不修改产品功能、业务协议、数据库、Migration 或发布内容；
- 不撤销 M10-08 已验证实现；
- 不把 Runtime 静态状态改写为伪造的 Verified；
- 不允许直接写入 `main`；
- 不通过延迟、人工等待或关闭自动合并规避竞态。

## 实施内容

1. Evidence 工作流显式传入 PR Draft/Ready 状态。
2. Draft 阶段继续验证文件完整性、Hash、路径安全和实现提交祖先关系。
3. Ready 阶段增加“最终收口”校验：
   - manifest 必须使用 Schema 2；
   - `implementationCommit` 必须是当前 PR Head 的祖先；
   - 从 `implementationCommit` 到当前 Head 的变更只能属于当前任务卡、Runtime、TASK_INDEX、Evidence 与明确授权的文档收口路径；
   - 产品代码、测试、脚本、配置、工作流或其他任务 Evidence 出现在该区间时立即失败。
4. 增加单元测试，覆盖旧 Evidence、代码后移、跨任务 Evidence、非法收口路径、合法最终 Evidence Head。
5. 规则已同步到执行入口、任务模板和任务索引。
6. M10-08 最终 Evidence 已绑定受控 Squash 后的主线提交 `c5a4d118249fb67bded67e9d7c7fd286b10a9e03`，原 PR 实施 Head 保留在摘要中用于测试追溯。

## 职责、状态所有权与依赖方向

- `scripts/evidence-policy.mjs` 是 Evidence 内容与收口语义的唯一真源；
- `.github/workflows/evidence.yml` 只负责传入精确 PR Head、Base 与 Draft/Ready 状态；
- `scripts/automerge.mjs` 继续只消费永久 Check 结果，不复制 Evidence 解析逻辑；
- Evidence manifest 只绑定已验证实现提交，不绑定包含自身的最终 Head，避免提交 SHA 自引用。

## 验收

1. Draft PR 的中间 Evidence 不会阻断正常实施。
2. Ready PR 使用过期 `implementationCommit` 且其后存在代码或治理实现变更时，Evidence 必须失败。
3. `implementationCommit` 之后仅有当前任务 Evidence 与状态文档收口时，Evidence 通过。
4. 跨任务 Evidence、产品代码、测试、脚本、配置或工作流出现在收口区间时，Evidence 失败并列出路径。
5. Controlled Merge 不能在最终 Evidence 未绑定最新实现提交时合并。
6. M10-08 最终 Evidence 与任务卡进入 `main`，且历史 manifest 绑定主线合并提交。
7. Task Governance、PR Policy、Evidence、Format、Lint、Typecheck、Unit、Integration、Migration、Coverage、Security、Performance、Electron E2E 与 Build 全部通过。

## 实施结果

实现提交 `2ed140991b823987b2cd99524176bdeaea0056fe` 已完成 Draft 静态矩阵：Task Governance、PR Policy、Evidence、Repository Governance、Security、Performance 与 Quality 全部成功。当前收口 Head 只包含 M10-09 任务卡、Runtime、任务索引和 M10-09 Evidence；Ready 永久矩阵将验证新增单元测试、完整产品测试和自动合并竞态门禁。

## Evidence

保存到：`docs/test-evidence/M10-09/`

## 回滚策略

回滚 Evidence Ready 收口检查、工作流环境变量、测试和文档；M10-08 已合并实现与主线验证状态保持不变。

## 完成条件

- 竞态已用永久自动化门禁消除；
- M10-08 最终 Evidence 已受控同步；
- M10-09 Runtime、TASK_INDEX、任务卡和 Evidence 同步；
- PR 经 Controlled Merge 合并，并通过 Main Verification 与任务 Context。

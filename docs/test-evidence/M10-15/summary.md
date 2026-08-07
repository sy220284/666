# M10-15 最终验证摘要

## 实施绑定

- 任务：`M10-15`
- 来源 PR：`#324`
- 主线基线：`233f76a9119b92e9bafe02471667872a60966177`
- 最终实施提交：`2e2ca2937754eeb260dc72e6dd90896c2ce35a90`
- Ready 全量验证 Head：`52c3d9a8858b607ea638084e1f59363cd701c5f3`
- 静态状态：`IMPLEMENTED`
- 当前有效状态：合并前 `VERIFICATION_PENDING`

## 修复结论

1. Capability Matrix 的 `generationAvailable` 与冻结策略统一：Core 健康且存在 Provider 时允许尝试生成；已验证、受限、未验证继续由既有 AI Readiness / ModelSupportProfile 表达风险，不新增 Core 硬阻断。
2. Generation 在 Flush 成功后重新读取活动 Draft，后续 Intent 与 `generation.start` 绑定最新 `draftId/revision`；Draft 重读失败或命令上下文失效时停止启动。
3. Constraint 公共 Hardened 包装层新增权威时序策略；`validate/state_extract` 不再混入 `current_draft`。
4. Constraint Prompt 显式输出 `temporalStatus` 与可用 `sourceVersionId`；最终 `constraintHash` 纳入时序来源，使相同内容在 current / historical / upcoming / snapshot 语义变化时拥有不同约束身份。
5. 伏笔与人物弧光按目标章节顺序投影，未来状态不会冒充当前事实；与目标章无关的未来伏笔仍由基础 Constraint 排除，不扩大召回范围。
6. 目标章节 SceneBeat 明确引用已归档 Entity 时，恢复该实体及其当前 Canon 作为 P2 历史编辑上下文并标记 `catalogStatus=archived_reference`；未被目标章节引用的归档实体继续过滤。
7. `constraint-package.ts`、Migration、数据库 Schema、生产依赖与锁文件均保持不变；正式 `ConstraintPackageService` 包出口仍指向 Hardened 包装层，生产调用不会绕过 Authority Policy。
8. 首轮 Ready Integration 暴露的是新增测试对“无关未来伏笔”的错误建模；修正测试模型后未放宽产品规则，最终 Unit / Integration / Migration / Coverage / Electron E2E 全部通过。

## 永久验证

- Quality：run `31182517882`，成功。
  - Static / Workspace / Boundary / Format / Lint / Typecheck：成功。
  - Unit / Integration / Migration / Coverage：成功。
  - Build / Electron E2E / 聚合 Quality：成功。
  - `product-tests-and-coverage`：`sha256:02d950339b2fe948ad1dfe3e51861ef11ffbb201e39ed194cfe7ba167bcec255`
  - `desktop-e2e-evidence`：`sha256:f8a08dc2d5e1a57ff67c2625da7c0773f28983570d52957399998ccbf262dfa3`
- Security：run `31182517179`，成功。
  - `secret-scan-diagnostics`：`sha256:b837476995e4cfb800c8650a4f8288862ffa7e368e2030defddd20c974b8731b`
- Performance：run `31182517192`，成功。
  - `performance-and-ai-eval-evidence`：`sha256:9839870b408c748ca945f720b16eab62e2879de7765c0490c0e45b4cc2e9e011`
- Task Governance：run `31182517281`，成功。
- PR Policy：run `31182517516`，成功。

## 审计结论

最终 `main..work` 差异重新按 Generation Draft 权威、Provider 降级语义、Constraint 时序、Final-only 输入、归档实体历史上下文、Prompt 可追溯性和治理边界复核；差异仅落在 M10-15 授权路径，未修改 Migration、`package.json`、`pnpm-lock.yaml` 或产品规格，未发现新增 P0/P1。

当前 Evidence 只证明实现与 Ready 永久矩阵通过。任务仍需完成 Controlled Merge、来源 PR 对应主线提交的 `main-verification` 与 `task-verification/M10-15`，以及 `work` 受控同步后，才能取得有效 `VERIFIED`。

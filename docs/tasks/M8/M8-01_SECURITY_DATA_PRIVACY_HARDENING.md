# M8-01 安全、数据、Migration与隐私硬化

> 状态：Planned  
> 里程碑：M8 发布硬化与验收  
> 优先级：P0  
> 建议分支：`work/m8-01-security-data-privacy-hardening`

## 目标

将前序安全、数据、AI运行和恢复设计验证为发布阻断门，关闭所有绕过路径和引用断裂。

## 阶段定位

完成安全、数据、性能、E2E、跨平台构建、P0追踪和发布关闭。M8-01只做硬化、验证和必要的局部缺陷修复，不重新设计前序架构。

## 非目标

- 不在验收任务中顺手重构架构。
- 不放宽前序任务的安全、数据和作者裁决边界。
- 不以文档声明替代真实数据、Electron和故障路径证据。
- 不在发现跨模块设计缺陷时直接扩权大改；必须建立独立修复任务并阻断本任务关闭。

## 依赖

M7、M6

## 关联

- 需求：REQ-001、REQ-003—REQ-006、REQ-012、REQ-013、REQ-022—REQ-024、REQ-028、REQ-036、REQ-037、REQ-042、REQ-043、REQ-045
- 功能ID：无
- 验收：全部相关P0安全与数据项

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `SECURITY.md`
- `docs/security/THREAT_MODEL.md`
- `docs/security/PRIVACY_AND_LOGGING.md`
- `docs/testing/SECURITY_TEST_CASES.md`
- `docs/database/MIGRATION_POLICY.md`
- `docs/tasks/M4/M4-05_GENERATION_RUNTIME_EVAL.md`
- `docs/tasks/M5/M5-01_T0_SKELETON.md`
- `docs/tasks/M5/M5-06_STATE_EXTRACTION_PROPOSAL_INTEGRATION.md`

## 主要影响范围

- `tests/security/`
- `tests/migration/`
- `tests/integration/`
- `tests/e2e/`
- `docs/test-evidence/M8-01/`
- `docs/security/`
- `docs/database/`
- `docs/product/V1.0_TRACEABILITY_MATRIX.md`
- `packages/contracts/`（仅修复已定位的合同硬化缺陷）
- `packages/core-service/`（仅修复已定位的数据与权限缺陷）
- `apps/desktop/main/`（仅修复Electron、IPC、凭据或日志缺陷）
- `apps/desktop/preload/`（仅修复白名单与隔离缺陷）
- `apps/desktop/renderer/`（仅修复敏感信息展示或权限旁路）
- `migrations/app/`（仅追加兼容性修复）
- `migrations/project/`（仅追加兼容性修复）

任何超出上述“局部硬化修复”的架构变化必须建立独立`fix/`任务和PR，M8-01保持Blocked，禁止使用模糊的“必要缺陷修复路径”绕过治理。

## 发布硬门

```text
Candidate与Draft
├─ Skeleton写入Draft/Version次数 = 0
├─ partial直接定稿次数 = 0
├─ partial默认整稿采用次数 = 0
└─ Prose采用继续受Revision/Hash/LockGuard约束

AI运行与提案
├─ GenerationRun与Candidate引用完整
├─ GenerationRun与StateProposalBatch/Proposal结果可追溯
├─ Prompt版本与ConstraintPackage来源可追溯
├─ state_extract直接写权威状态次数 = 0
└─ pending提案进入权威状态输入次数 = 0

隐私与本地状态
├─ 继续写作状态不保存正文
├─ 凭据不进入数据库、Renderer和普通日志
├─ safeStorage不安全后端必须阻断
└─ 普通日志不含正文、Prompt、约束全文和原始模型响应
```

## 实施内容

1. 全量Electron配置、Fuses、CSP、导航和Preload白名单复核。
2. IPC strict Schema覆盖率、未注册命令、跨项目、跨章节、路径和对象类型攻击测试。
3. 全部Migration逐级升级、重复执行、中断、高版本只读和真实存量数据兼容。
4. 数据库损坏、quick/integrity/foreign_key检查和恢复演练。
5. 日志、错误、诊断包、导出、临时文件和AI运行元数据敏感内容扫描。
6. DOCX恶意Fixture、凭据密文文件权限、safeStorage不可用/`basic_text`和本机直连网络边界复核。
7. Candidate、锁定、Revision、Version、ApplyRecord、Checkpoint和恢复不变量回归。
8. Skeleton Candidate对正文Preview、Diff、Apply、Version和定稿的Core拒绝矩阵。
9. partial Candidate整稿采用、定稿、完整度伪装和恢复后状态限制矩阵。
10. GenerationRun、Candidate、StateProposalBatch、StateProposal、Prompt版本、约束来源和来源Version引用完整性检查。
11. `state_extract`只能创建`source: provider`的pending StateProposal；AI直接写EntityState、ArcMilestone或EndingSnapshot必须失败。
12. pending、rejected、跨项目和旧Version提案不得进入权威校验或约束包。
13. 继续写作偏好只保存项目/章节/位置等最小状态，不得包含正文、选区文本或设定全文。
14. 三轨备份清理不得删除最后已验证备份、关键Migration恢复点或作者保留快照；恢复始终创建新副本。
15. 任一硬门失败必须阻断发布并记录最小复现，不得以降级文案掩盖数据绕过。
16. 局部修复必须附带对应回归测试；跨模块设计缺陷转独立修复任务，不在本卡内无计划扩张。

## 测试与证据

- 运行完整security、migration、integration、Electron E2E和恢复矩阵。
- Skeleton/partial/Prose Candidate类型与权限矩阵。
- Run—Candidate—StateProposalBatch—StateProposal—Prompt—ConstraintPackage引用完整性报告。
- state_extract真实来源、作者裁决边界和pending隔离。
- safeStorage后端、凭据文件权限、日志和诊断包白名单扫描。
- 继续写作状态隐私扫描。
- 三轨备份保护、配额清理和恢复到新副本。
- 任一数据硬保证不为0即阻断。
- 未关闭风险必须有明确发布影响、责任任务和独立修复入口。

证据保存到：`docs/test-evidence/M8-01/`

## 完成条件

- 所有阻断项关闭并保存可复核报告。
- Skeleton、partial、state_extract和pending提案不存在权威边界绕过。
- AI运行、结果、Prompt和约束来源引用完整。
- 凭据、继续写作状态、日志和诊断符合最小化要求。
- 跨模块缺陷没有被验收任务内的无计划重构掩盖。
- 不得用“基本通过”替代证据。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、AI、安全、数据、UI或测试文档。

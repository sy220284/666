# M8-01 安全、数据、Migration与隐私硬化

> 状态：Planned  
> 里程碑：M8 发布硬化与验收  
> 优先级：P0  
> 建议分支：`test/m8-security-data-privacy-hardening`

## 目标

将前序安全和数据设计验证为发布阻断门，关闭所有绕过路径。

## 阶段定位

完成安全、数据、性能、E2E、跨平台构建、P0追踪和发布关闭。

## 非目标

- 不在验收任务中顺手重构架构。

## 依赖

M7、M6

## 关联

- 需求：REQ-001、REQ-003—REQ-006、REQ-024、REQ-042、REQ-043
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

## 主要影响范围

- `tests/security/`
- `tests/migration/`
- `docs/test-evidence/M8-01/`
- `必要的缺陷修复路径`

## 实施内容

1. 全量Electron配置、Fuses、CSP、导航和Preload白名单复核。
2. IPC strict Schema覆盖率、未注册命令和跨项目/路径攻击测试。
3. 全部Migration逐级升级、重复执行、中断和高版本只读。
4. 数据库损坏、quick/integrity/foreign_key检查和恢复演练。
5. 日志、错误、诊断包、导出和临时文件敏感内容扫描。
6. DOCX恶意Fixture、凭据和本机直连网络边界复核。
7. Candidate、锁定、Revision、Version和恢复不变量回归。

## 测试与证据

- 运行完整security、migration、integration和恢复矩阵。
- 任一数据硬保证不为0即阻断。
- 未关闭风险必须有明确发布影响。

证据保存到：`docs/test-evidence/M8-01/`

## 完成条件

- 所有阻断项关闭并保存报告。
- 不得用“基本通过”替代证据。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。

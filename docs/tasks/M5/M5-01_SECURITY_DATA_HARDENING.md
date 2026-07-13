# M5-01 安全、Migration、数据损坏与隐私硬化

> 状态：Planned  
> 优先级：P0  
> 分支：`test/m5-security-data-hardening`

## 目标

将M0—M4中的安全和数据设计验证为发布门槛，确认高风险边界不存在绕过路径。

## 依赖

M4全部完成。

## 关联

- 需求：REQ-001、REQ-003—REQ-006、REQ-024、REQ-042、REQ-043
- 验收：相关P0安全与数据项

## 必读文档

- `SECURITY.md`
- `docs/security/THREAT_MODEL.md`
- `docs/security/PRIVACY_AND_LOGGING.md`
- `docs/testing/SECURITY_TEST_CASES.md`
- `docs/database/MIGRATION_POLICY.md`

## 工作内容

1. 全量Electron安全配置复核。
2. Preload白名单和IPC Schema覆盖率检查。
3. 路径、符号链接和跨项目故障注入。
4. 所有Migration Fixture逐级升级和中断恢复。
5. quick_check、integrity_check和备份恢复演练。
6. 日志、错误和诊断包敏感内容扫描。
7. DOCX异常Fixture与临时目录清理。
8. Candidate、锁定、Revision和不可变Version硬保证回归。

## 阻断条件

任一代码硬保证不为0；恢复覆盖原项目；凭据或正文进入默认日志；高版本数据库被写入。

## 证据

安全测试报告、Migration矩阵、损坏恢复记录、日志扫描报告和阻断问题清单。

## 完成条件

所有阻断项关闭，未关闭风险明确列入发布结论，不得用“基本通过”替代证据。

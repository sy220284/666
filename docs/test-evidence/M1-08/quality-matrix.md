# M1-08 质量矩阵

| 维度 | 结果 | 证据 |
|---|---|---|
| Checkpoint真实性 | PASS | 路径、文件类型、大小、SHA-256、SQLite完整性、外键、项目ID全部校验 |
| 只读Version浏览 | PASS | 物理损坏后从有效Checkpoint汇总Version |
| Version导出 | PASS | 导出正文与已保存Version一致 |
| 源数据保护 | PASS | 损坏源库与Checkpoint字节不变 |
| 恢复副本 | PASS | 新目录恢复成功，不覆盖原项目 |
| Integration | PASS | Quality同一Head集成测试通过 |
| Electron E2E | PASS | 19/19；包含物理损坏恢复场景 |
| Security / Performance | PASS | 永久独立门禁均成功 |

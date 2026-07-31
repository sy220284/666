# 正文保存竞态修复验证

- `clientBlockId`作为首选稳定身份，`logicalBlockId`与明确Patch映射作为后备。
- 无法确认身份时保留当前正文并继续调度保存，禁止静默覆盖。
- 单元与集成测试覆盖保存期间输入、结构变化、元数据隔离与缺失身份。
- 最终结果以Quality中的Unit、Integration、Coverage和Electron E2E同时成功为通过。

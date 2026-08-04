# M10-04 已知风险

1. `RegisteredCommandSchema`继续作为V1公开兼容别名；它与`CentralBridgeCommandSchema`引用同一Schema对象，不形成第二套真源。旧别名计划在协议大版本窗口移除。
2. 历史Schema 1 Runtime保持冻结读取，避免改写已验证证据；活动任务和新任务已经强制Schema 2。
3. 旧备份元数据规范化失败时保留原文件并返回已安全解析的记录；下次读取会再次尝试规范化，不影响备份选择和恢复。
4. 删除旧Renderer兼容层后，结构测试负责阻止旧入口、旧兼容目录和旧DOM所有权重新引入。
5. 三平台Package Smoke与Windows微软拼音由永久路径策略按最终Head变更范围路由；跳过不得记录为真实执行成功。
6. SQLite数据兼容、Provider适配和协议版本门禁属于长期产品边界，本任务不将其视为可删除技术债。

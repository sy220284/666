# M4-02 已知风险

- Token估算采用确定性保守算法，不等同于任一Provider私有Tokenizer；M4-03/M4-05接入模型档案后可按模型覆盖估算器，但不得改变P0/P1不可裁剪规则。
- 公共检索补充召回仍受M4-01索引状态影响；stale/rebuilding时会按M4-01合同回退权威LIKE。
- V1不引入Embedding或Rerank，语义召回质量留待后续任务，当前保证确定性、可追溯和项目隔离。

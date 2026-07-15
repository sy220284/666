# WorldForge 公共 Eval Fixture

本目录只保存公开、合成、可确定性复现的中文测试输入，不包含用户作品、真实项目正文、凭据或真实 Provider 输出。

- `fixtures/common/`：通用中文章节与连续性输入。
- `fixtures/protocol/`：T0/T1 Schema、Cleaner和协议边界输入。
- `fixtures/safety/`：越权知识、私人数据和输出边界用例。
- `fixtures/catalog.json`：Fixture 版本、来源和授权元数据。
- `baselines/`：任务与Prompt版本绑定的最低协议/质量阈值。
- `model-support/`：Provider + Model + Task + PromptVersion支持档案样例。
- `reports/`：可复现结果、Fixture明细、环境和人工复核。

Fixture 内容采用 CC0-1.0；测试工具代码仍遵循仓库主许可证。

M0-07中的`deterministic-stub`档案只证明本地协议行为可复现，不代表任何真实模型的写作质量或兼容性。

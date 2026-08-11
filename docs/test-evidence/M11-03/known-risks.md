# M11-03 已知风险与边界

- 本任务包含追加 Migration `0031_ai_organization_relationships.sql`。回退应用实现时不得修改或删除已执行的历史 Migration；已升级作品继续按向前兼容原则处理。
- AI 语义提取与语义校验的内容质量仍受作者配置的 Provider/模型能力影响。本任务保证结构化 Schema、Evidence 白名单、来源新鲜度和 Author Authority，不把模型正确率作为数据安全假设。
- 人物关系图、时间轴、伏笔泳道等可视化知识工作台不在 M11-03 范围，由 M11-04 承接；本任务提供其所需的稳定权威数据基础。
- Electron E2E 当前完整矩阵为串行 33 条，冻结验证 33/33 通过；`electron-shell.spec.ts` 仍是主要耗时文件，属于测试执行效率问题，不影响本任务正确性。
- GitHub Hosted Runner 仍可能存在共享运行环境噪声；冻结 implementation commit 的 Quality / Security / Performance 均已成功，Coverage、可靠性与性能门槛没有放宽。
- Actions Artifact 有保留期；长期审计以仓库内 Schema 2 Evidence、冻结 implementation commit 和 GitHub Commit Status 为准。
- Schema 2 的 `IMPLEMENTED` 不是最终 Verified。PR #361 合并后仍需来源主线提交上的 `main-verification=success` 与 `task-verification/M11-03=success` 完成状态闭环。

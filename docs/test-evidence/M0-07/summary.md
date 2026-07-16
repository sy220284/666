# M0-07 测试证据

生成时间：2026-07-16T05:24:13Z  
提交：9b10fdb2f07124ef2491198aacc39d08bc69305b

M0-07 已完成 AI 输出协议与中文 Diff 技术验证。严格 Zod 契约覆盖 GenerationRequest、ProviderEvent、T0/T1 输出与 ModelSupportProfile；Prompt Registry 绑定稳定 ID、整数版本和输入输出 Schema；T0 支持多候选、必选 Beat 覆盖与最多一次登记外壳修复，T1 默认纯文本，仅对完全匹配的 verified Profile 开启结构化分块。确定性 Provider Stub 覆盖正常、中文分片、断流 partial、无效 JSON、超时和取消。logicalBlockId/sourceLogicalBlockIds 结构 Diff 覆盖新增、删除、移动、拆分、合并和修改，Unicode 字符 Diff 可重建双侧文本、渐进输出且可取消，并冻结主线程、协作分片和 Worker 阈值。GitHub Task Governance：https://github.com/sy220284/666/actions/runs/29473622555；Quality（Xvfb 中运行全量测试和 Electron 显示矩阵）：https://github.com/sy220284/666/actions/runs/29473622578。

## 自动化结果

- 通过：10
- 失败：0
- 跳过：1

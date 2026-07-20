# M3-04质量矩阵

| 场景 | 结果 | 证据 |
|---|---|---|
| 状态有限区间、空档、同起点修订与历史查询 | 通过 | Integration，Quality 29722138463 |
| 状态与知情失效命令 | 通过 | Integration，Main Verification 29722417080 |
| 跨项目Version、EvidenceAnchor与logicalBlock拒绝 | 通过 | Integration、Security 29722138396 |
| 五种KnowledgeState及章节边界 | 通过 | Integration，Quality 29722138463 |
| participant/witness多地冲突与subject非在场语义 | 通过 | Integration，Quality 29722138463 |
| exact/day/month/year及approximate/unknown时间规则 | 通过 | Domain/Integration、Main Verification 29722417080 |
| 依赖循环与确定性顺序冲突 | 通过 | Integration，Quality 29722138463 |
| logicalBlock删除后的来源锚点安全 | 通过 | Integration，Quality 29722138463 |
| 七个IPC命令严格边界 | 通过 | Security 29722138396 |
| Renderer—Preload—Main—Core真实写入和UI展示 | 通过 | Electron E2E，Quality 29722138463 |
| Migration、构建、打包与clean-tree | 通过 | Quality 29722138463、Main Verification 29722417080 |

静态任务截图清单为空；真实桌面行为由任务专属Electron E2E日志和最终main复验记录证明。

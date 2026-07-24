# M4-01 实现与复验记录

## 交付结论

已建立Draft、Version与Entity三类FTS5 trigram派生索引、显式目标队列、索引状态和作者管理的项目词典。SQLite触发器只登记权威业务ID，Core负责全文组装、增量消费、失败重试、完整重建、短词与stale回退以及结果权威回读。

FTS结果仅用于召回业务ID；所有结果按当前项目重新读取权威数据。正文、Candidate采用与撤销、导入、Version、Entity、CanonFact、拆并章、跨章移动及卷章可见性变化均纳入失效传播。ResearchNote未进入V1.0 P0数据模型，因此未预建表或索引。

## 自动化证据

- 实现提交：`c37aebb53aa713622d749e5f9b9d837f4642d4bf`。
- Quality：运行`30088007101`，静态、格式、Lint、Typecheck、Build、Unit、Integration、Migration、Coverage与Electron E2E全部成功。
- Security：运行`30088006972`，秘密扫描、依赖审计与应用安全测试成功。
- Performance：运行`30088006958`，性能预算成功。
- PR Policy：运行`30088006973`成功。
- Evidence：运行`30088006985`成功。
- Coverage工件：`8594653232`，Digest `sha256:9a045425b108c8fafa41afa0cf53e1ba61c777cc38e420be1f0b996a7dabe94c`。
- Electron E2E工件：`8594793290`，Digest `sha256:2f55789970e8bc3e5fa0d0713ea135a80eff31a4f91f7da1e29ee4462d3de681`。

## 量化结果

- 1,563,300字符Fixture完整重建：202.16ms。
- 30次FTS查询P95：14.12ms，预算上限200ms。
- 产品源码覆盖率：Lines 86.55%、Statements 84.28%、Functions 84.87%、Branches 75.30%。

## 范围结论

本记录覆盖M4-01公共检索基础设施和项目词典。最终搜索页面、安全批量替换由M6-03承接；P0—P4约束包由M4-02承接。实现阶段结果可供后续任务直接复用。

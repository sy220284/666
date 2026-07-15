# M0-03 验证摘要

日期：2026-07-15  
状态：Verified；提交`5f42edc`的本地门禁、GitHub Task Governance与Quality远程复验均通过。

## 已实现

- `AppDatabase`与`ProjectDatabase`分离应用级和项目级数据，并拒绝生产路径使用内存数据库。
- 写连接启用WAL、`foreign_keys=ON`、`busy_timeout=5000`与`synchronous=NORMAL`；查询使用独立只读、`query_only`连接。
- 单写队列串行执行同步事务，SQLite错误被包装为稳定错误码；关闭前停止接单、排空已接收写入并截断WAL。
- `requestId`在进程生命周期内复用首次执行结果；并发重复请求不重复提交，失败结果不会污染幂等缓存。
- Migration Runner按数据库类型加载追加式SQL，校验连续版本、文件名、精确checksum与历史记录，并禁止迁移自行控制事务或附加数据库。
- 已有Schema升级前必须成功执行`prepareRecoveryPoint`；每个迁移与`schema_migrations`记录在同一`BEGIN IMMEDIATE`事务内提交。
- checksum异常、高版本Schema、完整性失败和迁移中断进入可诊断的只读兼容模式，不继续写入。
- 提供`quick_check`、`integrity_check`、`foreign_key_check`与WAL checkpoint接口，并在启动时探测FTS5 trigram能力。
- 初始Migration仅创建当前底座表；未提前创建全部V1业务表，`app.sqlite`不保存正文。

## 自动化结果

- Vitest全量：13个测试文件、41项测试通过。
- Migration专项：2个测试文件、9项测试通过，覆盖重复执行、事务中断、checksum、高版本、恢复点门禁、完整性与外键损坏。
- Integration专项：4个测试文件、4项测试通过，覆盖数据库边界以及Electron嵌入式SQLite/FTS5 trigram运行时。
- 并发基准：100个并发写请求用时7.26 ms，100行落盘、0丢写、WAL启用、`quick_check`通过；原始结果见`performance.json`。
- Host运行时：Node 24.14.0、SQLite 3.51.2；FTS5与trigram可用。
- Electron运行时：Electron 43.1.1、Node 24.18.0、SQLite 3.53.1；FTS5与trigram可用。
- Typecheck：所有可检查workspace包通过。
- Build：Contracts、Main、Preload、Renderer与Core Service构建通过。
- Package：9个编译入口进入基础构建清单。
- Release check：发布工具已配置；发布门保持由M8-03控制。
- GitHub Task Governance：<https://github.com/sy220284/666/actions/runs/29387901730>。
- GitHub Quality：<https://github.com/sy220284/666/actions/runs/29387901747>。

## 验收边界

M0-03交付SQLite连接、Migration和单写队列底座，不实现项目页面、编辑器或全部V1表。真实恢复副本的创建与恢复中心由M1-08实现；M0-03先强制已有数据库在升级前获得成功的恢复点回调。Renderer继续受M0-02进程边界约束，不存在直接数据库访问路径。

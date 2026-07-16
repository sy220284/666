# M1-05 当前续作检查点

日期：2026-07-16
分支：`validate/m1-05-core-20260716`
活动任务：`M1-05_BLOCK_PATCH_REVISION`

## 已完成

- 已扩展并同步M1-05允许路径，覆盖桌面Main、Preload、Renderer、Migration、安全测试、E2E和相关文档。
- Domain已建立正文语义标准化：统一换行、Unicode NFC、headingLevel和separator约束，保留有意义空白。
- 已实现SHA-256 `contentHash`，并将blockType、正文和语义属性纳入稳定序列化。
- Contracts已加入strict `draft.applyPatch`，支持insert、update、delete、move；每批携带`baseRevision`，修改既有块必须携带`expectedHash`。
- Core已实现内存顺序验证、单事务提交、Revision单次递增、Hash冲突、Revision冲突、失败回滚和持久化requestId幂等。
- Project Schema已升级到v4，新增`draft_patch_log`记录操作、提交Revision及前后块快照。
- Editor Core已实现删除→重排→逆序插入→更新的稳定Patch生成；块类型变化按delete+insert处理。
- Main、Preload、Renderer已接通Patch；Renderer冲突时保留窗口内容，成功后同步权威ID、Hash与Revision。
- IPC安全测试已改为验证Patch strict Schema、来源校验和权威字段隔离。
- 新增语义Hash、Patch生成、原子事务、重复requestId、重启幂等、故障回滚及v4迁移测试。
- 已修复任务治理浅克隆无法解析旧基准SHA的问题，工作流改为完整拉取历史。

## 已验证结果

- 最新完整诊断中，新增Patch相关Unit、Integration、Migration与Security测试均通过。
- 完整测试曾记录153项通过、2项旧Schema断言失败；两项断言已同步到Schema v4。
- 格式、Lint和TypeScript全仓检查已分别通过过中间质量门。
- 当前提交用于触发清理后的正式全量质量门，最终结果尚未登记。

## 待完成

1. 等待正式Task Governance与Quality全绿，并记录最终命令结果。
2. 删除公共`draft.saveSnapshot`兼容入口，彻底消除正文写入旁路。
3. 同步IPC、数据库、编辑器交互、追踪矩阵和M1-05标准证据。
4. 完成后将M1-05登记为Implemented并推进M1-06；人工截图与最终Verified继续进入延期验收账本。

## 关键不变量

- `project.sqlite`是正文唯一真源。
- Renderer不生成权威ID、Hash、Revision、orderKey、source或locked值。
- 每个成功Patch批次只增加一次Draft Revision；任何失败整批回滚。
- update、delete、move必须携带并校验`expectedHash`。
- 重复requestId不得再次执行写入。
- 普通编辑撤销继续使用ProseMirror历史；M1-05不提前实现锁定或Candidate。

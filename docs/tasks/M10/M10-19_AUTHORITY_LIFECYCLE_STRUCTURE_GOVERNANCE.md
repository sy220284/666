# M10-19 权威生命周期、结构与跨域一致性治理

> 状态：Implemented  
> 里程碑：M10 稳定性与治理续作 / V1.5 权威语义根因收口  
> 优先级：P1  
> 执行分支：`work`  
> 目标分支：`main`  
> 主线基线：`d9b0f36eed69dae716f2fba2f570c165d157d4ea`

## 目标

对 M10-18 合并后的全量代码审计中确认的 10 个独立问题做一次根因治理，禁止继续按入口逐点补丁。治理聚焦四个权威边界：

1. **异步生命周期权威**：Task 展示终态不得替代 GenerationRun 持久终态与真实 execution quiescence。
2. **活动作品结构权威**：Chapter、Volume、Draft 的 active 判定必须复用同一 Core 策略，软删除后禁止继续正文/Version 权威写入。
3. **跨域业务规则单一所有权**：Arc Milestone 命中前置条件由共享领域策略裁决，作者手工入口与 StateProposal 接受入口不得分叉。
4. **持久依赖、幂等与派生新鲜度权威**：永久删除按真实 FK 裁决；高副作用 Import 具备跨 Core 重启重放；Validation 新鲜度使用增量语义修订；Recovery Overview 只读取一次权威数据。

## 审计输入：10 个确认问题

### P1

1. Project Close/Move 与 Core Drain 可直接把 Task 标为 cancelled，绕过 GenerationRun 的持久取消、partial 保存和真实执行退出。
2. ReplacePlan Preview 后若 Chapter/Volume 进入回收站，旧 Plan 仍可 Apply 修改隐藏 Draft。
3. Version create/list/setFinal/restore 对父 Volume 的 deleted 状态判定不一致。
4. Arc Milestone 手工 hit 会检查 Timeline dependency，但 StateProposal accept 可绕过同一规则。
5. Entity Permanent Delete 的手写 blocker 漏掉 `state_proposals.entity_id` 等未来 RESTRICT FK，Preview 与 SQLite 真相可能不一致。

### P2

6. 项目切换时旧 `task.listActive(projectA)` 可晚到并覆盖 projectB 的 TaskSnapshot。
7. `loaded / empty / degraded` 已维护，但 degraded 保留旧值时 AppShell 没有稳定可见失败信号。
8. Import requestId 幂等依赖进程内 Promise/Plan；SQLite 已提交而 Core 崩溃时，重启无法重放首次结果。
9. Recovery Overview 对 Version 存在严格预检与实际读取两遍无界扫描。
10. Validation semantic fingerprint 每次读取并 Hash 全项目权威语义表，规模成本随作品持续增长。

## 根因治理设计

### A. Generation 生命周期单一 Owner

- `GenerationRuntime.cancel()` 保持原有契约：先持久化 GenerationRun cancel/partial，再向 TaskProtocol 发送 abort，不改变历史调用时序。
- 新增 `cancelTask()` 作为 Task→Generation 的领域桥；它在持久化取消后等待真实 execution completion。
- ProjectTaskBarrier 只注册一个 domain canceller；Generation Task 经 GenerationRuntime 收敛，普通 Task 继续由权威 TaskProtocol 处理。
- Core `task.cancel` 对 Generation Task 走同一领域桥；`core.drain` 先 drain Generation，再执行原生 TaskProtocol drain。
- `saving_candidate` 等不可取消原子阶段不得强制终止；Drain 等待 execution 自然完成。

### B. Active Structure Authority

新增共享 `active-structure.ts`：

- Active Chapter = Chapter 未删除 + 父 Volume 未删除 + 属于当前 Project。
- Active Draft = Active Chapter + `chapter.active_draft_id = draft.id` + `draft.status = active`。
- Replace Apply、Version create/list/setFinal/restore、Validation scoped lookup 统一消费该语义。
- 旧 Version 历史只读读取保持可访问，不把“可读历史”误等同于“可继续写”。

### C. Arc Hit 单一领域策略与 Entity FK 真源

- 新增 `arc-milestone-policy.ts`，统一 milestone→milestone 与 milestone→timeline 的命中前置条件。
- Author transition 与 StateProposal acceptance 必须调用同一 policy。
- Entity Permanent Delete 不维护静态 blocker 清单；通过 SQLite FK metadata 自动发现指向 `entities` 的 RESTRICT/NO ACTION 引用，并映射稳定作者提示。
- CASCADE 从属数据保持既有数据库语义，不误判为独立 blocker。
- StateProposal 历史当前按 Schema 的 `ON DELETE RESTRICT` 视为保留审计依赖；存在历史时永久删除明确阻断，禁止 Preview 宣称可删后再由 SQLite 报内部错误。

### D. 跨重启幂等、增量新鲜度与单次 Recovery 读取

- Migration 0030 新增 `command_receipts`。Import 成功结果、fingerprint 与正文/Version/PatchLog 在同一 Project SQLite transaction 提交。
- Import 重放先读 durable receipt，再访问短期 Plan；Core/Service 重建后相同 requestId 可直接返回首次结果，不产生第二 Recovery checkpoint 或随机 ID。
- Recovery checkpoint 使用由 Import requestId 派生的稳定 UUID，与业务 write requestId 隔离。
- Migration 0030 新增 `semantic_revision`；项目初始化为 0，各权威语义表/关系通过 DB Trigger 增量推进。
- Validation fingerprint 读取 O(1) semantic revision，不再全量 dump+hash 权威语义表；SceneBeat graph 仍保留章节级内容 digest。
- Recovery Overview 的 fail-closed 读取合并到唯一实际 Overview loader，Version 只扫描一次，不再通过异常回退为空数组掩盖读取失败。

## Migration 与兼容边界

- 新增 `migrations/project/0030_authority_governance.sql`，不修改任何历史 Migration。
- 新表只保存本地治理元数据：`command_receipts`、`semantic_revision`。
- 不修改 IPC protocolVersion、公共 Contract、Provider/Credential Schema。
- 旧项目升级前按既有规则创建 Migration Recovery Point；升级后 `schema_version=30`。

## UI 与运行态

- Task snapshot refresh 使用本地 generation token + captured projectId，项目切换后旧请求不能覆盖新项目状态。
- Startup degraded 保留最后可信值，但 AppShell 必须发布 sticky P1 状态并提供“重新读取”。

## 自动化回归

Draft Static CI 跟进确认：Utility Control 与 Project Operation 使用分片路由链，未匹配联合类型成员必须通过 `default` 委派给下一路由器。全量联合类型上的穷尽检查无法表达该委派边界，因此仅在 8 个分片 `switch` 上保留带原因的局部规则豁免；不修改路由顺序、消息契约或业务分支。

新增：

- `tests/integration/m10-19-authority-governance.test.ts`
  - 回收站后的 Replace/Version 写入阻断；
  - Author/StateProposal 共用 Arc Timeline dependency；
  - Entity StateProposal FK blocker；
  - Import service recreation 后 durable replay；
  - semantic revision 增量变化。
- `tests/unit/m10-19-lifecycle-renderer-recovery.test.ts`
  - Generation durable cancel 先完成、drain 再等待 execution quiescent；
  - degraded 可见状态；
  - Recovery Overview 唯一 Version 读取路径。

永久矩阵：

```text
pnpm task:validate
pnpm check:language
pnpm check:workspaces
pnpm check:boundaries
pnpm format:check
pnpm lint
pnpm ci:policy
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:migration
pnpm test:coverage
pnpm test:security
pnpm test:perf
pnpm build
pnpm test:e2e
```

## 完成条件

- [x] 10 个审计问题全部映射到共享领域/数据权威，而非逐入口临时补丁。
- [x] Generation Task cancellation 与 GenerationRun 持久状态、execution quiescence 建立明确顺序。
- [x] Replace/Version/Validation 接入统一 Active Structure 语义。
- [x] Arc Author/StateProposal 命中前置条件共用单一 policy。
- [x] Entity Delete blocker 由真实 SQLite FK 驱动。
- [x] Import durable receipt、semantic revision、Recovery single-pass 实现完成。
- [x] Renderer stale Task 与 degraded 展示边界实现完成。
- [x] 专项 Unit/Integration 回归已加入仓库。
- [ ] Draft Static / Ready 全量永久矩阵通过。
- [ ] Evidence 绑定最终 implementation commit。
- [ ] Controlled Merge 完成。
- [ ] `main-verification` 与 `task-verification/M10-19` 成功。
- [ ] `work` 受控同步到已验证 `main`。

## 回滚

整体回退 M10-19 产品实现、Migration 0030 与专项测试；历史 Migration、M10-18 及更早 Evidence 不回滚。Migration 0030 在未发布/未合并前可随任务整体回退；一旦进入已验证 main，后续禁止修改其内容，只能新增向前 Migration。

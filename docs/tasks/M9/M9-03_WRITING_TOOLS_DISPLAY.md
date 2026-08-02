# M9-03 WorldForge V1.1剩余架构拆分统一执行

> 状态：Verified  
> 里程碑：M9 V1.1架构治理
> 对应工作包：AR-03—AR-14
> 优先级：P0
> 当前正式分支：`work/m9-03-ar05-ar14-continuation`

## 1. 目标

在同一个M9-03 Runtime下完成AR-03—AR-14全部保持行为的架构拆分。M9-04—M9-14仅移除独立任务形式，其冻结需求、依赖、不变量、测试、回退和验收要求全部由本卡承接，不得删减或降级。

## 2. 当前执行模型

作者于2026-08-01明确要求先合并并闭环已完成检查点，再基于main继续推进。该指令覆盖旧版“全部AR只能在一个实施PR中完成”的限制，调整为同一任务内的受控分段交付：

1. M9-03仍是M9剩余架构拆分的唯一活动任务和机器真源。
2. AR-03、AR-04已在PR #272完成，最终受检Head为`9e331399ebae0017106d252d67639a64e986ff77`，squash进入main提交`7adafeeadb973e5cb035c301602c511c2aa065c5`。
3. AR-05—AR-14从上述main提交建立续作分支`work/m9-03-ar05-ar14-continuation`，通过新的M9-03 Draft PR继续实施。
4. 正式实施顺序保持`AR-05 → AR-06 → AR-07 → AR-08 → AR-09 → AR-10 → AR-11 → AR-12 → AR-13 → AR-14`，不得越过冻结依赖。
5. 每个子包完成后必须运行受影响范围回归、记录结构变化和回退说明；前一子包存在失败时不得进入依赖它的后续子包。
6. AR-10、AR-12和AR-13保持高风险检查点，必须分别保存回退说明和专项验证结果。
7. M9-03只有在AR-03—AR-14全部完成、续作PR通过全量永久门禁、合并后main验证成功，才允许通过独立治理关闭为Verified。
8. 续作分支已通过PR #275同步`main@e80552afec44916cc3821e933fc477badbad178a`，同步合并提交为`74dc1528b62d55c9333e83b82afffc74795c8078`，不重写既有任务历史。
9. 专项验证统一使用永久`.github/workflows/engineering-validation.yml`；禁止在M9-03内新增、恢复或保留任务专属临时Workflow。

## 3. 当前检查点

```text
AR-03 Writing工具与展示拆分          已合并并验证（PR #272）
AR-04 Writing章节会话状态机          已合并并验证（PR #272）
AR-05 Canon拆分                      已验证
AR-06 Planning拆分                   已验证
AR-07 AppShell拆分                   已验证
AR-08 Contracts拆分                  已验证
AR-09 Preload拆分                    已验证
AR-10 Main IPC拆分                   已验证
AR-11 Service Facade拆分             已验证
AR-12 Project Workspace拆分          已验证
AR-13 Recovery与工具域拆分           已验证
AR-14 Legacy/CSS/结构预算收敛        已验证
```

## 3.1 最终验证结果

- AR-03—AR-14全部完成；最终受检Head为`a5b24ab3a2809f2ae8f61222ef4b3ae31de9c807`。
- PR #273的Ready永久门禁全部成功：Quality `30754109757`、Evidence `30754109565`、Task Governance `30754109604`、PR Policy `30754109570`、Security `30754109578`、Performance `30754109603`。
- 受控main提交为`f5add56154e99bc907376e08787b7037851835f0`，Main Verification运行`30754708770`成功。
- 验证PR #289调用永久Quality工作流，Windows原生微软拼音和Linux、Windows、macOS三平台Package Smoke全部成功；该PR已关闭且未合并。
- Legacy入口与旧CSS文件已删除；最终结构扫描为397个源码文件、1171条相对导入边、0项结构债务。
- M9-03已关闭为Verified，M9 V1.1保持行为架构治理进入最终验证保持。

## 4. 必须实施

- AR-03：拆分Writing纯工具、查找替换、Version、Candidate审阅和Generation展示组件。
- AR-04：以显式状态机收敛章节打开、Editor生命周期、自动保存、IME、续写位置和统一Draft Flush。
- AR-05：将Canon拆为Entity Canon、Continuity、Narrative Planning和State Proposal四个独立业务Panel。
- AR-06：拆分任务书、大纲、场景节拍和规划上下文，继续复用Shared Structure。
- AR-07：拆分AppShell启动、项目会话、设置持久化、Workspace Attention、任务订阅、导航守卫、状态模型和布局。
- AR-08：拆分Contracts领域聚合，保持所有公开导出、Channel、Schema、协议版本和Bridge签名完全兼容。
- AR-09：将Preload Bridge拆为领域Factory，保持`window.worldforge`表面和MessagePort协议一致。
- AR-10：将Main IPC拆为领域Handler注册器和统一安全、异常与释放边界。
- AR-11：拆分State Proposal、Ending Snapshot、Derived Invalidation、Generation Run、Candidate持久化和模型支持档案。
- AR-12：拆分Project Workspace创建、打开、移动、校验、路径策略、Manifest和数据库上下文。
- AR-13：拆分Recovery及Search、Validation、Narrative、Structure Operations、Draft、Import/Export工具域。
- AR-14：退役无职责Legacy Surface，整理CSS责任域，收紧全部结构预算并完成V1.1最终验证。

[`V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md`](V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md)第4—15节是上述子包的规范性详细范围、依赖、风险和验收真源；与本卡冲突时，以作者最新明确指令和本卡更新后的受控分段执行模型为准。

## 5. 不可破坏的不变量

- 不新增产品功能，不改变现有中文文案、测试标记、公开Props和用户工作流语义。
- 不修改数据库Schema、历史Migration、IPC Channel字符串、`PROTOCOL_VERSION`、正式错误码或公开Bridge方法。
- `project.sqlite`继续是作品唯一权威真源；一次权威事务不得被拆成多个异步服务调用。
- AI输出仍先进入Candidate，作者确认前不得修改Draft或已确认设定。
- Candidate预览、采用、撤销、冲突、锁定块和Skeleton审阅语义不变。
- Version创建、定稿、恢复为新稿、导出和历史定位语义不变。
- 快速切章、自动保存、IME组合、Editor代次、Draft Flush和关闭窗口时序必须满足冻结会话矩阵。
- Credential Broker仍只在Main持有明文凭据；Renderer不得获得Node、文件系统、SQLite、环境变量或凭据能力。
- 项目创建、打开、移动、恢复、备份、导入导出、FTS、Diff和事件循环的原子性、安全与性能不得退化。
- 兼容Facade和根入口只在全部调用方、行为测试与E2E完成迁移后退役。

## 6. 职责与结构预算

- 应用或工作台组合根目标不超过300行。
- 普通React Panel不超过400行，Hook或Controller不超过300行，纯工具模块不超过250行。
- Main/Preload领域注册器不超过350行，普通Core事务服务不超过600行，强事务内聚服务不超过800行。
- 任一非生成源码绝对不得超过1000行，除非符合冻结治理定义的正式例外。
- 每个子包必须减少其归属的既有结构债务；不得登记新超限、循环依赖或Feature反向依赖例外。
- AR-14必须将所有目标文件从渐进基线收紧到正式预算，不得承接前序未完成的核心拆分。

## 7. 允许修改范围

- `apps/desktop/renderer/src/`
- `apps/desktop/renderer/build-assets.mjs`
- `apps/desktop/preload/src/`
- `apps/desktop/main/src/`
- `packages/contracts/src/`
- `packages/core-service/src/`
- `packages/testkit/src/`
- `tests/`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/architecture/`
- `docs/testing/`
- `docs/tasks/`
- `docs/test-evidence/M9-03/`
- `scripts/`
- `vitest.coverage.config.ts`

永久工作流由main治理任务维护。M9-03只调用既有`Engineering Validation`固定Profile，不得修改`.github/workflows/`。

## 8. 禁止范围

- `.github/workflows/`
- `migrations/`
- `packages/domain/src/`
- `packages/editor-core/src/`
- `packages/prompts/src/`
- `docs/product/`
- M9-03以外的历史Evidence目录

若实现确实需要越过禁止范围、改变Schema、协议、公开行为或引入新功能，必须停止实施并重新取得作者授权，不得在本卡内静默扩张。

## 9. AR-05验收

- 外层`canon-workbench.tsx`仅负责导航和Panel装配。
- Entity Canon、Continuity、Narrative Planning和State Proposal四个Panel独立管理Bridge查询、命令和局部状态。
- 表单解析、标签和值格式化迁入共享模块。
- 删除、归档、状态失效和作者裁决安全边界保持不变。
- 状态历史、时间线、知情、伏笔、人物弧和提案裁决行为无变化。
- 选中实体和跨页面导航保持精确定位。
- 四个Panel具备独立测试入口，结构预算不新增债务。

## 10. 统一验收标准

- AR-03—AR-14冻结工作包的每项“必须实施”“核心不变量”“强制测试”和“验收”均有可追踪结果。
- Writing、Canon、Planning和AppShell组合根完成职责收敛，章节会话由显式状态机驱动。
- Contracts、Preload和Main IPC公开表面、Channel集合、Schema和错误语义与基线精确一致。
- State Proposal、Generation、Project Workspace、Recovery和工具域完成内部模块化，事务与故障注入矩阵全部通过。
- 无可达Legacy业务入口，CSS责任域明确，主题、无障碍、DPI和1280×800布局无回归。
- 源码结构扫描无新增债务，目标文件全部满足正式预算。
- 全量Unit、Integration、Migration、Coverage、Security、Performance、Electron E2E、Build、Package Smoke和Release Check通过。

## 11. 验证矩阵

每个子包运行受影响专项回归；续作PR合并前运行：

```text
pnpm task:validate
pnpm check:workspaces
pnpm check:boundaries
pnpm check:language
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:migration
pnpm test:coverage
pnpm test:security
pnpm test:perf
pnpm build
pnpm test:e2e
pnpm release:check
```

永久专项验证入口：

```text
Engineering Validation / full                  每个AR完整检查点
Engineering Validation / contract-surface      Contracts公开表面复核
Engineering Validation / windows-ime           Windows原生输入法专项验收
Engineering Validation / package-smoke         三平台打包冒烟
Engineering Validation / dependency-diagnostic 依赖与高危审计诊断
```

所有Profile必须绑定受检完整`source_sha`。专项矩阵至少包括Writing会话、Canon行为、Renderer交互、IPC表面与安全、Core故障注入和事务回滚、项目生命周期、备份恢复、FTS、Diff、DOCX性能、三平台Build与Package Smoke。

## 12. 回退

- PR #272形成AR-03、AR-04已合并检查点；发现P0回归时可独立Revert提交`7adafeeadb973e5cb035c301602c511c2aa065c5`。
- PR #275仅同步永久治理能力；如治理提交出现独立回归，可在不回退M9-03产品实现的情况下单独处理`e80552afec44916cc3821e933fc477badbad178a`。
- AR-05—AR-14在续作分支内保持兼容Facade或组合根，并记录基线、实施Head、专项验证与回退边界。
- AR-10、AR-12和AR-13必须在进入下一依赖子包前形成专门回退说明。
- 子包失败时回退到续作分支内最近成功检查点，不在后续子包追补失败。
- 不修改持久化格式，不以治理文档掩盖未通过的实现或测试。

## 13. 完成条件

- AR-03—AR-14全部完成且验收可追踪。
- M9-04—M9-14保持`Removed（absorbed by M9-03）`，没有独立Runtime或独立任务状态。
- 续作实施PR永久门禁全部成功，并以受检`expected_head_sha`合并。
- 合并后main验证、原生输入法验收、三平台Package Smoke与独立治理关闭均已完成，M9-03已进入Verified终态。

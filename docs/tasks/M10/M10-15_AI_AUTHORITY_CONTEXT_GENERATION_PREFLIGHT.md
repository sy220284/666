# M10-15 AI权威上下文与生成前置一致性收口

> 状态：Implemented  
> 里程碑：M10 稳定性与治理续作 / V1.5 Preflight  
> 优先级：P1  
> 执行分支：`work`  
> 目标分支：`main`  
> 来源 PR：`#324`  
> 主线基线：`233f76a9119b92e9bafe02471667872a60966177`  
> 实施提交：`2e2ca2937754eeb260dc72e6dd90896c2ce35a90`

## 目标

根据全量代码审计与冻结架构文档，统一 AI 任务的权威 Draft、Provider 可执行语义、Constraint 时序来源与历史实体上下文，消除“保存成功后仍使用旧 Revision”“Capability Matrix 与真实降级策略冲突”“历史/当前来源在 Prompt 中失真”“Final 任务混入 Current Draft”和“历史 SceneBeat 引用归档实体后丢失设定”等跨域语义问题。

## 权威依据

- `docs/architecture/ARCHITECTURE.md`：SQLite 单一真源、Renderer 不拥有业务权威、AI 只写 Candidate/Proposal。
- `docs/architecture/DATA_FLOW.md`：AI 启动前读取已保存权威数据；历史状态不得冒充当前。
- `docs/contracts/IPC_CONTRACTS.md`：项目/Revision/Hash/幂等与稳定错误语义。
- `docs/tasks/M4/M4-02_CONSTRAINT_PACKAGE.md`：P0—P4、时序过滤、来源 Version 和可追溯 Hash。
- `docs/tasks/M4/M4-05_GENERATION_RUNTIME_EVAL.md`：`verified/limited/unverified` 支持档案；未验证模型允许风险继续。
- `docs/tasks/M5/M5-06_STATE_EXTRACTION_PROPOSAL_INTEGRATION.md`：state_extract 只能以当前 Final Version 为正文权威输入。

## 已确认问题

1. `generationAvailable` 以“当前会话已验证 Provider”作为硬条件，与未验证模型允许风险继续的冻结策略不一致。
2. `startGenerationTask()` 在 `flush()` 后继续使用调用前捕获的 Draft Revision，脏稿可能保存为 N+1 后仍以 N 启动。
3. ConstraintSource 内部拥有 `temporalStatus/sourceVersionId`，Prompt 序列化却丢失时序来源。
4. `constraintHash` 未纳入 `temporalStatus`，时序语义变化不能稳定改变约束身份。
5. `validate/state_extract` 仍注入 Current Draft，可能污染指定 Final Version 的判断。
6. 当前章节 SceneBeat 明确引用已归档 Entity 时，Constraint 查询按 active 目录过滤，历史返修丢失实体/Canon 上下文。

## 实施原则

- 已验证 `constraint-package.ts` 保持字节不变；新策略只通过既有 `HardenedConstraintPackageService` 公共包装层接入。
- 不修改数据库 Schema、Migration、生产依赖或锁文件。
- 不把“未验证 Provider”改成 Core 硬阻断；`generationAvailable` 表示可尝试生成，风险等级仍由 AiReadiness/ModelSupportProfile 表达。
- Generation 启动以 Flush 后重新读取的活动 Draft 作为唯一 Revision 真源。
- `validate/state_extract` 不读取 Current Draft；其他任务保持既有 Draft 策略。
- 时序来源进入 Prompt 与 `constraintHash`，历史/快照/未来来源对模型可见。
- 归档 Entity 只有在目标章节 SceneBeat 明确引用时才进入约束包，并保留归档来源标记；不恢复全局 active 语义，也不把目录归档错误解释成故事时间 historical。
- 不建立第二套 GenerationRun、Snapshot、Provider 或 Constraint 真源。

## 实施结果

- Capability Matrix 的 `generationAvailable` 改为“Core 健康且存在 Provider 即可尝试生成”；已验证/受限/未验证风险等级继续由既有 AI Readiness 与 ModelSupportProfile 承担，没有新增 Core 硬阻断。
- Generation 启动在 Flush 成功后重新 `draft.open()`，后续 Intent 与 `generation.start` 统一绑定最新活动 Draft；Draft 重读失败或上下文已失效时停止启动。
- 新增 `applyConstraintAuthorityPolicy()` 作为既有 Hardened Constraint 公共包装层：`validate/state_extract` 移除 `current_draft`，伏笔与人物弧光按目标章节投影未来状态，并在最终 `constraintHash` 中加入 `temporalStatus`。
- Prompt 序列化显式输出 `temporalStatus` 与可用的 `sourceVersionId`，模型能够区分 current / historical / upcoming / snapshot。
- 目标章节 SceneBeat 仍引用归档 Entity 时，恢复该实体及其当前 Canon 作为 P2 历史编辑上下文，并标记 `catalogStatus=archived_reference`；未被目标章节引用的归档实体继续过滤。
- `constraint-package.ts`、Migration、生产依赖与锁文件保持不变。
- 新增 M10-15 专项 Unit / Integration 测试，并同步既有 Generation 启动测试的权威 Draft Bridge；首轮 Ready Integration 暴露的“无关未来伏笔不应出现在当前约束”测试建模错误已修正，最终场景只对目标章本就相关、但故事事件发生在未来的伏笔验证 `upcoming` 时序，不扩大基础 Constraint 召回范围。

## 主要影响范围

- `apps/desktop/renderer/src/runtime/capability-matrix.ts`
- `apps/desktop/renderer/src/features/writing/generation-start.ts`
- `packages/core-service/src/constraint-package-hardening.ts`
- `packages/core-service/src/constraint-package-authority.ts`
- `packages/prompts/src/constraint-package-serializer.ts`
- `tests/unit/m10-15-generation-preflight.test.ts`
- `tests/unit/m10-12-generation-start-pending.test.ts`
- `tests/unit/writing-generation-start.test.ts`
- `tests/integration/constraint-package-authority.test.ts`
- `docs/INDEX.md`
- 当前任务治理与 Evidence 文件

## 自动化测试

- 脏稿 Flush 后 Generation 必须使用重新读取的最新 Draft Revision。
- 无已验证 Provider、但存在 Provider 时 `generationAvailable=true`；无 Provider 或 Core 不健康时为 false。
- `validate/state_extract` ConstraintPackage 不包含 `current_draft`。
- Prompt 序列化输出 `temporalStatus/sourceVersionId`，且 temporalStatus 改变会改变 `constraintHash`。
- SceneBeat 引用 archived Entity 时，该实体与 Canon 仍进入目标章节 Constraint，并标记归档来源；未引用归档实体仍不进入。
- 与目标章节无关的未来伏笔继续不进入当前约束；因目标章揭示边界相关但事件链接位于未来章节的伏笔按 `upcoming` 投影。
- 当前章之前/之后的人物弧光状态按目标章节投影，未来 `hit` 不作为当前事实进入模型上下文。
- 既有 P0/P1 不可裁剪、历史 Version 标记、未来补充检索过滤保持回归。

## 验证命令

```bash
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

## 回滚策略

回退本任务提交即可；不涉及 Migration、Schema 或数据格式回退。回退后恢复 M10-14 已验证基线。

## 完成条件

- [x] 六类根因全部在单一权威入口修复。
- [x] 新增成功、失败、脏稿、时序、Final-only 与 archived-history 回归测试。
- [ ] Ready Head 的 Unit、Integration、Migration、Coverage、Build、Security、Performance 与 Electron E2E 全部通过。
- [ ] Ready Evidence 绑定最终 implementation commit。
- [ ] Controlled Merge 完成。
- [ ] `main-verification` 与 `task-verification/M10-15` 成功。
- [ ] `work` 受控同步到已验证 `main`。

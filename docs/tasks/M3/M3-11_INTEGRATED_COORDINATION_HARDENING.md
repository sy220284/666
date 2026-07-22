# M3-11 M0—M3整体协同加固

> 状态：In Progress  
> 里程碑：M3 规划、设定与连续性  
> 类型：阶段关闭后的阻断性整改门，不扩展产品范围  
> 优先级：P0  
> 工作分支：`work/m3-11-integrated-coordination-hardening`

## 目标

修复M0—M3按任务卡纵向完成后暴露的横向协同缺陷，使Core生命周期、自动保存、Version定稿与恢复、结构操作、SceneBeat关联、连续性有效期和EndingSnapshot形成一致闭环，再恢复M4推进。

本任务只补齐冻结设计已经要求的协调机制：

1. Core异常时不得伪装健康，也不得让未保存正文陷入无恢复出口。
2. `logicalBlockId`继续作为跨Draft稳定正文身份；结构操作和Version恢复不得静默丢失SceneBeat关联。
3. EndingSnapshot继续作为可重建派生数据；Final Version、卷章顺序和连续性语义变化必须使旧快照失效。
4. 历史章节快照只包含截至该章节已经发生的伏笔与弧光状态，禁止后文信息倒灌。
5. Renderer本地停止等待不等同于Core真实取消，用户状态必须保持真实。

## 非目标

- 不新增云端、同步、账号、多人协作或第二套项目数据源。
- 不改变Draft、Candidate、Version、StateProposal和作者裁决模型。
- 不提前实现M4的FTS、约束包、Provider、Prompt或GenerationRun。
- 不把SQLite权威写入迁移到Renderer。
- 不重构无关UI和业务模块。

## 依赖与阻断

- 依赖：M0—M3现有实现。
- 阻断：M4-01及后续M4—M8任务。
- 恢复条件：本任务代码、专项测试和永久PR门禁通过，并完成主线复查。

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/contracts/IPC_CONTRACTS.md`
- `docs/testing/TEST_STRATEGY.md`
- `docs/tasks/M0/M0-02_ELECTRON_CORE_LIFECYCLE.md`
- `docs/tasks/M1/M1-06_AUTOSAVE_STATS_FIND.md`
- `docs/tasks/M1/M1-07_MANUAL_VERSION_FINALIZE.md`
- `docs/tasks/M2/M2-04_TRASH_STRUCTURE_RECOVERY.md`
- `docs/tasks/M3/M3-02_SCENE_BEAT_CROSS_CHAPTER.md`
- `docs/tasks/M3/M3-06_STATE_PROPOSAL_SNAPSHOT.md`

## 设计约束

```text
project.sqlite唯一权威数据源
├─ DraftBlock记录ID：数据库记录身份
├─ logicalBlockId：跨Revision、结构移动和Version恢复的稳定正文身份
├─ SceneBeat链接：跟随logicalBlockId迁移到当前活动Draft记录
└─ EndingSnapshot：派生数据，来源或时序变化后必须stale

Renderer
├─ 保留当前Tiptap内存正文
├─ 监听/轮询Main提供的Core状态
├─ Core异常时提供不依赖Draft flush的重启与复制出口
└─ 不直接读写SQLite或项目文件
```

## 实施内容

### 1. Schema 18协调守卫

新增追加Migration：

- SceneBeat链接迁移队列与触发器：在DraftBlock删除、跨章重建和活动Draft切换时，以`logicalBlockId`重新绑定当前记录。
- 连续性边界保护：被EntityState或KnowledgeState有效期引用的章节/卷，不允许直接软删除。
- 快照统一失效：卷章顺序、归属、删除、Final Version、状态、知情、伏笔与弧光变化后，统一把相关项目有效快照标记为stale。
- 历史投影：快照中的伏笔和弧光按目标章节位置投影，过滤后文事件。
- 旧快照迁移后统一stale，避免继续读取旧语义内容。

### 2. Renderer Core恢复监督器

- 独立于写作路由的Core健康检查。
- 记住最近一次健康状态下的活动项目。
- Core崩溃或不可达时显示安全恢复面板。
- 允许不经过Draft flush直接重启Core并重新打开原项目。
- 允许复制当前Tiptap窗口中的未保存正文。
- 生命周期由现有`RendererLifecycleRegistry`统一释放。

### 3. 取消语义校正

- AbortSignal已触发但底层IPC仍返回结果时，结果标记为`stale`。
- 只有底层操作真实响应Abort并终止时，才显示`cancelled`。
- 本任务不新增Core通用写操作取消协议；长任务真实取消仍按后续GenerationRun/Task协议实现。

## 主要影响范围

- `migrations/project/`
- `apps/desktop/renderer/src/runtime/`
- `apps/desktop/renderer/src/bridge/`
- `apps/desktop/renderer/src/react-entry.tsx`
- `tests/migration/`
- `tests/unit/`
- `docs/architecture/`
- `docs/tasks/`
- `docs/test-evidence/M3-11/`

## 必须验证

1. 早期章节Snapshot不包含后文才揭晓的伏笔状态和后文才命中的弧光节点。
2. Final Version或卷章时序变化后，旧Snapshot自动stale。
3. 拆章、合章、跨章移动或Version恢复重建DraftBlock后，SceneBeat链接跟随稳定`logicalBlockId`。
4. 删除有效期边界章节被数据库事务拒绝。
5. Core崩溃后可在不flush的情况下复制未保存正文并重启恢复项目。
6. 未真正终止的IPC不得显示为已取消。
7. `foreign_key_check`和Migration全量升级通过。

## 验证命令

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:migration
pnpm test:integration
pnpm test:security
pnpm test:e2e
```

## 完成条件

- 新增协调机制真实接入生产路径。
- 组合回归覆盖上述六条跨阶段路径。
- 不破坏五项核心不变量、Core单写队列、作者裁决权和本地数据边界。
- PR永久门禁通过，受控合并后重新读取`main`确认。
- M4-01只在本任务关闭后恢复为活动任务。

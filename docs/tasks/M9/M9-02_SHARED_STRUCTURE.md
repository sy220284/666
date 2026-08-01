# M9-02 WorldForge V1.1 Shared Structure拆分

> 状态：Implemented  
> 里程碑：M9 V1.1架构治理  
> 对应工作包：AR-02  
> 优先级：P0  
> 正式分支：`work/m9-02-shared-structure`

## 1. 目标

将卷章目录、结构编辑、回收站和结构操作从Planning工作台提取为独立共享领域，消除Writing对Planning Feature的反向依赖，同时保持现有UI、Bridge调用、数据行为和测试标记不变。

## 2. 必须实施

1. 新建`features/structure/`共享目录。
2. 将`StructureNavigator`及其结构编辑、回收站、拆章、并章和跨章移动逻辑迁出Planning。
3. Writing直接依赖Shared Structure，禁止继续从Planning转发导入。
4. Planning通过Shared Structure装配卷章目录。
5. 删除M9-01中冻结的`writing → planning`历史例外。
6. 保持所有`data-*`测试标记、按钮文案、Bridge输入输出及错误提示不变。
7. 增加共享结构导出与依赖方向回归测试。

## 3. 不可破坏的不变量

- 不修改数据库Schema、历史Migration、IPC Channel、协议版本、错误码或公开Bridge方法。
- 不修改Core Service、Main和Preload业务逻辑。
- 不改变卷章、回收站、拆分、合并、跨章移动的事务语义。
- 不改变正文刷新前置保护与只读模式行为。
- 不引入新的Feature横向依赖、循环依赖或结构预算例外。

## 4. 允许修改范围

- `apps/desktop/renderer/src/features/structure/`
- `apps/desktop/renderer/src/features/planning/`
- `apps/desktop/renderer/src/features/writing/`
- `tests/unit/`
- `tests/integration/`
- `tests/e2e/`
- `tests/security/`
- `docs/architecture/`
- `docs/tasks/`
- `scripts/`
- `.github/workflows/`

## 5. 禁止范围

- `apps/desktop/main/src/`
- `apps/desktop/preload/src/`
- `packages/contracts/src/`
- `packages/core-service/src/`
- `packages/domain/src/`
- `packages/editor-core/src/`
- `packages/prompts/src/`
- `migrations/`
- 历史Evidence目录

## 6. 验收标准

- Writing源码不再导入Planning Feature。
- `StructureNavigator`仅由Shared Structure领域导出。
- Planning与Writing均通过新共享模块完成原有装配。
- M9-01结构扫描不再需要`writing → planning`例外。
- 新共享TSX文件均满足默认800行预算，不登记新结构债务。
- 原卷章、回收站、拆分、合并、跨章移动相关单元、集成与E2E全部通过。
- 六项永久门禁全部成功。

## 7. 验证矩阵

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

## 8. 实施结果

- 最终实施提交：`253a37705dc718748fd41df261a9078761f07e10`。
- 一次性确定性提取工作流：`30681522018`，结果成功。
- 最终合同修复工作流：`30681893371`，Lint、结构扫描和受影响单测全部成功。
- 新增`features/structure/structure-navigator.tsx`，格式化后745行，保持在默认800行结构预算以内。
- 卷章目录、卷章编辑、回收站、拆章、并章和跨章移动逻辑已从Planning主工作台迁出。
- Writing直接导入Shared Structure，不再依赖Planning Feature。
- Planning通过Shared Structure完成原有装配，并保留兼容重导出。
- M9-01中唯一`writing → planning`历史例外已删除，禁止规则继续保留。
- 变换后全仓扫描：234个源码文件、653条相对导入边、15项既有结构债务；没有新增债务或循环例外。
- Shared Structure专项边界测试与迁移后的M3工作台安全标记测试均通过。
- TypeScript全仓检查通过。
- 临时变换脚本与临时工作流已从最终差异中删除。

## 9. 完成条件

- 独立PR永久门禁成功。
- 不存在Writing到Planning的代码依赖。
- Shared Structure模块职责和后续拆分边界可追溯。
- 合并后main验证成功，再将M9-02关闭为Verified。

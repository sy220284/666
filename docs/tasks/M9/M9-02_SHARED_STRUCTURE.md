# M9-02 WorldForge V1.1 Shared Structure拆分

> 状态：Verified
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
- `StructureNavigator`组合根不超过300行，子Panel与Controller不超过400行，不登记新结构债务。
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

## 8. 基线偏差与处理

- M9-02验证矩阵要求`pnpm release:check`成功，但基线中的Release工作流已将复用Quality Core配置为`package_smoke: false`，发布工具仍静态要求`package_smoke: true`，导致该验收项和正式Release接受门确定性失败。
- 当前Release拓扑由后续Linux、Windows、macOS三平台Build矩阵执行打包和成品启动冒烟；Quality Core关闭重复打包是既定设计，不影响三平台发布验证。
- 本任务将发布工具及其单元测试基准同步为`package_smoke: false`，不修改三平台Build矩阵、发布权限、校验和、不可变Release或产品代码。
- 独立修复PR #266已关闭为重复工作，修复和验证证据统一纳入M9-02 PR #265。

## 9. 实施结果

- 最终实施提交：`54a0297beca882d920319e2fca3618fe5d4dc0d0`。
- 一次性确定性提取工作流：`30681522018`，结果成功。
- 最终合同修复工作流：`30681893371`，Lint、结构扫描和受影响单测全部成功。
- 完成冻结方案规定的七文件职责拆分：组合根、结构树、卷编辑、章节编辑、结构操作、回收站和纯格式化模块均独立落盘。
- `StructureNavigator`组合根180行；子模块最大224行，分别满足300行组合根和400行Panel/Controller预算。
- 卷章目录、卷章编辑、回收站、拆章、并章和跨章移动逻辑已从Planning主工作台迁出。
- Writing直接导入Shared Structure，不再依赖Planning Feature。
- Planning通过Shared Structure完成原有装配，并保留兼容重导出。
- M9-01中唯一`writing → planning`历史例外已删除，禁止规则继续保留。
- 变换后全仓扫描：240个源码文件、675条相对导入边、15项既有结构债务；没有新增债务或循环例外。
- Shared Structure专项边界测试与迁移后的M3工作台安全标记共7项通过，并固定七文件职责边界及纯格式化函数的全部条件分支。
- Runtime显式依赖已Verified的M9-00治理激活任务与M9-01结构冻结任务。
- 发布配置单元测试9项和`pnpm release:check`均通过。
- TypeScript全仓检查通过。
- 临时变换脚本与临时工作流已从最终差异中删除。
- 来源PR #265的最终受检Head为`48b75233cfb6909aba28dd0467ed1e17b0e4ca30`，Draft与Ready两轮永久门禁均成功。
- 受控main提交为`0d6920b1001bbe8c9f063efba6af5664f2c4745a`；Main Verification运行`30687173687`成功。
- 最终四文件Evidence位于`docs/test-evidence/M9-02/`，任务状态已关闭为Verified。

## 10. 完成条件

- 独立PR永久门禁成功。
- 不存在Writing到Planning的代码依赖。
- Shared Structure模块职责和后续拆分边界可追溯。
- 合并后main验证与Evidence完整性校验均成功，M9-02已关闭为Verified。

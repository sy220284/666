# M3-03 通用实体与静态Canon

> 状态：Verified  
> 里程碑：M3 规划、设定与连续性  
> 优先级：P0  
> 工作分支：`work/m3-03-entity-canon`  
> 激活来源：M1-08质量返修与M2延期验收闭环完成后自动推进。

## 目标

建立人物、地点、势力、道具、能力、规则、事件等通用实体和作者确认的静态Canon。

## 阶段定位

建立规划、设定与连续性权威数据，作者确认后才改变状态。

## 非目标

- 不实现动态状态历史。
- AI不得直接写入Canon。

## 依赖

M3-01

## 关联

- 需求：REQ-017、REQ-018
- 功能ID：CAN-001、CAN-002
- 验收：P0-036、P0-037相关

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/database/DATA_DICTIONARY.md`
- `docs/decisions/ADR-004-ai-cannot-overwrite-draft.md`

## 主要影响范围

- `migrations/project/`
- `packages/domain/`
- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/main/`
- `apps/desktop/preload/`
- `apps/desktop/renderer/`
- `tests/integration/`
- `tests/migration/`
- `tests/security/`

## 实施内容

1. 实现Entity基表、实体类型、别名、摘要和状态。
2. 实现CanonFact、factKey、value、来源、确认时间和current/historical。
3. 同一实体同一factKey只允许一条current。
4. 作者命令才能确认、编辑或归档Canon。
5. 实体被SceneBeat、时间线和后续连续性模型安全引用。

## 测试与证据

- 实体CRUD、别名、跨项目引用和软删除影响。
- Canon current唯一性、历史保留和AI写入拒绝。
- 引用存在时永久删除影响预览。

证据保存到：`docs/test-evidence/M3-03/`

## 实现记录

- 实现真源：`78dfdbcab4e981379f6455c8ecb23c16b653139a`（PR #68）。
- 后端与Migration验证：Actions Run `29679433553`。
- Renderer Canon工作区验证：Actions Run `29679760603`。
- 已接通Entity CRUD、别名、归档、Canon current/history、作者权限、SceneBeat项目边界引用和永久删除影响预览。
- M3批量复验运行`29914507812`完成最终桌面与质量闭环。

## 完成条件

- 静态事实与动态状态边界明确。
- Canon不被模型推测或校验结果自动改变。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。

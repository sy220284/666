# M10-17 项目生命周期与 Renderer 状态所有权收口

> 状态：In Progress  
> 里程碑：M10 稳定性与治理续作 / V1.5 跨域语义与运行一致性收口  
> 优先级：P1  
> 执行分支：`work`  
> 目标分支：`main`  
> 主线基线：`1caa3fbccc15d84b35e82e80f415717d07a39ba7`

## 目标

补齐项目关闭/移动与长任务之间的 Core 生命周期屏障，统一 Planning 模式状态所有权，拆分 Rhythm 读取与写入路径，并让 Startup 对失败/空数据做显式 degraded 区分，同时补齐 Timeline Event 编辑入口。

## 阶段定位

承接已有效 VERIFIED 的 M10-16，补齐 `Freshness → Lifecycle → Renderer State Ownership` 链路。M10-17 完成 Controlled Merge、主线验证和 Work Synchronization 后，才允许启动 M10-18。

## 非目标

- 不重写 SQLite、Migration、Recovery、Candidate、GenerationRun、Provider 安全内核。
- 不修改已发布 Migration、数据库 Schema、生产依赖或锁文件。
- 不建立第二套 Task、Planning、Rhythm 或 Startup 状态机。
- 不提前实施 M10-18 Import 幂等、Entity Permanent Delete 或 Arc Timeline Dependency。
- 不降低 Coverage、安全、性能、Build 或 Electron E2E 门禁。

## 依赖与基线

- M10-16 已 Squash Merge 到 `1caa3fbccc15d84b35e82e80f415717d07a39ba7`。
- `main-verification=success`、`task-verification/M10-16=success`。
- 启动前已复核 `main == work`，ahead/behind 为 0/0，且无开放 PR。

## 关联问题

- P1-01：项目关闭/移动缺少项目级长任务屏障。
- P1-02：Planning disclosure mode 存在重复状态所有权。
- P1-05：Rhythm 读取路径会隐式写默认 Profile，破坏 read-only-compatible 语义。
- P2-03：Startup 把 Provider/Task/Continuation 查询失败伪装成空数据。
- P2-04：Timeline Event Core 支持 update，但 Renderer 无编辑入口。

## 必读文档

- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/DATA_FLOW.md`
- `docs/contracts/IPC_CONTRACTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/process/WORKFLOW_EXECUTION_ORDER.md`
- `docs/process/CURRENT_WORKSPACE_TOOLCHAIN.md`

## 主要影响范围

- `packages/core-service/src/task-protocol.ts`
- `packages/core-service/src/project-workspace/project-workspace-service.ts`
- `packages/core-service/src/project-workspace/project-move.ts`
- `packages/core-service/src/utility-service-container.ts`
- `packages/core-service/src/rhythm.ts`
- `apps/desktop/renderer/src/app/use-workspace-startup.ts`
- `apps/desktop/renderer/src/app/app-shell-pages.tsx`
- `apps/desktop/renderer/src/app/app-shell-m3.tsx`
- `apps/desktop/renderer/src/features/planning/planning-workbench.tsx`
- `apps/desktop/renderer/src/features/planning/planning-mode-workbench.tsx`
- `apps/desktop/renderer/src/features/canon/continuity-relationship-editor.tsx`
- 对应 Unit / Integration / Electron E2E 回归、Runtime、TASK_INDEX 与当前任务 Evidence。

## 职责与状态所有权

1. TaskProtocol 持有活动 Task 与项目 drain 状态；ProjectWorkspace 只通过项目级 Barrier 协调生命周期，不复制 Task 状态。
2. Close / Move 在关闭数据库前先进入项目 draining：禁止该项目新任务，取消可取消任务，等待不可取消原子阶段进入 terminal。
3. Barrier 失败时项目继续保持打开；成功关闭/移动后释放项目 drain 标记，后续重新打开同一项目仍可启动任务。
4. Planning disclosure mode 由 AppShell/PlanningModeWorkbench 的单一上层状态持有；子工作台只接收 `mode` 与 `onChangeMode`，不维护第二份 `professional` 状态。
5. Rhythm 查询必须使用 `readProject`；Profile 不存在时返回内存默认投影，不写数据库。只有显式 update/run 类命令可写。
6. read-only-compatible 可读取已有 Rhythm Profile/Results；禁止修改 Profile 或触发需要写入的重新计算。
7. Startup 对 Provider、Active Task、Continuation 读取结果显式区分 `loaded / empty / degraded`，失败不得回写成空集合或 null 伪装成功。
8. Task 通道建立/恢复后使用 `task.listActive(projectId)` 重新同步项目活动任务。
9. Timeline Event 编辑复用既有 `eventId != null` Core update 路径；Renderer 选择已有事件后填充表单并携带原 eventId 保存。

## 永久验收

- AI 运行中关闭项目：可取消阶段先 cancel，任务 terminal 后数据库才关闭。
- AI `saving_candidate` 等不可取消阶段移动项目：等待原子阶段完成后移动，或返回明确稳定错误；不得半关闭。
- draining 期间同项目不能启动新 Task；其他项目/无项目 Task 不受影响。
- Planning 模式切换只有一个真源，父子 UI 不发生状态漂移。
- read-only 打开检查/节奏页面：已有 Rhythm 数据可读，更新与运行写命令被拒绝。
- Profile 不存在时读取返回默认投影，但数据库不新增 `genre_rhythm_profiles` 行。
- Provider/Task/Continuation 查询失败显示 degraded，不能显示“0 Provider / 0 Task / 无续写状态”。
- Task 通道重连后通过 listActive 恢复现存任务。
- Timeline Event 选择已有事件后可编辑依赖、见证者、主体、地点、时间与章节，保存沿用同一 eventId。

## 回滚策略

整体回退 M10-17 产品实现与 UI 扩展；不回滚 M10-16 与任何 Migration。禁止恢复项目生命周期无 Task 屏障、Rhythm 读路径隐式写入或 Startup 失败即空数据的旧行为。

## 完成条件

- [ ] ProjectTaskBarrier 完成并覆盖关闭/移动原子阶段。
- [ ] Planning Mode 单真源完成。
- [ ] Rhythm Read/Write 分离及 read-only-compatible 闭环完成。
- [ ] Startup degraded 与 Task 重同步完成。
- [ ] Timeline Event 编辑入口完成。
- [ ] Unit / Integration / Coverage / Security / Performance / Build / Electron E2E 全绿。
- [ ] Ready Evidence 绑定最终 implementation commit。
- [ ] Controlled Merge 完成。
- [ ] `main-verification` 与 `task-verification/M10-17` 成功。
- [ ] `work` 受控同步到已验证 `main`。

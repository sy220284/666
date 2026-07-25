# M7-02 统一工作台、沉浸视图与交互状态

> 状态：Planned  
> 里程碑：M7 完整UI与体验整合  
> 优先级：P0  
> 建议分支：`work/m7-02-unified-workbench-interactions`

## 目标

在M5-00基础工作台和M7-01向导之上，将M6校验、搜索、导入导出和恢复能力接入统一产品入口，补齐全局状态仲裁、上下文帮助和跨工作台返回。

## 阶段定位

M5-00负责基础导航、正文中心布局、侧栏折叠和沉浸状态；M7-02负责全功能实现后的最终整合，不重复建设基础骨架。

## 非目标

- 不改变已完成Use Case的写入语义和权威边界。
- 不重建M5-00的六入口结构、写作三栏布局、基础沉浸视图或模式状态源。
- 不复制M6各工作台的业务状态机。
- 不允许Renderer通过猜测、轮询拼接或本地缓存冒充全局权威状态。

## 依赖

M7-01、M6

## 承接基线

- 复用M5-00作者语言、基础导航、继续写作、正文中心布局、侧栏和沉浸状态。
- 复用M7-01新手/专业披露与创作路径。
- 复用M5候选审阅及M6校验、搜索、导入导出和恢复的正式Use Case。

## 关联

- 需求：REQ-039、REQ-040
- 功能ID：UI-002、UI-003、UI-004、UI-005
- 验收：P0-060—P0-062

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/ui/INFORMATION_ARCHITECTURE.md`
- `docs/ui/SCREEN_SPECIFICATIONS.md`
- `docs/ui/INTERACTION_STATES.md`
- `docs/ui/UI_ACCEPTANCE_CHECKLIST.md`
- `docs/tasks/M5/M5-00_AUTHOR_WORKFLOW_PRODUCT_EXPERIENCE.md`

## 主要影响范围

- `apps/desktop/renderer/`
- `packages/contracts/`（仅统一状态投影确需扩展时）
- `packages/core-service/`（仅只读状态投影确需扩展时）
- `apps/desktop/main/`（仅与只读状态投影接线）
- `apps/desktop/preload/`（仅与只读状态投影接线）
- `tests/unit/`
- `tests/integration/`
- `tests/security/`
- `tests/e2e/`
- `docs/ui/`

## 状态来源原则

优先复用既有正式查询和TaskProtocol订阅。只有出现以下情况并提供证据时，才允许增加统一只读状态投影：

- 多查询无法形成同一时点一致快照；
- 页面进入产生明显请求风暴或重复查询；
- 当前接口无法表达跨域优先级所需的最小状态；
- Renderer只能通过推测或缓存才能判断真实状态。

新增投影只聚合ID、状态、优先级、时间和可执行动作，不复制正文、Prompt、约束全文、Candidate全文或业务写入逻辑。

## 实施内容

1. 将M6校验、全项目搜索、安全批量替换、导入导出和三轨恢复中心接入M5-00既有导航与项目菜单。
2. 统一Candidate、冲突、校验、搜索、导入导出、备份和恢复的入口、返回路径、面包屑和页面标题。
3. 所有工作台跳转前继续执行必要保存或flush，返回时恢复原项目、章节、选中对象、光标、滚动和面板状态。
4. 建立全局StatusArbiter：P0数据安全、P1进行中、P2待决策、P3信息；同一区域只显示最高优先状态，首页主动提醒不超过2条。
5. StatusArbiter只组合Core、TaskProtocol和正式Use Case真实状态，不以Renderer推测或伪造进度。
6. 优先使用现有查询与订阅；确需统一只读投影时，先量化一致性或请求风暴问题，再通过Contracts→Core→Main→Preload增加严格查询链路。
7. 将AI任务、Candidate待审、StateProposal待确认、ValidationIssue、索引stale、备份失败和只读风险纳入统一状态分级。
8. 上下文帮助采用控件提示、首次提示和页面短帮助三层；技术诊断与普通作者帮助明确分层。
9. 覆盖空、加载、成功、失败、取消、冲突、只读、过期计划、恢复和结果未知状态。
10. 未实现、不可用或受限功能不得显示为正常可点击入口；禁用原因必须具体。
11. 沉浸视图继续复用M5-00状态，只控制视觉披露，不创建第三套产品模式。
12. 全局键盘导航、焦点返回、窗口关闭重启和后台任务恢复在各工作台一致。
13. 删除或合并全功能接入后形成的重复入口和重复状态提示，但不得删除真实恢复路径。
14. 状态聚合必须有缓存失效、订阅解除和项目切换隔离，禁止产生跨项目残留、重复请求或全局状态泄漏。

## 测试与证据

- 校验、搜索、导入导出、恢复和候选全业务路径导航。
- 跨工作台保存阻断、返回原位置、选中对象和焦点恢复。
- StatusArbiter优先级、同区单状态和首页提醒最多2条。
- pending提案、partial Candidate、索引stale、备份失败和只读状态。
- 未实现/不可用入口不伪装可用。
- 既有查询方案与统一投影方案的请求数量、一致性和性能证据；没有证据时不得新增聚合接口。
- 只读状态投影不包含正文、Prompt、约束全文或写入能力。
- 项目切换、订阅卸载、重连和错误恢复无跨项目状态残留。
- 键盘、焦点、关闭重启和任务恢复。
- 基础导航、三栏布局和沉浸状态复用M5-00，无第二套状态源。

证据保存到：`docs/test-evidence/M7-02/`

## 完成条件

- 所有已实现功能通过真实入口可达，未实现功能不显示可用入口。
- UI状态与Core和TaskProtocol真实状态一致。
- M6新增工作台完整接入M5-00基础骨架。
- 基础导航、写作布局、沉浸状态和模式状态没有被重复实现。
- StatusArbiter没有形成Renderer权威状态或请求风暴。
- 跨工作台返回原位置和状态仲裁有完整Electron证据。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。

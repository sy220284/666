# M7-02 统一工作台、沉浸视图与交互状态

> 状态：Planned  
> 里程碑：M7 完整UI与体验整合  
> 优先级：P0  
> 建议分支：`feat/m7-unified-workbench-interactions`

## 目标

统一项目首页、写作、规划设定、候选、校验和恢复工作台，补齐状态仲裁、帮助和所有交互状态。

## 阶段定位

统一工作台、新手/专业模式、主题、无障碍和目标显示环境。

## 非目标

- 不改变已完成Use Case和IPC契约。

## 依赖

M7-01

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

## 主要影响范围

- `apps/desktop/renderer/`
- `packages/contracts/`
- `tests/e2e/`

## 实施内容

1. 实现六个一级入口和三个核心工作台的统一导航。
2. 写作工作台使用左卷章、中正文、右上下文，正文为视觉中心。
3. 沉浸写作作为视图状态，不创建第三套产品模式。
4. 统一Candidate、冲突、校验、搜索、导入导出和恢复入口。
5. StatusArbiter按P0数据安全、P1进行中、P2待决策、P3信息分级，每区域只显示最高优先项。
6. 上下文帮助采用悬停、首次提示和页面短帮助三层。
7. 覆盖空、加载、成功、失败、取消、冲突、只读和恢复状态。

## 测试与证据

- 全业务路径导航和返回原位置。
- 状态优先级、首页主动提醒最多2条。
- 键盘、焦点、关闭重启和任务恢复。

证据保存到：`docs/test-evidence/M7-02/`

## 完成条件

- 所有已实现功能通过真实入口可达，未实现功能不显示可用入口。
- UI状态与Core真实状态一致。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。

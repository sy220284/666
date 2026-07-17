# M1-01 app.sqlite、应用设置与最近项目

> 状态：Verified  
> 里程碑：M1 基础写作MVP  
> 优先级：P0  
> 工作分支：`main`（作者预授权实现优先模式）

## 目标

建立应用级数据真源和项目首页基础，使最近项目、窗口/界面偏好与正文数据彻底分离。

## 阶段定位

交付无AI也能长期写作、自动保存、版本、导入导出和恢复的基础产品。

## 非目标

- 不创建project.sqlite业务内容。
- 不实现完整设置中心和主题视觉。

## 依赖

M0

## 关联

- 需求：REQ-002、REQ-041
- 功能ID：APP-002、UI-006
- 验收：P0-009、P0-063—P0-066相关

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/database/DATA_DICTIONARY.md`
- `docs/ui/SCREEN_SPECIFICATIONS.md`

## 主要影响范围

- `migrations/app/`
- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/renderer/`
- `apps/desktop/main/`
- `apps/desktop/preload/`
- `tests/integration/`
- `tests/e2e/`
- `tests/security/`

## 实施内容

1. 实现app_settings、recent_projects和provider_configs应用级表及Repository。
2. 实现最近项目登记、排序、移除、路径失效标记和重新定位。
3. 保存窗口、正文宽度、界面缩放、正文字号、模式和主题标识等应用偏好。
4. 首页只展示真实项目记录，不缓存正文和项目业务状态。
5. 实现设置读取、更新、重置和跨版本兼容。

## 测试与证据

- 最近项目排序、重复路径、路径丢失、重新定位和移除。
- app.sqlite扫描确认无正文、Candidate、Version和凭据正文。
- 设置损坏或未知版本安全回退。

证据保存到：`docs/test-evidence/M1-01/`

## 完成条件

- 应用重启后最近项目和基础偏好可恢复。
- 项目级数据与应用级数据边界有自动化测试。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。

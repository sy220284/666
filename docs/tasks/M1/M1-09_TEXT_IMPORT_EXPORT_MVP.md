# M1-09 TXT与Markdown基础导入导出

> 状态：Planned  
> 里程碑：M1 基础写作MVP  
> 优先级：P0  
> 建议分支：`feat/m1-text-import-export-mvp`

## 目标

让基础写作MVP具备旧稿进入和稳定稿件输出能力。

## 阶段定位

交付无AI也能长期写作、自动保存、版本、导入导出和恢复的基础产品。

## 非目标

- 不实现DOCX。
- 不实现复杂富文本往返。

## 依赖

M1-07、M1-08

## 关联

- 需求：REQ-034、REQ-035
- 功能ID：IMP-001、EXP-001
- 验收：P0-048、P0-050

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/security/THREAT_MODEL.md`
- `docs/contracts/ERROR_CODES.md`
- `docs/ui/SCREEN_SPECIFICATIONS.md`

## 主要影响范围

- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/main/`
- `apps/desktop/preload/`
- `apps/desktop/renderer/`
- `tests/integration/`
- `tests/e2e/`

## 实施内容

1. 支持TXT UTF-8、UTF-16、GB18030编码候选，低置信度允许人工选择。
2. 支持Markdown标题和基础段落结构。
3. 生成ImportPlan，提供分章、合并、拆分、重命名和取消预览。
4. 提交前创建操作恢复点，单事务写入Volume、Chapter、Draft和Version。
5. 从选定Version导出TXT和Markdown。
6. 导出使用临时文件、验证和原子重命名。

## 测试与证据

- 不同编码、空文档、异常内容、取消、分章调整和目标文件冲突。
- 预览阶段项目数据库不变化，失败后无半成品。
- TXT/Markdown往返保持章节顺序和正文。

证据保存到：`docs/test-evidence/M1-09/`

## 完成条件

- M1退出时产品无需AI即可创建项目、建卷章、写作、保存、版本、导入、导出和恢复。
- 基础MVP完整业务场景有E2E证据。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。

# M6-05 DOCX安全导入与多格式导出

> 状态：Planned  
> 里程碑：M6 校验、搜索与交付  
> 优先级：P0  
> 建议分支：`work/m6-05-docx-transfer`

## 目标

在现有TXT/Markdown导入导出协调器基础上补齐DOCX安全导入和TXT/Markdown/DOCX完整导出。

## 阶段定位

补齐校验、全项目搜索、节奏指标、DOCX和三轨备份恢复。本任务扩展既有导入导出路径，不建立第二套ImportPlan、提交协调器或恢复事务。

## 非目标

- 不保留任意Word宏、OLE、脚本和复杂版式。
- 不重建TXT/Markdown导入导出真源。
- 不建立新的Renderer临时导入权威状态。

## 依赖

M1-09、M1-08

## 承接基线

启动任务前必须复核并复用现有`CoordinatedImportExportService`及相关合同：

- ImportPlan预览与提交。
- 计划数量上限与过期清理。
- 提交前路径、项目和输入文件重校验。
- 恢复点与单事务提交。
- 失败、取消和过期计划清理。
- Version来源明确的TXT/Markdown导出。

## 关联

- 需求：REQ-034、REQ-035
- 功能ID：IMP-002、EXP-001
- 验收：P0-048—P0-050

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/security/THREAT_MODEL.md`
- `docs/contracts/ERROR_CODES.md`
- `docs/ui/SCREEN_SPECIFICATIONS.md`
- `docs/tasks/M1/M1-09_TEXT_IMPORT_EXPORT.md`

## 主要影响范围

- `packages/core-service/`中的既有导入导出协调器与DOCX适配器
- `packages/contracts/`
- `apps/desktop/main/`
- `apps/desktop/preload/`
- `apps/desktop/renderer/`
- `tests/unit/`
- `tests/security/`
- `tests/integration/`
- `tests/e2e/`

## 实施内容

1. 在现有ImportPlan合同中增加DOCX安全解析结果，不创建平行计划缓存或第二套提交入口。
2. DOCX只提取段落、标题和允许的基础格式，统一转换为现有导入中间模型。
3. 限制解包总大小、单文件大小、文件数、压缩比、嵌套深度和路径；忽略宏、OLE、脚本、外部模板和远程资源。
4. 使用隔离临时目录和安全ZIP读取；路径穿越、符号链接、设备文件和异常关系必须拒绝。
5. 失败、取消、超时和进程异常时清理临时内容、计划和未提交资源。
6. 提交继续复用计划过期、路径重校验、恢复点和单事务写入；任务开始后原文件或项目状态变化时计划必须失效。
7. 导入产生的Draft变更必须标记`mutationOrigin: import`，供M6-04排除人工写作统计。
8. 从作者选定的不可变Version导出TXT、Markdown和DOCX，禁止读取Candidate、当前Renderer HTML或未确认临时流。
9. 输出使用同目录临时文件、内容验证、fsync/关闭和原子重命名；目标冲突由明确策略处理。
10. DOCX适配器只负责格式转换和安全解析，不复制项目事务、恢复或Version选择逻辑。

## 测试与证据

- 异常DOCX、ZIP路径穿越、压缩炸弹、超限文件、嵌套关系、宏、OLE、外部资源和空内容。
- ImportPlan过期、原文件变化、项目变化、取消、目标冲突和提交失败。
- 临时目录、计划和恢复点清理。
- TXT/Markdown既有路径回归，确认扩展未建立第二套协调器。
- Version→TXT/Markdown/DOCX导出及往返一致性。
- 导出不读取Candidate、Draft临时流或Renderer HTML。
- 导入变更来源正确标记为`import`。

证据保存到：`docs/test-evidence/M6-05/`

## 完成条件

- DOCX复用现有ImportPlan和提交协调器，不存在平行导入真源。
- 异常输入不留下临时内容、孤立计划或项目半成品。
- 多格式导出内容稳定且来源Version明确。
- 导入变更不会被M6-04计入人工写作统计。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、导入导出、安全、UI或测试文档。

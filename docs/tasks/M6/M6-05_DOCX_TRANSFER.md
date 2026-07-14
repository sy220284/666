# M6-05 DOCX安全导入与多格式导出

> 状态：Planned  
> 里程碑：M6 校验、搜索与交付  
> 优先级：P0  
> 建议分支：`feat/m6-docx-transfer`

## 目标

补齐DOCX安全导入和TXT/Markdown/DOCX完整导出。

## 阶段定位

补齐校验、全项目搜索、节奏指标、DOCX和三轨备份恢复。

## 非目标

- 不保留任意Word宏、OLE、脚本和复杂版式。

## 依赖

M1-09、M1-08

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

## 主要影响范围

- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/main/`
- `apps/desktop/renderer/`
- `tests/security/`
- `tests/integration/`
- `tests/e2e/`

## 实施内容

1. DOCX只提取段落、标题和允许的基础格式。
2. 限制解包总大小、文件数、压缩比和路径，忽略宏、OLE和外部资源。
3. 使用隔离临时目录，失败/取消全部清理。
4. 复用ImportPlan、恢复点和单事务提交。
5. 从选定Version导出TXT、Markdown和DOCX。
6. 输出使用临时文件、验证和原子重命名。

## 测试与证据

- 异常DOCX、ZIP路径穿越、压缩炸弹、外部资源和空内容。
- 取消、目标冲突、导出失败和往返一致性。
- 导出不读取Candidate或Renderer HTML。

证据保存到：`docs/test-evidence/M6-05/`

## 完成条件

- 异常输入不留下临时内容或项目半成品。
- 多格式导出内容稳定且来源Version明确。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。

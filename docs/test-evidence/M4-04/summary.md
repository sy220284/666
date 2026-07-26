# M4-04 Evidence Summary

## 当前阶段

整体基线审计与编码前实施规划已经完成。C1—C5 作者工作流、GenerationRun、
T0/T1、改写、融合、Candidate 审阅、状态提取与 Validation 闭环已实现，
下一实施入口为 C6 搜索、替换、统计与节奏。

## 本阶段交付

- M4-04任务卡四项执行附件完成。
- 28项剩余需求已映射到用户路径、代码模块、测试和P0。
- Project Schema 21后的Migration序列、IPC及共享合同方案冻结。
- 九个内部检查点、风险、回滚和测试矩阵冻结。
- 正式分支继续使用`work/m4-04-v1-integrated-delivery`。
- Schema 22、ProjectContinuation Core服务及完整Main/Preload/Renderer入口完成。
- 首页继续写作、编辑器重启恢复、侧栏折叠、沉浸写作和中文实体类型表单完成。
- 既有拆章、并章、跨章移动可视化预览继续复用`planHash`、LockGuard、事务和恢复点。
- Schema 23、GenerationRun、ModelSupportProfile、类型化结果引用和独立Generation IPC完成。
- 六类生产Prompt完成；直接章节目标到正文Candidate的真实Provider纵向路径完成。
- 取消、迟到增量隔离、partial显式保存或丢弃、重启恢复和结果原子提交完成。
- Schema 24、Skeleton 修订、生成输入来源和 Candidate 来源映射完成。
- T0 多 Skeleton 与 T1 Skeleton/SceneBeat/直接目标三种互斥来源完成。
- 快速/结构性改写使用 Revision、块 Hash、范围与文本 Hash 权威锚点。
- Beat/Segment 双模式融合、重复/重叠/过期来源拒绝和完整追溯完成。
- Candidate 工作台接入真实进度、取消、partial 裁决、继续生成、手动补全、
  来源追溯、差异、冲突、采用和整体撤销。
- Skeleton 与 Prose 在合同、存储和 Core Preview/Apply 边界保持硬隔离。
- Schema 25、StateProposalBatch、ValidationBatch、ValidationIssue、
  StoryTodo 与 StoryComment 完成。
- 状态提取与 AI 语义检查接入真实 Provider Runtime，只读取当前 Final Version，
  并与 GenerationRun 结果引用原子提交。
- Provider 提案保持 pending；作者裁决前不改变实体状态、人物弧光或 Draft。
- 确定性规则检查具备规则/配置版本、输入幂等、稳定 ID 和 Version/Block Hash 锚点。
- 检查工作台及状态提案工作台已接入规则/AI运行、证据、问题动作、待办、批注和裁决。

## 当前结论

现有 M0—M3 与 M4-01—M4-03 底座保持兼容。C1—C5 纵向代码与本地自动化
回归通过；长期 PR 保持 Draft，继续实施 C6—C8，最终以 P0-001—P0-075
证据关闭任务。

## 已执行校验

- M4-04任务状态与Preflight通过。
- Evidence文档完整性与Manifest哈希校验通过。
- 规划文档Prettier检查通过。
- ESLint通过。
- TypeScript全工作区Typecheck通过。
- Unit：54个测试文件、456项测试全部通过。
- C1全量Unit、Integration、Migration：120个测试文件、630项全部通过。
- C1全工作区Build、Typecheck和受影响代码ESLint通过。
- Electron SQLite运行时通过；当前容器没有X Server，Electron Playwright需由PR CI复核。
- C2全量Unit、Integration、Migration、Security：150个测试文件、730项通过、1项跳过。
- C2全工作区Typecheck和ESLint通过。
- C2生成运行时的原子结果、取消、partial、重启恢复、IPC安全边界均有自动化覆盖。
- C3—C4 Unit、Integration、Migration、Security：154 个测试文件、739 项通过、
  1 项跳过。
- C3—C4 AI Eval：2 个测试文件、8 项通过；Performance：10 个测试文件、37 项通过。
- C3—C4 全工作区 Build、Typecheck、ESLint 与受影响文件 Prettier 通过。
- C5 Unit、Integration、Migration、Security：157 个测试文件、744 项通过、
  1 项跳过。
- C5 全工作区 Build、Typecheck、ESLint 与 Prettier 通过。

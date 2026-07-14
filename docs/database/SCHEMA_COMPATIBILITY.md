# WorldForge V1.0 Schema兼容策略

> 状态：Frozen

## 1. 兼容目标

应用升级时安全打开旧项目，明确处理高版本项目、损坏项目和中断Migration。优先保护Draft、Candidate、Version、Canon和连续性权威数据。

## 2. 版本字段

- 应用版本：语义版本，如`1.0.0`。
- `app.sqlite` Schema版本：整数递增。
- `project.sqlite` Schema版本：整数递增。
- IPC协议版本：独立整数。
- Prompt版本：每个promptId独立整数。

这些版本不可混用。

V1.0不定义`.wfproj`项目包格式。V1.0只支持TXT、Markdown和DOCX正文/文档导入导出；完整项目包属于后续独立范围。

## 3. 支持规则

| 场景 | 行为 |
|---|---|
| 数据库版本等于应用支持版本 | 正常读写 |
| 数据库版本低于支持版本 | 创建恢复点后按顺序Migration |
| 数据库版本高于支持版本 | 只读打开，不降级写入 |
| checksum与仓库脚本不一致 | 停止写入，进入诊断与恢复 |
| `quick_check`失败 | 只读打开，允许浏览、导出和恢复 |
| 派生索引版本落后 | 正常打开，标记stale并重建 |
| 外文件迁移未完成 | 读取`migration_journal`，继续或回滚 |

## 4. V1兼容窗口

V1.x至少支持从V1.0发布Schema逐级升级到当前版本。禁止跳过中间Migration。V2立项时再决定V1早期Schema支持窗口。

## 5. 字段兼容

- 新增可空字段：低风险。
- 新增非空字段：必须提供确定默认值或分阶段回填。
- 枚举新增值：旧应用不得写回未知值。
- 字段改名：新增字段、迁移和双读过渡，后续版本再移除。
- 字段语义变化：新建字段或表，不复用旧名称。
- 从P1/V1.5新增功能：通过追加Migration建立新表，不在P0初始Schema预留空表。

## 6. IPC兼容

- Main、Preload、Renderer和Core启动时交换protocolVersion。
- 版本不匹配时停止业务命令，只允许健康检查和安全退出。
- 新增可选字段可保持兼容；删除、改义或新增必填字段必须提升协议版本。

## 7. Prompt与Candidate兼容

- Candidate和GenerationRun记录promptId与整数promptVersion。
- 历史Prompt版本在相关Candidate仍需回放时保留。
- 输出Schema变化递增Prompt版本；不得用同一版本号改变语义。
- 无法读取的未来Prompt结果保持只读，不猜测改写。

## 8. 派生数据

以下数据可因版本不兼容直接重建：

- FTS5索引与索引队列。
- 字数和统计缓存。
- 页面布局缓存。
- 约束包缓存。
- ValidationIssue和节奏建议派生结果。

重建不得修改Draft、Candidate、Version、Canon、EntityState和ArcMilestone。

## 9. 兼容测试

- 每个已发布Schema保留最小Fixture。
- 对所有支持Fixture执行升级、编辑、Candidate采用、Version、状态提案、弧光提案和导出。
- 高版本Fixture验证只读打开。
- 未知枚举、缺少派生表、索引损坏和migration_journal中断均需测试。

## 10. 退回旧版本

不承诺数据库降级。退回旧应用时恢复升级前备份。升级界面必须明确该限制。

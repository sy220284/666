# C7 DOCX 与三轨备份恢复检查点

## 结论

C7 已完成 DOCX 安全导入、基于作者选择不可变 Version 的 TXT、Markdown、DOCX
导出，以及日常滚动、重大操作、命名快照三轨备份恢复。导入继续复用既有
ImportPlan、计划失效、恢复点和单事务提交；恢复继续复用既有 RecoveryService，
不会建立第二套数据通道。

## DOCX 导入导出

- DOCX 进入 Core 前先读取 ZIP 中央目录并限制压缩体积、条目数、单文件解压体积、
  总解压体积、压缩比和路径深度。
- 拒绝 ZIP64、多磁盘、加密、非支持压缩、目录穿越、绝对路径、反斜杠、
  大小写重复条目、符号链接和设备文件。
- 校验本地 Header 签名与偏移边界；解压后的条目大小必须与中央目录声明一致。
  中央目录与本地 Header 的完整字段级交叉校验继续纳入 C8 安全硬化。
- 拒绝宏、OLE、ActiveX、嵌入式可执行文件或脚本、外部 Relationship、
  `DOCTYPE`、`ENTITY` 与 XInclude；只解压解析所需 XML。
- DOCX 正文和标题归一化为既有 ImportPlan；格式损失以显式警告展示。
- 预览记录项目结构、Draft Revision 与 Version Hash 指纹；提交前项目变化会让
  计划失效，不能把旧预览写入新状态。
- 导入前创建重大操作恢复点，所有章节、Draft、Block、Version 和
  `mutationOrigin=import` 审计记录在单事务提交；导入不计入人工写作会话。
- 多格式导出只读取作者明确选择的不可变 Version。临时文件使用排他创建、
  最小权限、`fsync` 和原子重命名；DOCX 临时产物在替换目标前重新校验。

## 三轨备份与恢复

- Schema 27 为既有 `backup_records` 增加 `daily`、`major`、`named` 三轨、
  显示名称、备注、作者保护、Migration 保护和 Schema 版本，并加入严格
  `backup_policies`。
- 日常备份按项目 UTC 日期去重；关闭可写活动项目时由 Core 自动执行。
- 结构变更、导入、替换和 Migration 等重大操作继续形成重大恢复点；关键
  Migration 点永久保护。
- 命名快照要求作者权限，创建时自动进入作者保护，可记录名称和备注。
- 默认保留 14 份日常备份；作者可以配置日常份数、重大恢复点份数与天数、
  总空间配额。
- 清理先生成确定性计划 Hash，再由作者执行。作者保护、Migration 保护和最后一份
  已验证备份不可自动清理；计划期间状态变化会被拒绝为 stale。
- 清理使用文件暂存、数据库事务和失败补偿，避免数据库记录与备份文件半删除。
- 解除作者保护必须回填精确 `backupId` 确认；硬保护不受该操作影响。
- 恢复始终复制并注册为新项目，原项目、备份及不可变 Version 保持不变。

## 测试

- DOCX 往返、ImportPlan、不可变 Version 导出、导入来源审计、人工统计排除和
  项目变化导致预览失效。
- ZIP 路径穿越、ActiveX、外部关系、压缩炸弹与合法归档对照。
- 日常去重、命名/Migration/最后验证保护、显式解除保护、策略更新、
  stale 清理计划、文件与数据库一致性。
- 六个新增恢复 IPC 命令的严格 Envelope、不受信 Renderer、多余字段和伪造
  Migration 操作拒绝。
- Unit、Integration、Migration、Security：165 个测试文件，757 项通过、
  1 项既有跳过。
- C7 定向回归：5 个测试文件、7 项全部通过。
- C7 阶段全工作区 Build、Typecheck、ESLint 与 Prettier 通过。
- C0—C7 基线修复提交`3b8cae9d42dd06c5862606b1c23afef50cd0fa9d`的
  Workspaces、Boundary、Prettier、ESLint、Typecheck与干净工作树检查通过。

## 后续边界

C8 将完成首次使用向导、统一工作台、Theme A/B、无障碍和 DPI 硬化，并执行
安全、隐私、真实性能、Electron E2E、AI Eval、跨平台构建与 P0-001—P0-075
发布验收。DOCX完整本地Header字段交叉校验、真实大文件、安装包和平台文件系统
差异纳入 C8 矩阵。

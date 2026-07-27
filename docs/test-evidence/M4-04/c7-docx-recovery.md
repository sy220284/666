# C7 DOCX 与三轨备份恢复检查点

## 结论

C7已完成DOCX安全导入、基于作者选择不可变Version的TXT、Markdown、DOCX导出，以及日常滚动、重大操作、命名快照三轨备份恢复。导入继续复用既有ImportPlan、计划失效、恢复点和单事务提交；恢复继续复用既有RecoveryService，不建立第二套数据通道。

## DOCX 导入导出

- DOCX进入Core前先读取ZIP中央目录并限制压缩体积、条目数、单文件解压体积、总解压体积、压缩比和路径深度。
- 拒绝ZIP64、多磁盘、加密、非支持压缩、目录穿越、绝对路径、反斜杠、大小写重复条目、符号链接和设备文件。
- 校验本地Header签名与偏移边界；解压后的条目大小必须与中央目录声明一致。中央目录与本地Header的完整字段级交叉校验继续纳入C8安全硬化。
- 拒绝宏、OLE、ActiveX、嵌入式可执行文件或脚本、外部Relationship、`DOCTYPE`、`ENTITY`与XInclude；只解压解析所需XML。
- DOCX正文和标题归一化为既有ImportPlan；格式损失以显式警告展示。
- 预览记录项目结构、Draft Revision与Version Hash指纹；提交前项目变化会让计划失效，不能把旧预览写入新状态。
- 导入前创建重大操作恢复点，所有章节、Draft、Block、Version和`mutationOrigin=import`审计记录在单事务提交；导入不计入人工写作会话。
- 多格式导出只读取作者明确选择的不可变Version。临时文件使用排他创建、最小权限、`fsync`和原子重命名；DOCX临时产物在替换目标前重新校验。

## 三轨备份与恢复

- Schema 27为既有`backup_records`增加`daily`、`major`、`named`三轨、显示名称、备注、作者保护、Migration保护和Schema版本，并加入严格`backup_policies`。
- 日常备份按项目UTC日期去重；关闭可写活动项目时由Core自动执行。
- 生产使用的`CheckpointAwareRecoveryService`会合并同一项目、同一UTC日期内的并发日常备份请求，避免关闭项目与手动触发同时生成重复备份。
- in-flight状态在成功或失败后均安全清理，并按项目和UTC日期隔离，跨日请求不会被前一天长任务吞并。
- 结构变更、导入、替换和Migration等重大操作继续形成重大恢复点；关键Migration点永久保护。
- 命名快照要求作者权限，创建时自动进入作者保护，可记录名称和备注。
- 默认保留14份日常备份；作者可以配置日常份数、重大恢复点份数与天数、总空间配额。
- 清理先生成确定性计划Hash，再由作者执行。作者保护、Migration保护和最后一份已验证备份不可自动清理；计划期间状态变化会被拒绝为stale。
- 清理使用文件暂存、数据库事务和失败补偿，避免数据库记录与备份文件半删除。
- 解除作者保护必须回填精确`backupId`确认；硬保护不受该操作影响。
- 恢复始终复制并注册为新项目，原项目、备份及不可变Version保持不变。

## 历史阶段测试

- DOCX往返、ImportPlan、不可变Version导出、导入来源审计、人工统计排除和项目变化导致预览失效。
- ZIP路径穿越、ActiveX、外部关系、压缩炸弹与合法归档对照。
- 日常顺序去重、命名/Migration/最后验证保护、显式解除保护、策略更新、stale清理计划、文件与数据库一致性。
- 六个新增恢复IPC命令的严格Envelope、不受信Renderer、多余字段和伪造Migration操作拒绝。
- Unit、Integration、Migration、Security：165个测试文件、757项通过、1项既有跳过。
- C7定向回归：5个测试文件、7项全部通过。
- C7阶段全工作区Build、Typecheck、ESLint与Prettier通过。

## C0—C7复核验证

- 第二轮产品复核提交：`4f78143ca933a7e57326e32e3e86285d0bfc95c3`。
- 新增真正并发的`Promise.all`日常备份回归，并验证最终只有一条daily记录。
- 最近一次完整产品矩阵为提交`f36ca0c0567130ab7072c6da3d0ed402dd1fda2d`上的Quality #2186、Security #1976与Performance #1942。
- Unit、Integration、Migration、Coverage、Build、Package Smoke、Electron E2E、DOCX安全回归、恢复IPC安全回归及性能预算均实际执行并成功。
- C7自动化验收通过；数据库级daily唯一约束、完整DOCX本地Header字段交叉验证、真实超大文件和跨平台文件系统差异继续作为C8硬化范围，不冒充已验证。

## 后续边界

C8尚未开始。后续仍按M4-04任务卡原始“第六阶段：完整体验、硬化与发布关闭”执行首次使用向导、统一工作台、主题、无障碍、DPI、安全、性能、真实Provider Eval、跨平台构建与P0发布验收。不存在有效的C8重写阶段进度。

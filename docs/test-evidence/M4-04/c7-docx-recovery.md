# C7 DOCX 与三轨备份恢复检查点

## 结论

C7已完成DOCX安全导入、基于作者选择不可变Version的TXT、Markdown、DOCX导出，以及日常滚动、重大操作、命名快照三轨备份恢复。导入复用既有ImportPlan、计划失效、恢复点和单事务提交；恢复复用既有RecoveryService。

## DOCX 导入导出

- DOCX进入Core前读取ZIP中央目录并限制压缩体积、条目数、单文件解压体积、总解压体积、压缩比和路径深度。
- 拒绝ZIP64、多磁盘、加密、非支持压缩、目录穿越、绝对路径、反斜杠、大小写重复条目、符号链接和设备文件。
- 校验本地Header签名与偏移边界；解压后条目大小必须与中央目录声明一致。
- 拒绝宏、OLE、ActiveX、嵌入式可执行文件或脚本、外部Relationship、`DOCTYPE`、`ENTITY`与XInclude。
- DOCX正文和标题归一化为既有ImportPlan；格式损失以显式警告展示。
- 提交前项目变化会使计划失效。
- 导入前创建重大操作恢复点，章节、Draft、Block、Version和`mutationOrigin=import`审计记录在单事务提交；导入不计入人工写作会话。
- 多格式导出只读取作者明确选择的不可变Version，使用排他临时文件、最小权限、`fsync`和原子重命名。

## 三轨备份与恢复

- Schema 27增加`daily`、`major`、`named`三轨及严格`backup_policies`。
- 日常备份按项目UTC日期去重；生产Service合并同项目、同UTC日期的并发请求。
- in-flight状态在成功或失败后清理，跨日请求隔离。
- 结构变更、导入、替换和Migration形成重大恢复点；关键Migration点永久保护。
- 命名快照要求作者权限并自动进入作者保护。
- 清理先生成确定性计划Hash，再由作者执行；作者保护、Migration保护和最后一份已验证备份不可自动清理。
- 恢复始终复制并注册为新项目，原项目、备份及不可变Version保持不变。

## 验证结论

产品源提交`9131a6db1f43d97e52aaa867010a316998f860fb`的Quality #2198、Security #1988和Performance #1954全部成功。Unit、Integration、Migration、Coverage、Build、Package Smoke、Electron E2E、DOCX安全回归、恢复IPC安全回归及性能预算均通过。

C7验收通过。

## 后续边界

C8尚未开始。DOCX中央目录与本地Header完整字段级交叉验证、真实超大文件、Windows长路径、macOS权限、Linux文件系统差异及跨平台安装矩阵继续纳入C8，不冒充已验证。

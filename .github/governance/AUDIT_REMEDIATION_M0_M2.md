# M0—M2审计修复计划

> 审计复核基线：`main@9db5bbf1460b11df0236c0104fca2acf720459ad`  
> 修复分支：`fix/governance-audit-m0-m2-remediation`  
> 当前活动任务：M3-06，必须与基线保持一致，不在本PR内推进或修改。

## 1. 已核实问题

### M2-04永久删除影响失真

当前预览和执行仅以Version、Candidate作为阻断项。SceneBeat会随章节级联删除；EntityState与KnowledgeState会在执行时触发外键拒绝；TimelineEvent会静默失去章节锚点。预览、执行和当前Schema不一致。

### M1-08物理损坏降级能力不足

项目数据库物理不可读时，活动上下文没有数据库Reader。恢复概览返回空Version列表，Version导出依赖原库查询，因此只能恢复外部Checkpoint，不能从Checkpoint浏览或导出Version。

### 历史Verified证据不能按现行规则重放

M0-01—M0-04缺标准Manifest；M0-06、M0-07缺人工验收和质量矩阵；M1-01—M1-07、M1-09缺截图Manifest。现行Evidence工作流只检查本PR变更的证据目录，无法发现历史Verified漂移。

## 2. 修复设计

### 2.1 永久删除引用模型

1. 影响预览显式列出当前章节引用：SceneBeat、EntityState起止引用、KnowledgeState起止引用、TimelineEvent章节锚点。
2. SceneBeat属于可确认的级联影响，进入影响数量和计划Hash。
3. EntityState、KnowledgeState属于权威连续性引用，阻断永久删除。
4. TimelineEvent虽由数据库执行`SET NULL`，但静默丢失章节锚点不可接受，按阻断项处理，作者必须先迁移或解除锚点。
5. 执行事务内重新计算同一影响模型，任何变化使计划失效；恢复点仍在执行前创建。
6. 章节和卷删除均覆盖；补充预览、竞态、回滚与每类外键语义测试。

### 2.2 物理损坏Checkpoint只读回退

1. 原数据库物理不可读时，按时间倒序读取外部Checkpoint元数据。
2. 每个候选必须通过文件名边界、普通文件、SHA-256、SQLite完整性、外键和项目身份校验。
3. 从最新可验证Checkpoint只读列出Version；导出指定Version时可向更旧的有效Checkpoint回退查找。
4. 导出仍写入用户选择目录，使用临时文件和原子改名；不修改损坏源库或Checkpoint。
5. UI明确标识Version来源为已验证Checkpoint，避免误认为来自损坏原库当前状态。
6. 补充损坏源库、损坏Checkpoint、篡改元数据、多个Checkpoint、导出和源文件不变测试。

### 2.3 历史证据迁移与永久治理

1. 只补齐已有验收事实，不伪造新截图或未执行命令。
2. 现有二进制截图保持原字节不变；新增截图Manifest引用其现有SHA-256。
3. M0-01—M0-04根据历史关闭提交、已有命令和结果建立标准Manifest。
4. M0-06、M0-07补人工验收与质量矩阵，Manifest重新计算。
5. M1-01—M1-07、M1-09补截图Manifest并重新计算根Manifest。
6. Evidence策略新增全量Verified扫描；PR继续扫描变更包，同时所有Verified任务必须可通过现行结构和最终语义规则。
7. 工作流增加定时与手动入口，定期检测历史证据漂移。

## 3. PR边界

机器边界由`audit-remediation-m0-m2.json`定义。业务文件必须属于M1-08或M2-04的固定文件清单；证据修改仅允许14个列出的任务目录；治理修改仅允许固定治理文件。`ACTIVE_TASK.json`、`ACTIVE_TASK.md`、`TASK_INDEX.md`不得变化。

## 4. 验证门

- Task Governance验证审计清单、基线、分支、活动任务不变及逐文件白名单。
- Evidence验证14个迁移包，并全量扫描所有Verified任务。
- Quality执行格式、Lint、类型、Unit、Integration、Migration、真实Electron E2E、Build和Package Smoke。
- Security与Performance保持永久门禁。
- 任一历史证据无法由已有事实闭环时，该任务不得伪造通过；必须在PR中显式降级状态或记录阻断。

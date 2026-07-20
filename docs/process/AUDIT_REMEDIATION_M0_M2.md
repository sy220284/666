# M0—M2审计修复计划与收尾记录

> 审计复核基线：`main@9db5bbf1460b11df0236c0104fca2acf720459ad`  
> 修复分支：`fix/governance-audit-m0-m2-remediation`  
> 当前活动任务：M3-06，必须与基线保持一致，不在本PR内推进或修改。

## 1. 已核实问题

### M2-04永久删除影响失真

原预览和执行只以Version、Candidate作为阻断项。M3引入SceneBeat、EntityState、KnowledgeState和TimelineEvent后，数据库会出现静默级联、执行期外键失败或章节锚点被清空，预览、执行和当前Schema不一致。

### M1-08物理损坏降级能力不足

项目数据库物理不可读时，活动上下文没有数据库Reader。原恢复概览返回空Version列表，Version导出依赖原库查询，因此只能恢复外部Checkpoint，不能从Checkpoint浏览或导出Version。

### 历史Verified证据不能按现行规则重放

M0-01—M0-04缺标准Manifest；M0-06、M0-07缺人工验收和质量矩阵；M1-01—M1-07、M1-09缺截图Manifest。现行Evidence工作流原先只检查本PR变更的证据目录，无法发现历史Verified漂移。全量扫描启用后另发现M2-03、M2-04的Manifest引用了未保留在主线祖先链中的PR Head。

## 2. 已实施方案

### 2.1 永久删除引用模型

1. 影响预览不再硬编码M3表名，而是读取SQLite外键元数据，动态发现所有指向`chapters`的当前及未来引用。
2. Draft内部引用由删除事务受控处理；Version、Candidate以及其他`CASCADE`、`RESTRICT`、`NO ACTION`、`SET NULL`和`SET DEFAULT`章节引用均明确阻断。
3. 阻断项返回`表名.字段名`、引用数量和`ON DELETE`动作，Renderer向用户显示真实影响来源。
4. `planHash`包含完整目标、影响和阻断集合；执行事务内重新扫描，预览后新增引用会使旧计划失效。
5. 集成测试覆盖动态新增外键、旧计划失效、章节/TrashEntry/Draft/正文不变；Electron E2E覆盖TimelineEvent章节锚点阻断、解除锚点后删除和恢复点生成。首次Ready运行还暴露了测试误用连续性目录返回值的问题，已改为从`timelineEvents`中取得真实eventId后再解除锚点。

### 2.2 物理损坏Checkpoint只读回退

1. 原数据库物理不可读时，按Checkpoint时间顺序读取外部备份元数据。
2. 每个候选必须通过路径边界、普通文件且非符号链接、文件大小、SHA-256、SQLite完整性、外键和项目身份校验。
3. 从可验证Checkpoint只读汇总Version；导出指定Version时可继续向其他有效Checkpoint回退查找。
4. 导出写入用户选择目录，使用临时文件和原子改名；不修改损坏源库或Checkpoint。
5. 集成测试覆盖Version浏览/导出、篡改Checkpoint拒绝和源文件字节不变；Electron E2E覆盖损坏前创建Version与Checkpoint、损坏后列表、导出正文和恢复副本。

### 2.3 历史证据迁移与永久治理

1. 只结构化已有验收事实，不伪造新截图或未执行命令；本地无显示环境仍记录为跳过，远程Electron成功单独保留。
2. M0-01—M0-04、M0-06、M0-07、M1-01—M1-07、M1-09共14个历史包已迁移并逐包通过现行Evidence规则。
3. 现有二进制截图保持原字节不变；新增截图Manifest引用实际SHA-256。
4. M2-03证据由未保留的PR Head改绑至PR #54的主线合并提交，不改变原验收结论和工件。
5. Evidence策略新增全量Verified扫描、失败汇总和完整诊断工件；PR、手动和每周定时运行均扫描全部Verified任务。
6. M1-08、M2-04在本次功能修复的完整Ready CI与Electron工件产生后重建证据，绑定本次不可变实现提交。
7. 收尾复核曾发现并行治理提交将Evidence降级为仅检查摘要、命令和风险三个文本文件，并在PR阶段跳过全量Verified扫描；现已恢复人工验收、质量矩阵、机器结果、截图清单、逐文件哈希和全部Verified包扫描，不接受降级证据门。
8. 主线复验和PR Quality保持Package Smoke；主线复验同时执行Security与Performance，不以`draft_mode`替代完整验证。
9. Testkit统一证据写入器同步生成`manual-acceptance.md`、`quality-matrix.md`、`test-results/results.json`、`screenshots/manifest.json`和逐文件Manifest，并支持原始截图二进制；生成器自身通过TypeScript和Unit自测。

## 3. PR边界

机器边界由`.github/audit-remediations/m0-m2-2026-07-20.json`定义。业务文件必须属于M1-08或M2-04固定清单；历史迁移只允许清单中的14个目录及M2-03来源修复；M1-08、M2-04仅允许重建本次修复证据；治理修改仅允许固定文件。`ACTIVE_TASK.json`、`ACTIVE_TASK.md`、`TASK_INDEX.md`保持不变。

## 4. 验证门

- Task Governance验证审计清单、基线、分支、活动任务不变及逐文件白名单。
- Evidence验证变更证据，并全量扫描所有Verified任务。
- Quality执行格式、Lint、类型、Unit、Integration、Migration、真实Electron E2E、Build和Package Smoke。
- Security、Performance与Repository Governance保持永久门禁。
- 任一证据无法由真实提交、命令、工件和验收结论闭环时，不得伪造通过或合并。

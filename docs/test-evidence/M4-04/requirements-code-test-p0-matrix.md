# M4-04 需求—代码—测试—P0矩阵

> 范围：`V1.0_TRACEABILITY_MATRIX.md`中由M4-04承接的28项`In Progress`需求。
>
> 规则：后台基础不等于用户闭环；完成纵向入口后才可标记Implemented，最终证据通过后才可标记Verified。

| 需求    | 用户路径与完成结果                | 复用基线与主要代码落点                             | 必测路由                         | P0       | 检查点 |
| ------- | --------------------------------- | -------------------------------------------------- | -------------------------------- | -------- | ------ |
| REQ-002 | 首页创建/打开/关闭并继续当前作品  | Home/AppShell；扩展ProjectContinuation             | Unit、Integration、E2E           | 009      | C1     |
| REQ-004 | 异常项目只读浏览、导出、恢复入口  | Workspace/Recovery；收口只读UI与降级               | Migration、Security、E2E         | 011      | C1、C7 |
| REQ-006 | Schema 21到最终Schema安全升级     | Migration Runtime；追加0022—0028                   | Migration、故障注入、性能        | 012      | C1—C7  |
| REQ-013 | Candidate采用、冲突与撤销完整体验 | CandidateApply；补Skeleton/partial/来源Guard       | Integration、Security、E2E、Perf | 030—032  | C4     |
| REQ-015 | 拆章、并章、跨章移动可视化预览    | StructureOperation；扩展Renderer预览               | Integration、E2E                 | 035      | C1     |
| REQ-017 | 人物与世界实体结构化作者表单      | EntityCanon；替换UUID/原始文本常规入口             | Unit、Security、E2E              | 036      | C1     |
| REQ-024 | 凭据只在安全存储和请求内存出现    | CredentialBroker；Generation IPC临时解析           | Security、日志扫描、E2E          | 067      | C2、C8 |
| REQ-026 | T0多Skeleton与T1三来源            | Prompt、Candidate、GenerationRuntime、Writing UI   | Unit、Integration、Eval、E2E     | 025—026  | C3     |
| REQ-027 | 快速与结构性改写                  | GenerationRuntime、SelectionAnchor、CandidateApply | Unit、Integration、E2E           | 027—028  | C4     |
| REQ-028 | 真实阶段、取消和partial裁决       | TaskProtocol兼容扩展、GenerationRun                | Integration、Security、E2E、Perf | 023—024  | C2、C4 |
| REQ-029 | 长章节候选Diff和完整审阅          | 现有Diff Worker、Candidate Review                  | Unit、Integration、E2E、Perf     | 029、032 | C4     |
| REQ-030 | ModelSupport与AI Eval追溯         | Prompt、GenerationRun、ModelSupportProfile、evals  | Unit、Eval、Integration          | 025—026  | C2、C8 |
| REQ-031 | 规则/统计/AI语义校验与待办        | Validation、StoryTodo、Comment、Checks UI          | Unit、Integration、Security、E2E | 043—044  | C5     |
| REQ-032 | Draft/Version/Entity全项目搜索    | SearchIndex挂入Utility/Main/Preload/Renderer       | Integration、Security、E2E、Perf | 046      | C6     |
| REQ-033 | ReplacePlan与项目词典             | SearchIndex、SafeReplace、Draft Patch、Recovery    | Unit、Integration、Security、E2E | 047      | C6     |
| REQ-034 | TXT/MD/DOCX预览导入               | CoordinatedImportExport；增加安全DOCX解析          | Integration、Security、E2E       | 048—049  | C7     |
| REQ-035 | 指定Version多格式导出             | Version、ImportExport；增加DOCX原子输出            | Integration、Security、E2E       | 050      | C7     |
| REQ-036 | 日常/重大/命名三轨备份            | RecoveryService兼容扩展、Backup Policy UI          | Migration、Integration、E2E      | 051—054  | C7     |
| REQ-037 | 恢复到新副本且源项目不变          | RecoveryService现有恢复链扩展                      | Integration、Security、E2E       | 055      | C7     |
| REQ-038 | 新手/专业模式与三条创作路径       | AppSettings、AppShell、Onboarding                  | Unit、E2E、人工验收              | 057—059  | C1、C8 |
| REQ-039 | 统一写作工作台与沉浸视图          | WritingWorkbench、AppShell、UI Store               | Unit、E2E、响应式                | 060      | C1、C8 |
| REQ-040 | 状态仲裁、返回位置和上下文帮助    | StatusArbitrator、UI Store、AppShell               | Unit、E2E、无障碍                | 061—062  | C2、C8 |
| REQ-041 | 1280×800、2K、21:9、混合DPI       | Layout Model、CSS Tokens、Window Preferences       | E2E、Perf、人工多屏              | 063—066  | C8     |
| REQ-042 | 普通日志和诊断包隐私              | PrivacyLogger、诊断导出、扫描脚本                  | Security、E2E                    | 068—069  | C2—C8  |
| REQ-043 | 仅用户主动Provider请求出网        | Endpoint Policy、Provider Adapter、Generation IPC  | Security、网络审计               | 070      | C2、C8 |
| REQ-045 | 弧光确认与一致性校验              | CharacterArc、StateProposal、Validation            | Integration、E2E、Eval           | 071—072  | C5     |
| REQ-046 | 网文节奏、钩子与黄金三章          | Rhythm、WritingMetrics、Checks UI                  | Unit、Integration、E2E、Perf     | 073—074  | C6     |
| REQ-047 | Theme A/B完整切换                 | AppSettings、Design Token、Renderer                | Unit、E2E、截图/人工             | 075      | C8     |

## 已Verified能力的回归责任

| 范围       | M4-04回归重点                                           |
| ---------- | ------------------------------------------------------- |
| P0-001—005 | Monorepo、Renderer隔离、Preload白名单、CSP、Core监管    |
| P0-006—020 | SQLite、项目边界、编辑、Lock、Revision、Patch、Version  |
| P0-021—022 | Candidate隔离、Provider连接及流式适配                   |
| P0-033—042 | 规划、SceneBeat、Canon、连续性、StateProposal和旧章返修 |
| P0-045     | 当前章查找替换继续走编辑器轻量路径                      |
| P0-056     | 回收站与永久删除                                        |

## 状态更新规则

1. 合同、Migration或后台服务单独完成时，需求保持`In Progress`。
2. Renderer正式入口可达、纵向测试通过后，可将对应需求标记`Implemented`。
3. 对应P0、人工检查和最终Evidence全部通过后，才可标记`Verified`。
4. 任一数据安全、不可变Version、AI零权威写入或恢复硬门失败，相关需求不得进入Implemented。

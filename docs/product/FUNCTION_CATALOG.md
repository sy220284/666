# WorldForge 功能清单与实现关系

> 状态：Frozen  
> 基线：WorldForge V6.5  
> 用途：功能ID、设计语义和版本归属的唯一真源。

## 1. 功能关系总图

```text
项目与工作空间
├─ 规划：任务书 → 大纲 → 章节 → SceneBeat
├─ 设定：实体 → Canon → 动态状态 → 时间线/知情/伏笔/人物弧光
├─ 正文：Draft → Block Patch → Version
├─ AI：FTS/约束包 → GenerationRun → Candidate → 比较/采用
├─ 质量：校验 → StoryTodo/Comment → 搜索/替换 → 节奏建议
└─ 交付：导入/导出 → 回收站 → 备份/恢复
```

统一规则：

1. `project.sqlite`是项目权威数据源。
2. AI输出先形成Candidate或StateProposal。
3. Draft定稿形成不可变Version。
4. 搜索、FTS、统计和建议均为派生能力。
5. P1/V1.5功能不得提前建设无消费方的数据表和调度器。

## 2. 应用与项目

| ID | 功能 | 设计与效果 | 主要关系 | 版本 |
|---|---|---|---|---|
| APP-001 | 应用启动与Core监管 | Main创建安全窗口并监管Core；失败可诊断和重启 | IPC、安全、日志 | V1.0 P0 |
| APP-002 | 最近项目与应用设置 | `app.sqlite`保存路径、时间和偏好，不保存正文 | 项目打开、设置 | V1.0 P0 |
| PRJ-001 | 新建项目 | 快速开始、完整流程、导入和空白入口 | 初始化卷章与Draft | V1.0 P0 |
| PRJ-002 | 打开/关闭项目 | 每次只激活一个项目上下文 | 自动保存、路径边界 | V1.0 P0 |
| PRJ-003 | 移动项目 | 关闭、复制、校验后更新路径 | 最近项目、备份 | V1.0 P0 |
| PRJ-004 | 异常只读打开 | 完整性或版本异常时停止写入 | 导出、恢复 | V1.0 P0 |

## 3. 规划与结构

| ID | 功能 | 设计与效果 | 主要关系 | 版本 |
|---|---|---|---|---|
| PLN-001 | ProjectBrief | 保存高概念、阅读承诺、主角目标、冲突和必须/禁止项 | 约束包、新手向导 | V1.0 P0 |
| PLN-002 | 大纲树 | PlotNode表示卷、剧情弧和章节规划 | 章节、SceneBeat | V1.0 P0 |
| PLN-003 | 卷章管理 | 标题、排序、状态、目标字数、活动Draft和定稿Version | 编辑、导出、回收站 | V1.0 P0 |
| PLN-004 | SceneBeat | 目标、冲突、结果、人物、地点、必选和字数比例 | T0、节拍校验 | V1.0 P0 |
| PLN-005 | 拆章/并章 | 预检查、恢复点、事务迁移正文和关系 | 锁定、Revision、连续性 | V1.0 P0 |
| PLN-006 | 跨章移动 | 规划移动与正文移动分离，先预览影响 | SceneBeat、DraftBlock | V1.0 P0 |

## 4. 设定、状态与连续性

| ID | 功能 | 设计与效果 | 主要关系 | 版本 |
|---|---|---|---|---|
| CAN-001 | 通用实体 | 人物、地点、势力、道具、能力、规则、事件和自定义实体 | 全部连续性能力 | V1.0 P0 |
| CAN-002 | 静态Canon | 作者确认的稳定事实，AI无直接写接口 | 约束包、校验 | V1.0 P0 |
| STA-001 | EntityState | 当前值、历史值、生效范围和证据 | 状态提案、快照 | V1.0 P0 |
| TIM-001 | 时间线 | 起止、精度、人物、地点和依赖 | 状态、弧光、校验 | V1.0 P0 |
| KNO-001 | 知情信息 | 知道、相信、怀疑、误解和未知 | 对话、悬疑、校验 | V1.0 P0 |
| FSH-001 | 伏笔 | planned/planted/reinforced/partially_revealed/revealed/cancelled | SceneBeat、约束包 | V1.0 P0 |
| SNP-001 | EndingSnapshot | 定稿后保存下一章所需连续性入口 | 约束包、返修失效 | V1.0 P0 |
| STA-002 | StateProposal | `entity_state`或`arc_milestone`提案，作者确认后写入 | 定稿、快照 | V1.0 P0 |
| ARC-001 | 人物弧光定义 | 成长、黑化、觉醒、堕落、救赎和自定义弧光 | EntityState、时间线 | V1.0 P0 |
| ARC-002 | 弧光里程碑 | `planned/hit/skipped`，命中经StateProposal确认 | ADR-006 | V1.0 P0 |
| ARC-003 | 弧光一致性校验 | 检查行为/性格状态与已确认弧光阶段冲突 | VAL-003 | V1.0 P0 |
| ARC-004 | 弧光时间线关联 | 里程碑依赖TimelineEvent或其他里程碑 | 时间线校验 | V1.0 P0 |

## 5. 正文、版本与锁定

| ID | 功能 | 设计与效果 | 主要关系 | 版本 |
|---|---|---|---|---|
| EDT-001 | 块级正文 | Tiptap节点映射DraftBlock，`logicalBlockId`稳定 | Candidate、Version | V1.0 P0 |
| EDT-002 | 自动保存 | 800ms空闲提交，保存状态以Core事务为准 | Revision、字数 | V1.0 P0 |
| EDT-003 | 中文IME安全 | composition期间不提交破坏性Patch | 自动保存、撤销 | V1.0 P0 |
| EDT-004 | 粘贴清理 | 清除网页脚本、字体、颜色和布局污染 | 编辑器 | V1.0 P0 |
| EDT-005 | 锁定块 | UI与Core双层保护 | Patch、AI、替换、结构操作 | V1.0 P0 |
| EDT-006 | 撤销重做 | 编辑器Undo与持久化ApplyRecord/Checkpoint | Candidate采用 | V1.0 P0 |
| VER-001 | 不可变Version | 历史记录无业务UPDATE；恢复生成新Draft | 定稿、导出 | V1.0 P0 |
| VER-002 | Revision与Hash冲突 | 旧基线不静默覆盖，进入冲突处理 | Patch、Candidate | V1.0 P0 |

## 6. AI接入、检索与生成

| ID | 功能 | 设计与效果 | 主要关系 | 版本 |
|---|---|---|---|---|
| AI-001 | Provider配置 | 协议、地址、模型和credentialRef | Credential Store | V1.0 P0 |
| AI-002 | 连接测试 | 验证可达、认证、流式和结构化能力 | ModelSupportProfile | V1.0 P0 |
| AI-003 | 约束包 | P0—P4、时序过滤、来源追溯和Token裁剪 | FTS、快照、状态 | V1.0 P0 |
| AI-004 | T0骨架 | 多个结构化场景方案，可绕过 | SceneBeat、Candidate | V1.0 P0 |
| AI-005 | T1扩写 | 纯文本流或稳定结构化输出，保存Candidate | 候选审阅 | V1.0 P0 |
| AI-006 | 快速改写 | 单段内联预览，应用后可撤销 | 局部Candidate | V1.0 P0 |
| AI-007 | 结构性改写 | 跨段/场景/整章进入完整Candidate流程 | Diff、冲突 | V1.0 P0 |
| AI-008 | 多候选融合 | 按SceneBeat来源生成新merge Candidate | BeatSourceMapping | V1.0 P0 |
| AI-009 | 运行状态 | 真实阶段、流式、取消、失败和partial | Event Protocol | V1.0 P0 |
| AI-010 | 模型支持档案 | 绑定Provider、Model、Task和PromptVersion | Eval | V1.0 P0 |

## 7. Candidate审阅与采用

| ID | 功能 | 设计与效果 | 主要关系 | 版本 |
|---|---|---|---|---|
| CND-001 | 候选列表 | 按任务、时间、状态和基础Revision展示 | GenerationRun | V1.0 P0 |
| CND-002 | 候选比较 | 双栏、上下、单稿、只看差异 | 中文Diff | V1.0 P0 |
| CND-003 | 局部采用 | 整稿、块级和SceneBeat级选择 | Block Patch | V1.0 P0 |
| CND-004 | 冲突处理 | 当前稿、候选、来源和选择结果清楚 | ConflictSet | V1.0 P0 |
| CND-005 | partial Candidate | 中断结果明确标记，不能直接定稿 | 取消、恢复 | V1.0 P0 |

## 8. 校验、修订、搜索与节奏

| ID | 功能 | 设计与效果 | 主要关系 | 版本 |
|---|---|---|---|---|
| VAL-001 | 确定性校验 | 相同输入结果一致，可作为发布阻断 | 时间线、引用、锁定 | V1.0 P0 |
| VAL-002 | 统计校验 | 字数、句段长度、对话比例和重复符号 | StyleProfile、节奏 | V1.0 P0 |
| VAL-003 | AI语义校验 | 有证据的风险提示，可忽略/静音/误报 | 人物、设定、弧光 | V1.0 P0 |
| REV-001 | StoryTodo/Comment | 问题转待办，完成后可重跑来源校验 | ValidationIssue | V1.0 P0 |
| SRC-001 | 当前章查找 | 普通编辑器式查找与安全替换 | Tiptap | V1.0 P0 |
| SRC-002 | 全项目搜索 | FTS5搜索Draft、Version和Entity | 约束包共用 | V1.0 P0 |
| SRC-003 | 安全批量替换 | ReplacePlan、锁定检查、恢复点和事务 | Patch、FTS | V1.0 P0 |
| RHY-001 | 爽点密度 | 可编辑品类区间，P3建议级 | VAL-002 | V1.0 P0 |
| RHY-002 | 章末钩子 | 规则+语义风险提示，P3建议级 | VAL-003 | V1.0 P0 |
| RHY-003 | 更新节奏 | 目标字数与实际写作速度对比 | Draft统计 | V1.0 P0 |
| RHY-004 | 黄金三章 | 仅前3章生效，可关闭 | RHY-001 | V1.0 P0 |

## 9. 导入、导出、备份与恢复

| ID | 功能 | 设计与效果 | 主要关系 | 版本 |
|---|---|---|---|---|
| IMP-001 | TXT/Markdown导入 | 编码检测、分章预览和单事务提交 | 恢复点 | V1.0 P0 |
| IMP-002 | DOCX导入 | 隔离解析、限制解包和忽略外部对象 | 安全、临时目录 | V1.0 P0 |
| EXP-001 | 多格式导出 | 从指定Version原子导出TXT/Markdown/DOCX | Version | V1.0 P0 |
| BAK-001 | 日常滚动备份 | Online Backup、完整性检查和Hash | 保留策略 | V1.0 P0 |
| BAK-002 | 重大恢复点 | Migration、导入、替换和结构操作前创建 | 高风险Use Case | V1.0 P0 |
| BAK-003 | 手动命名快照 | 作者主动保存长期节点 | 恢复中心 | V1.0 P0 |
| RCV-001 | 恢复副本 | 恢复到新目录，原项目不覆盖 | 项目注册 | V1.0 P0 |
| TRS-001 | 回收站 | 软删除、原位置恢复和永久删除影响预览 | 卷章场景 | V1.0 P0 |

## 10. UI、主题与显示

| ID | 功能 | 设计与效果 | 主要关系 | 版本 |
|---|---|---|---|---|
| UI-001 | 新手/专业模式 | 共用数据和命令，只改变披露程度 | 向导、帮助 | V1.0 P0 |
| UI-002 | 统一工作台 | 规划、写作、设定、检查和交付 | 全部业务 | V1.0 P0 |
| UI-003 | 沉浸写作 | 仅隐藏非写作区域，不创建第三套产品 | 编辑器 | V1.0 P0 |
| UI-004 | 状态仲裁 | P0安全、P1进行中、P2待决策、P3信息 | 首页、状态栏 | V1.0 P0 |
| UI-005 | 上下文帮助 | 悬停、首次提示和页面帮助 | HelpRegistry | V1.0 P0 |
| UI-006 | 排版与Theme A | 浅色、深色、护眼和高对比 | Design Token | V1.0 P0 |
| UI-007 | 响应式与DPI | 1280×800、2K、21:9和混合DPI | 窗口恢复 | V1.0 P0 |
| THM-001 | Theme B水墨印章 | 浅色、深色和成功后印章表现层 | ADR-007 | V1.0 P0 |

## 11. P1与V1.5

| ID | 功能 | 版本 |
|---|---|---|
| P1-KEY | 自定义快捷键 | V1.0 P1 |
| P1-TYPE | 打字机模式 | V1.0 P1 |
| P1-CONFLICT | 高级三栏冲突视图 | V1.0 P1 |
| P1-RESEARCH | 研究笔记与本地附件 | V1.0 P1 |
| MEM-001 | L0—L5自动记忆 | V1.5 |
| MEM-002 | 热温冷数据迁移 | V1.5 |
| MEM-003 | 卷级连续性检查点 | V1.5 |
| DIA-001 | AI项目日记 | V1.5 |
| DIA-002 | 定时日记 | V1.5 |
| SEM-001 | 语义检索 | V1.5，需真实证据触发 |

## 12. 共性要求

每个功能必须明确：

1. 正常、失败、取消、冲突、只读和恢复路径。
2. 输入输出Schema、项目和权限边界。
3. 是否修改权威数据及其事务、Revision和恢复点。
4. 锁定、Hash和不可变Version约束。
5. 最小可操作UI与空、加载、成功和失败状态。
6. 单元、Repository、集成、E2E、安全、性能或AI Eval证据。

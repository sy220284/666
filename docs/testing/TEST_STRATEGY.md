# WorldForge V1.0 测试策略

> 状态：Frozen  
> 目标：证明功能真实可用、数据边界未破坏，并为每个完成结论提供可复核证据。

## 1. 原则

1. 代码硬保证与模型质量分开验收。
2. 高风险功能先写失败测试或稳定复现。
3. 业务写入覆盖成功、失败、取消、冲突、只读和恢复。
4. 数据库、IPC和UI不能只用Mock互相证明；核心闭环真实联通。
5. Fixture不得包含用户私人作品。
6. 未运行的测试不能写成通过。

## 2. 测试层级

| 层级 | 工具 | 覆盖 |
|---|---|---|
| 单元 | Vitest | 领域不变量、Patch、锁定、Diff、裁剪、状态提案和错误映射 |
| Repository | Vitest + 临时SQLite | Schema、SQL、索引、事务、外键、并发和项目归属 |
| 集成 | Vitest | 契约→Preload→Core Use Case→SQLite/Provider Stub |
| Migration | Vitest + Schema Fixture | 新库、旧库、中断、checksum、回填和兼容 |
| 安全 | Vitest/Playwright | Electron隔离、IPC白名单、路径、日志和导入限制 |
| 桌面E2E | Playwright Electron | 基础写作、AI、连续性、交付和恢复 |
| 性能 | 基准 + Playwright | 键入、保存、IPC、Diff、FTS、项目打开和显示 |
| AI Eval | 固定Fixture | T0/T1、改写、融合、状态/弧光提取和语义校验 |
| 人工验收 | 任务脚本 | 视觉、IME、DPI、系统对话框和真实Provider |

## 3. 必须保持为0

- 锁定块被修改。
- 未确认Candidate写入Draft。
- Revision或Hash冲突静默覆盖。
- AI直接修改Canon、EntityState或ArcMilestone。
- 跨项目读写。
- 凭据进入普通日志或数据库。
- 恢复覆盖原项目。

## 4. 单元重点

### Domain与Editor Core

- UUID、整数order_key和局部重排。
- Draft活动唯一约束与归档。
- logicalBlockId拆分、合并、移动和恢复。
- Patch、expectedHash、锁定和Revision。
- 中文IME、粘贴、字数和当前章查找。
- 不可变Version。

### 连续性

- EntityState有效期和历史状态。
- StateProposal双类型判别与目标互斥。
- pending提案不修改权威状态。
- ArcMilestone状态机和时间线依赖。
- EndingSnapshot有效、stale和缺失回退。

### AI与解析

- Prompt注册和整数版本。
- T0/T1/rewrite/merge Schema。
- entity_state与arc_milestone提案Schema。
- Cleaner正反例。
- 无效输出明确失败，不无限猜测。

## 5. 数据库与集成

每个写Use Case测试：

1. 正常提交。
2. strict Schema拒绝额外字段。
3. 目标不存在或已处理。
4. 项目ID不匹配。
5. Revision或Hash冲突。
6. 锁定冲突。
7. 事务中途故障注入。
8. 重复requestId。
9. 关闭重启后状态一致。
10. 只读项目拒绝写入。

自动保存与AI并行至少100轮，不能把`SQLITE_BUSY`直接暴露给用户。

## 6. Migration

- 空库升级到最新。
- 每个支持旧版本逐级升级。
- 中断后重启。
- checksum不一致。
- 高版本只读。
- 大型回填恢复。
- 外文件迁移`migration_journal`继续与回滚。
- 升级后`foreign_key_check`、`quick_check`和核心查询。
- FTS和派生索引重建。

## 7. E2E核心场景

### E2E-01 M1基础写作门

新建项目→首卷章→中文输入→粘贴清理→自动保存→字数/查找→手动Version→TXT/Markdown导出→关闭重开→恢复副本。

该场景不配置AI，也不依赖M2锁定功能。

### E2E-02 编辑安全

打开项目→锁定段落→普通编辑→拆并章预检查→Version恢复为新Draft→锁定与Revision保持正确。

### E2E-03 AI候选

配置Stub→T0→选骨架→T1→切章→返回→比较→局部采用→撤销→重新采用→定稿。

### E2E-04 Revision冲突

生成期间修改同一段→候选完成→采用→显示ConflictSet→作者选择→无静默覆盖。

### E2E-05 连续性与弧光

创建人物、状态、弧光和里程碑→定稿→生成entity_state与arc_milestone提案→pending不改变状态→接受→下一章约束包包含确认状态→返修前章→快照与校验标记stale。

### E2E-06 校验与节奏

运行确定性/统计/语义校验→转StoryTodo→完成后重跑→设置GenreRhythmProfile→关闭节奏建议→黄金三章只对前3章生效。

### E2E-07 导入导出

TXT/DOCX预览→调整分章→提交→定稿→从指定Version导出→内容一致。

### E2E-08 备份恢复

创建日常、操作和手动快照→修改正文→恢复到新目录→原项目不变→副本通过检查。

### E2E-09 主题与显示

Theme A/B切换→候选采用→定稿→减少动态→1280×800/2K/21:9/混合DPI→业务结果、选区和未保存文本不变。

## 8. 安全测试

- Renderer无法访问Node、文件、数据库和环境变量。
- 未注册IPC、额外字段和跨项目实体ID被拒绝。
- `../`、绝对路径和符号链接逃逸被拒绝。
- 外链只由系统浏览器打开。
- DOCX异常压缩比、过多文件、宏和外部资源安全处理。
- 日志与诊断包扫描正文、Prompt和凭据样本。
- Provider重定向与非HTTPS外部端点提示正确。

## 9. 性能基线

| 指标 | 目标 |
|---|---:|
| 2K键入P95 | ≤50ms |
| 自动保存事务P95 | ≤150ms |
| 编辑IPC P95 | ≤200ms |
| AI取消反馈 | ≤500ms |
| 5000字Diff首屏 | ≤500ms |
| 5000字完整Diff | ≤1.2s |
| 正文滚动 | ≥50fps |
| Core事件循环阻塞 | <100ms |

报告记录机器、系统、缩放、数据规模和样本数。

## 10. 显示矩阵

- 1280×800 100%。
- 2560×1440 100/125/150%。
- 3440×1440和3840×1600。
- 混合DPI双显示器。
- 1024×640有效视口降级检查。

覆盖正文、侧栏、弹层、候选、弧光、节奏、焦点和无横向整页滚动。

## 11. AI Eval覆盖

- T0骨架差异、因果和必选Beat。
- T1事件覆盖、连续性和专名。
- 快速改写保真与结构性改写升级。
- 多候选融合来源、重复和过渡。
- EntityState提案Precision。
- ArcMilestone提案Precision和未确认写入率0。
- 弧光一致性校验证据。
- 节奏提示范围、关闭行为和P3等级。
- 知情泄露和中文模型废话。

## 12. 证据目录

```text
docs/test-evidence/<TASK-ID>/
├─ summary.md
├─ commands.txt
├─ test-results/
├─ screenshots/
├─ performance.json
└─ known-risks.md
```

## 13. 完成规则

完成报告必须列出真实命令、退出状态、结果、人工步骤和限制。只有脚手架、Mock或测试文件时，结论必须是未完成或部分完成。

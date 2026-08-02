# AR-06 Planning拆分验证与回退记录

## 1. 检查点

- 任务：M9-03 / AR-06
- PR：#273
- 基线main：`7adafeeadb973e5cb035c301602c511c2aa065c5`
- 前置检查点：AR-05受检Head `4f109cdbd57b2e0c3576f142d19778a120c74011`
- AR-06受检实现Head：`99f124369054ab20dcf919ec89aacfd41f592152`
- Quality Run：`30699087792`
- 结果：AR-06实现与完整Draft质量矩阵通过。

## 2. 结构结果

完整规划原组合根同时承载ProjectBrief、大纲树、大纲节点编辑、场景节拍、正文块转换、跨章移动和规划上下文。AR-06完成后：

```text
planning-mode-workbench.tsx
├─ brief/beginner-planning-questions.tsx
└─ professional-planning-workbench.tsx
   ├─ brief/project-brief-editor.tsx
   ├─ outline/plot-tree.tsx
   ├─ outline/plot-node-dialog.tsx
   ├─ scenes/scene-beat-panel.tsx
   ├─ scenes/scene-beat-dialog.tsx
   ├─ planning-context-panel.tsx
   └─ ../structure/structure-navigator.tsx（继续复用AR-02 Shared Structure）
```

共享表单值、状态标签与排序逻辑迁入`planning-form-values.ts`，内联错误边界迁入`planning-inline-error.tsx`。模式入口与专业规划根只负责模式切换、资源装配、布局和Panel组合。

## 3. 行为与权威边界

- 简明规划与完整规划继续读取和更新同一份ProjectBrief。
- 简明规划只覆盖四项核心字段，并保留已有结局意图、必须出现和禁止事项。
- 卷章导航继续复用AR-02 Shared Structure，没有复制第二套Structure控制器。
- 大纲节点移动继续调用单次`movePlotNode`命令；移动规划不修改正文。
- 场景节拍同章移动继续使用`moveSceneBeat`。
- 跨章移动继续先执行`previewMoveSceneBeat`，作者确认后携带`planHash`调用`moveSceneBeatAcrossChapters`。
- 跨章移动仍明确提示正文块不会自动移动；正文块迁移需要单独预览与确认。
- 场景节拍正文块引用继续通过`setSceneBeatBlockLinks`显式写入。
- 正文块转换继续使用原子命令`convertBlocksToSceneBeat`。
- 人物、地点选择器、中文文案、`data-*`测试标记和关闭/模式切换入口保持兼容。
- 数据库Schema、历史Migration、IPC Channel、协议版本、错误码和公开Bridge方法均未修改。

## 4. 自动验证

受检Head `99f124369054ab20dcf919ec89aacfd41f592152`：

```text
Evidence             PASS
Task Governance      PASS
PR Policy            PASS
Security             PASS
Performance          PASS
Format               PASS
Lint                 PASS
Typecheck            PASS
Unit                 PASS
Integration          PASS
Migration            PASS
Coverage             PASS
Build                PASS
Electron E2E         PASS
Quality aggregate    PASS
```

Coverage：

```text
测试文件     225 / 225通过
测试数量     1001 / 1001通过
Statements   85.08%
Branches     75.19%
Functions    84.79%
Lines        86.90%
```

新增`ar06-planning-boundaries.test.ts`验证：

- 模式入口与专业规划根只保留组合职责；
- 简明与完整模式写入同一ProjectBrief；
- 简明模式不覆盖未显示的任务书字段；
- 大纲与场景节拍移动保持原子命令；
- 跨章移动继续受Preview、作者确认和`planHash`保护；
- 规划移动和正文移动边界继续显式分离。

本次Draft路由未执行Windows原生拼音Job。AR-06未修改Writing Editor、输入法处理或草稿会话；相关Windows验收仍由已合并AR-04检查点和最终Ready全矩阵承担。

## 5. 回退

AR-06未改变持久化格式、协议或公开Bridge，可按文件边界回退：

1. 将`planning-mode-workbench.tsx`与`professional-planning-workbench.tsx`恢复到AR-05检查点；
2. 删除AR-06新增的`brief/`、`outline/`、`scenes/`模块及规划共享模块；
3. 删除AR-06结构不变量测试；
4. 重新运行Static、Unit、Integration、Coverage、Build和Electron E2E。

若发现P0行为回归，应整体回退AR-06检查点，不在AR-07或更后工作包中追补Planning缺陷。

## 6. 结论

AR-06满足冻结工作包要求，可以将M9-03活动检查点切换至AR-07。PR #273继续保持Draft；AR-05—AR-14全部完成前不得转Ready或合并。

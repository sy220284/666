# AR-05 Canon拆分验证与回退记录

## 1. 检查点

- 任务：M9-03 / AR-05
- PR：#273
- 基线main：`7adafeeadb973e5cb035c301602c511c2aa065c5`
- 受检实现Head：`4f109cdbd57b2e0c3576f142d19778a120c74011`
- Quality Run：`30697997469`
- 结果：AR-05实现与完整Draft质量矩阵通过。

## 2. 结构结果

原`canon-core-workbench.tsx`同时承载Entity Canon、Continuity、Narrative Planning、State Proposal及共享展示和表单工具，约1700行。AR-05完成后：

```text
canon-core-workbench.tsx
├─ 只保留工作台标题、四分区导航和Panel装配
├─ entity-canon-panel.tsx
├─ continuity-panel.tsx
│  ├─ continuity-results.tsx
│  └─ continuity-editors.tsx
├─ narrative-planning-panel.tsx
│  ├─ narrative-planning-results.tsx
│  └─ narrative-planning-editors.tsx
├─ state-proposal-panel.tsx
└─ canon-panel-shared.tsx
```

四个业务Panel分别拥有自身Bridge查询、命令和局部状态；Continuity与Narrative Planning继续按读取展示和写入编辑职责拆分。共享Ledger展示、换行值和可空字符串解析迁入共享模块。外层组合根不再持有业务查询和业务状态。

## 3. 行为与安全不变量

- Entity Canon的创建、编辑、事实确认、归档和永久删除行为保持不变。
- 永久删除仍要求实体先归档、引用预览允许删除并精确输入实体名称。
- Continuity的动态状态、时间线、知情状态写入和失效行为保持不变。
- 时间线参与者、见证者、主体、依赖和Evidence契约未改变。
- Narrative Planning的伏笔状态迁移、人物弧、里程碑命中和跳过行为保持不变。
- State Proposal仍由作者执行接受、编辑后接受或拒绝；等待处理提案不得修改权威状态。
- 状态提取、章节尾快照、Provider选择和Generation轮询语义未改变。
- 公开Bridge方法、IPC Channel、协议版本、数据库Schema、Migration和错误码均未修改。
- 原有中文文案、`data-*`测试标记、选中实体定位和四分区导航保持兼容。

## 4. 测试结果

受检Head `4f109cdbd57b2e0c3576f142d19778a120c74011`：

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
测试文件     224 / 224通过
测试数量     998 / 998通过
Statements   85.14%
Branches     75.28%
Functions    85.02%
Lines        86.96%
```

结构不变量测试已更新，验证：

- Canon组合根只装配四个独立Panel；
- 组合根不再使用`useState`和`useBridgeQuery`；
- 四Panel均存在独立导出和直接测试入口；
- 永久删除、时间线关系字段、伏笔关系字段、取消状态和Candidate安全边界继续存在。

## 5. 回退

AR-05未修改持久化格式、协议或公开Bridge，可按文件边界回退：

1. 将`canon-core-workbench.tsx`恢复为基线main `7adafeeadb973e5cb035c301602c511c2aa065c5`版本；
2. 删除AR-05新增的九个Canon拆分模块；
3. 恢复两处Renderer结构不变量测试；
4. 重新运行Static、Unit、Integration、Coverage、Build和Electron E2E。

若发现P0行为回归，应整体回退AR-05检查点，不在AR-06或更后工作包中追补Canon缺陷。

## 6. 结论

AR-05满足冻结工作包要求，可以将M9-03活动检查点切换至AR-06。PR #273继续保持Draft；AR-05—AR-14全部完成前不得转Ready或合并。

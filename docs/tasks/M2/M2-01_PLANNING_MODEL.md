# M2-01 任务书、大纲、章节与SceneBeat

> 状态：Planned  
> 优先级：P0  
> 分支：`feat/m2-planning-model`

## 目标

建立不强迫流程、但能支持长篇结构和AI约束的规划模型。

## 依赖

M1全部完成。

## 关联

- 需求：REQ-014、REQ-016
- 验收：P0-033、P0-034

## 必读文档

- `docs/product/FUNCTION_CATALOG.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/ui/SCREEN_SPECIFICATIONS.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`

## 实施内容

1. ProjectBrief最小字段。
2. Volume、Chapter、PlotNode、SceneBeat及关联表。
3. orderKey排序与事务性移动。
4. 新手问题式入口和专业完整字段共用同一数据。
5. 规划与正文单向安全关联：改大纲不自动改Draft。
6. 删除场景卡不删除正文。
7. 正文片段可选择关联或转换为SceneBeat。

## 测试

空白项目、跳过任务书、树节点移动、场景排序、删除恢复、正文关联和规划变化后正文不变。

## 完成条件

规划数据可独立维护并被后续约束包读取；任何规划操作不会静默重写正文。

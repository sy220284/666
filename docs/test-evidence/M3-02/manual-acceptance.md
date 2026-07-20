# M3-02人工验收记录

状态：**通过**。

最终实现提交：`0239e87aca9a31bcfc81008d326af2a9fa16b889`。  
验证Head：`ac4cf1a30e61ba880b5160e50ca8d3118078aa50`。

验收方式：真实Electron自动验收、日志复核与桌面截图复核。

1. 创建本地项目、人物“林照夜”和地点“旧档案馆”。
2. 打开作品规划与SceneBeat新建弹窗。
3. Playwright确认人物和地点字段显示实体名称多选器，旧UUID文本输入不可见。
4. 选择人物和地点后保存SceneBeat，Core返回对应`characterIds`与`locationIds`。
5. 删除SceneBeat后，原Draft内容、Revision和正文块保持不变。
6. Integration确认不存在、跨项目、类型错误和新增归档实体引用均被拒绝。
7. 已关联实体归档后，无关SceneBeat编辑成功，引用仍阻止永久删除。
8. Migration确认旧JSON回填关系表、关系表回写兼容投影、升级原子性和故障回滚。
9. 桌面套件日志：`test-results/desktop-e2e.log`，明确记录19项全部通过及`scene-beat.spec.ts`执行。
10. 原始PNG截图以Base64无损归档：`screenshots/m3-02-scene-beat-entity-selector.png.base64`；解码后的SHA-256记录在截图清单中。

结论：SceneBeat实体关联不存在可绕过的第二权威写入路径，桌面操作、Core返回值与数据库约束一致。

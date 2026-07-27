# M4-04 Known Risks

1. 单一任务吸收20张原任务，必须依靠内部检查点和原子提交控制跨层断裂。
2. GenerationRun、结构化Candidate、StateProposalBatch及Schema 28复合锚点硬化使用连续Migration，后续扩展必须继续只追加。
3. `ModelSupportProfile`存在`untested/unverified`历史命名冲突，必须兼容读取后统一新写入。
4. 长期Draft PR会持续变化，最终Evidence必须重新绑定Ready前最终Head。
5. DOCX、超大项目、混合DPI和跨平台安装验收需要真实环境与可复现工件。
6. C1继续写作读取已同时校验Revision与块Hash；Renderer仅切换面板时，若偏好保存失败，同一面板状态不会自动重复提交。该问题不影响正文、Draft Revision或数据安全，纳入C8工作台状态协调。
7. 当前PR保持Draft，永久Quality工作流只执行静态门；当前Head的Unit、Integration、Migration、Security、Coverage、Build、Performance/Eval、Electron E2E与Package Smoke尚未由Ready路由执行，不能把历史阶段结果冒充为当前Head的新结论。
8. Schema 28已增加Migration与集成回归，但必须在转Ready前验证空库、支持的历史Schema升级、外键、触发器INSERT/UPDATE路径及完整回归。
9. C8尚未完成，追踪矩阵中的M4-04需求继续保持`In Progress`。
10. 真实Electron Candidate工作台仍需由C8 Electron E2E与人工UI矩阵复核。
11. 结构化输出中断后不再保存未解析JSON正文；纯文本partial继续承担可读部分结果。最终模型档案需要在C8真实Provider Eval复核。
12. Skeleton来源失效判断当前采取保守策略：章节内任一SceneBeat变化可能使该章Skeleton进入`stale`确认。该行为阻止自动继续，不造成越权写入，交互精度纳入C8。
13. C5已覆盖Provider Runtime接线、原子持久化和证据边界，但当前证据不保存真实第三方账号；限流、账号权限和模型输出差异仍需在C8发布环境复核。
14. C6安全替换已覆盖Core权威预览、计划过期、锁定跳过、事务与恢复点；超大项目的搜索和批量替换规模上限仍需在C8真实数据性能报告中复核。
15. 当前写作会话以Draft Patch为权威输入，首次按键计一秒有效时间；操作系统级休眠、窗口焦点与输入法组合事件需在C8 Electron E2E和人工验收中复核。
16. C7已自动化覆盖DOCX中央目录预算、路径、危险部件、外部关系、解压后大小、原子导入导出与三轨清理补偿；中央目录与本地Header的完整字段级交叉校验继续纳入C8安全硬化。
17. 超大真实DOCX、Windows长路径、macOS文件权限和Linux文件系统差异仍需在C8安装包与平台矩阵复核。
18. 日常备份以UTC日期去重并已合并同项目同日并发请求；面向作者展示的本地日界线体验仍需在C8跨时区人工验收中确认。

# M4-04 Known Risks

## 当前验收状态

- Evidence绑定的产品源提交：`9131a6db1f43d97e52aaa867010a316998f860fb`。
- 完整CI：Quality #2198、Security #1988、Performance #1954、Evidence #1917、PR Policy #1946、Task Governance #2167，全部成功。
- C0—C7工程实现与自动化验收通过。
- C5历史脏锚点升级阻断已经关闭。
- C8尚未开始，继续使用M4-04任务卡原始“第六阶段：完整体验、硬化与发布关闭”规划。

## 未关闭风险

1. 单一任务吸收20张原任务，必须继续依靠内部检查点和原子提交控制跨层断裂。
2. GenerationRun、结构化Candidate、StateProposalBatch及Schema 28使用连续Migration，后续扩展必须只追加。
3. `ModelSupportProfile`存在`untested/unverified`历史命名兼容，读取旧值后统一新写入。
4. 长期Draft PR仍会变化；最终Evidence必须重新绑定Ready前最终产品源提交。
5. DOCX中央目录与本地Header完整字段级交叉验证、真实超大DOCX、Windows长路径、macOS权限和Linux文件系统差异尚未完成。
6. 跨平台安装、升级、卸载、原生模块和安全降级需Windows、macOS、Linux真实工件验收。
7. Skeleton来源失效判断采取保守策略：章节内任一SceneBeat变化可能使该章Skeleton进入`stale`确认；交互精度留待C8复核。
8. 当前Evidence不保存真实第三方账号；Provider限流、账号权限和模型输出差异需C8真实Provider Eval复核。
9. 超大项目搜索、批量替换和索引重建规模上限需真实数据性能报告。
10. 写作会话以Draft Patch为权威输入；操作系统休眠、窗口焦点和输入法组合事件需Electron E2E与人工验收复核。
11. 日常备份在单Core实例内按项目和UTC日期合并并查重；数据库层尚无daily唯一索引，多进程或重复Service实例需明确约束或增加持久化幂等。
12. 混合DPI、1280×800、2K 100/125/150%、21:9已有自动化矩阵，仍需真实多屏与目标平台人工验收。
13. Schema 27历史非法锚点当前采用“拒绝升级并只读保护”策略，不自动猜测修复；后续若提供修复工具，必须使用显式预览、备份和作者确认。

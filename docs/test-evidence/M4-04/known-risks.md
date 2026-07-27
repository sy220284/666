# M4-04 Known Risks

## 当前验收状态

- Evidence绑定的产品源提交：`ea7463a40faa5b23b3b9afc97504be19f2cee708`。
- 最近一次完整产品CI提交：`f36ca0c0567130ab7072c6da3d0ed402dd1fda2d`。
- 完整CI运行：Quality #2186、Security #1976、Performance #1942、Evidence #1905、PR Policy #1934、Task Governance #2155、Repository Governance #698，全部成功。
- `ea7463a`新增的C1面板切换持久化协调修复已完成Prettier、ESLint、TypeScript、Boundary及Unit 490/490定向验证；没有对应的新一轮完整GitHub Actions运行。
- C8尚未开始，继续使用M4-04任务卡原始“第六阶段：完整体验、硬化与发布关闭”规划。此前失效的C8重写路径和阶段进度不再作为依据。

## 未关闭风险

1. 单一任务吸收20张原任务，必须依靠内部检查点和原子提交控制跨层断裂。
2. GenerationRun、结构化Candidate、StateProposalBatch及Schema 28复合锚点硬化使用连续Migration，后续扩展必须继续只追加。
3. C5存在验收阻断：Schema 27历史跨章、跨Version脏锚点升级到Schema 28时缺少检测、拒绝、只读保护、隔离或确定性修复策略，也缺少相应历史Fixture和失败不半升级回归。
4. `ModelSupportProfile`存在`untested/unverified`历史命名冲突，必须兼容读取后统一新写入。
5. 长期Draft PR会继续变化；最终Evidence必须绑定Ready前最终产品源提交，并重新记录最终完整CI与人工验收结果。
6. DOCX中央目录与本地Header的完整字段级交叉验证、真实超大DOCX、Windows长路径、macOS权限及Linux文件系统差异尚未完成。
7. 跨平台安装、升级、卸载、原生模块和安全降级仍需Windows、macOS、Linux真实工件验收。
8. Skeleton来源失效判断采取保守策略：章节内任一SceneBeat变化可能使该章Skeleton进入`stale`确认。该行为阻止自动继续，不造成越权写入，交互精度留待C8复核。
9. C5已覆盖Provider Runtime接线、原子持久化和证据边界，但当前Evidence不保存真实第三方账号；限流、账号权限和模型输出差异需在C8真实Provider Eval复核。
10. C6安全替换已覆盖Core权威预览、计划过期、锁定跳过、事务与恢复点；超大项目搜索和批量替换规模上限仍需真实数据性能报告。
11. 写作会话以Draft Patch为权威输入，首次按键计一秒有效时间；操作系统休眠、窗口焦点和输入法组合事件需Electron E2E与人工验收复核。
12. 日常备份在单Core实例内按项目和UTC日期合并并查重，当前自动化通过；数据库层尚无daily唯一索引，多进程或重复Service实例场景需在发布硬化中明确约束或增加持久化幂等。
13. 混合DPI、1280×800、2K 100/125/150%、21:9已有自动化矩阵基础，仍需真实多屏与目标平台人工验收。

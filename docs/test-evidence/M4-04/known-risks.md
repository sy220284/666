# M4-04 Known Risks

## 当前验收状态

- Evidence Manifest绑定的C0—C7验收基线产品源：`9131a6db1f43d97e52aaa867010a316998f860fb`。
- 基线完整CI：Quality #2198、Security #1988、Performance #1954、Evidence #1917、PR Policy #1946、Task Governance #2167，全部成功。
- C1继续写作并发硬化产品提交：`0987f2237911289f6d91f94498b3278cc82628ed`。
- 该提交已触发Quality #2208、Security #1998、Performance #1964、Evidence #1927、PR Policy #1956与Task Governance #2177，最终状态以GitHub Actions为准。
- C5历史脏锚点升级阻断已经关闭。
- C8尚未开始，继续使用M4-04任务卡原始“第六阶段：完整体验、硬化与发布关闭”规划。

## 已关闭的C1并发风险

- 同项目不同面板请求不再并发落库，执行期间只保留最新待处理状态。
- `editor → versions → candidates`的中间状态不会成为最终权威状态。
- `editor → versions → editor`会重新排队恢复写入，旧面板即使已经进入Core，也会被最终作者面板覆盖。
- 迟到成功、旧失败重试和旧Renderer闭包不会回退Renderer已确认状态。
- 畸形请求键不会退化为跨项目共享通道。

## 未关闭风险

1. 单一任务吸收20张原任务，必须继续依靠内部检查点和原子提交控制跨层断裂。
2. GenerationRun、结构化Candidate、StateProposalBatch及Schema 28使用连续Migration，后续扩展必须只追加。
3. `ModelSupportProfile`存在`untested/unverified`历史命名兼容，读取旧值后统一新写入。
4. 长期Draft PR仍会变化；最终Evidence必须重新绑定Ready前最终产品源提交。
5. C1并发硬化已具备可控Promise单测，但快速连续切换面板、关闭应用并重启后恢复最终面板仍需Electron E2E和人工路径复核。
6. DOCX中央目录与本地Header完整字段级交叉验证、真实超大DOCX、Windows长路径、macOS权限和Linux文件系统差异尚未完成。
7. 跨平台安装、升级、卸载、原生模块和安全降级需Windows、macOS、Linux真实工件验收。
8. Skeleton来源失效判断采取保守策略：章节内任一SceneBeat变化可能使该章Skeleton进入`stale`确认；交互精度留待C8复核。
9. 当前Evidence不保存真实第三方账号；Provider限流、账号权限和模型输出差异需C8真实Provider Eval复核。
10. 超大项目搜索、批量替换和索引重建规模上限需真实数据性能报告。
11. 写作会话以Draft Patch为权威输入；操作系统休眠、窗口焦点和输入法组合事件需Electron E2E与人工验收复核。
12. 日常备份在单Core实例内按项目和UTC日期合并并查重；数据库层尚无daily唯一索引，多进程或重复Service实例需明确约束或增加持久化幂等。
13. 混合DPI、1280×800、2K 100/125/150%、21:9已有自动化矩阵，仍需真实多屏与目标平台人工验收。
14. Schema 27历史非法锚点当前采用“拒绝升级并只读保护”策略，不自动猜测修复；后续若提供修复工具，必须使用显式预览、备份和作者确认。

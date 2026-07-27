# M4-04 Known Risks

1. 单一任务吸收20张原任务，必须依靠内部检查点和原子提交控制跨层断裂。
2. GenerationRun、结构化Candidate和StateProposalBatch使用连续Migration，后续扩展必须继续只追加。
3. `ModelSupportProfile`存在`untested/unverified`历史命名冲突，必须兼容读取后统一新写入。
4. 长期Draft PR会持续变化，最终Evidence必须重新绑定Ready前最终Head。
5. DOCX、超大项目、混合DPI和跨平台安装验收需要真实环境与可复现工件。
6. C1已加入继续写作持久化；后续Migration必须保留Schema 22读取兼容并继续只追加。
7. 当前PR保持Draft，永久Quality工作流只执行静态门；当前Head的Unit、Integration、
   Migration、Coverage、Build与Electron E2E尚未由Ready路由重新执行，不能把历史阶段结果
   冒充为当前Head的新结论。
8. C8尚未完成，追踪矩阵中的M4-04需求继续保持`In Progress`。
9. 真实Electron Candidate工作台仍需由C8 Electron E2E与人工UI矩阵复核。
10. 结构化正文模式中断时只有完整可解析结果才可成为complete Candidate；纯文本模式
    继续承担可读partial的主要路径，最终模型档案需要在C8真实Provider Eval复核。
11. C5已覆盖Provider Runtime接线、原子持久化和证据边界，但当前证据不保存真实
    第三方账号；限流、账号权限和模型输出差异仍需在C8发布环境复核。
12. C6安全替换已覆盖Core权威预览、计划过期、锁定跳过、事务与恢复点；超大项目
    的搜索和批量替换规模上限仍需在C8真实数据性能报告中复核。
13. 当前写作会话以Draft Patch为权威输入，首次按键计一秒有效时间；操作系统级
    休眠、窗口焦点与输入法组合事件需在C8 Electron E2E和人工验收中复核。
14. C7已自动化覆盖DOCX中央目录预算、路径、危险部件、外部关系、解压后大小、
    原子导入导出与三轨清理补偿；中央目录与本地Header的完整字段级交叉校验继续纳入
    C8安全硬化。
15. 超大真实DOCX、Windows长路径、macOS文件权限和Linux文件系统差异仍需在C8
    安装包与平台矩阵复核。
16. 日常备份以UTC日期去重以保持跨时区确定性；面向作者展示的本地日界线体验
    需在C8跨时区人工验收中确认。

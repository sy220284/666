# M12-01 创作日志与长期项目复盘：实现摘要

## 实现结论

M12-01 将 Project Journal 落为项目本地数据库之上的派生复盘层，继续复用 writing sessions、Version、GenerationRun、StoryDigest、Validation、Idea、Recovery、人物关系、时间线、伏笔与人物成长线等既有权威域。Journal 不建立第二套故事事实、通用事件总线、搜索系统、导航系统或模型调用器。

## 收口加固

- 定稿统计使用 `chapters.final_version_id + finalized_at`，后续定稿按实际终稿切换时间统计；旧数据迁移以当前终稿 Version 创建时间作为历史最佳锚点。
- 长期日志分页使用 `period_end + id` 组合游标，避免相同结束时间跨页漏项。
- Renderer 加载更早日志时同步保留作者备注，避免历史备注被空编辑状态覆盖。
- `journal_summarize` 进入现有 GenerationRun 生命周期；Journal 持久化 `ai_pending + generation_run_id`，成功进入 `ready`，失败或取消进入 `ai_failed`。
- AI 完成继续校验项目作用域、运行身份与 Journal 来源 Hash，旧模型结果不能覆盖已变化的确定性摘要。
- Clone/Restore 增加实际身份重映射测试，验证 Journal preferences、entries、作者备注和外键完整性。
- 增加真实 500 万字符不可变 Version 正文夹具，验证一日 Journal 窗口聚合不依赖正文规模回扫。

## 关键边界

- 所有 Journal 数据仅写入本地 `project.sqlite`。
- Renderer 不直接访问 SQLite、文件系统或凭据。
- 智能复盘只消费确定性摘要、来源 Hash 与有界既有 StoryDigest。
- Journal 不能反向写入 Canon、Continuity、Planning、Validation、Draft 或 Version 权威域。
- 本地补周期仅在应用运行时执行，不引入云端调度器。

## 验证状态

本文件记录实现事实；权威通过状态以 PR #402 对最终 Ready Head 的 GitHub Actions、合并后 `main-verification` 与 `task-verification/M12-01` 为准。Draft 收口期间不预写未来成功结果。

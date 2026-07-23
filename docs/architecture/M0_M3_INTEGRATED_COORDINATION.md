# M0—M3整体协同架构

> 状态：M0—M3整体审计整改附件  
> 原则：补齐既有边界之间的协调，不引入第二套真源或未来阶段能力。

## 1. 协调模型

```text
Electron Main / Core Supervisor
        │ CoreStatus
        ▼
Renderer Core Recovery Supervisor
        ├─ 保留Tiptap内存正文
        ├─ 不经flush重启Core
        ├─ 重开最近一次活动项目
        └─ 复制未保存正文

Project structure / Version / Continuity writes
        │ Core单写事务
        ▼
project.sqlite
        ├─ logicalBlockId维持跨Draft正文身份
        ├─ SceneBeat链接重绑当前draft_block_id
        ├─ 连续性有效期边界守卫
        ├─ EndingSnapshot统一stale
        └─ 伏笔/弧光按目标章节投影
```

## 2. 身份边界

`draft_blocks.id`只表示某个Draft中的数据库记录；`logical_block_id`表示正文块跨Revision、结构调整和Version恢复的稳定业务身份。SceneBeat表仍保存对真实`draft_block_id`的外键以维持数据库完整性，但记录被结构操作重建时，迁移队列必须在同一Core写事务内按`logicalBlockId`重新绑定。

无法映射的记录保留在`scene_beat_link_rebind_queue`，不会伪造成功关联。后续完整性检查可将其报告为显式待处理项。

## 3. 快照边界

EndingSnapshot是章节尾的派生投影，不是第二套权威状态。以下变化会使项目现有有效快照失效：

- 卷章顺序、归属、软删除与恢复；
- 章节Final Version变化；
- EntityState和KnowledgeState变化；
- 伏笔章节事件或当前状态变化；
- ArcMilestone状态、计划章或实际章变化。

读取方继续遵守DEC-016：只使用有效快照；stale或缺失时查询权威表并记录`fallback_live_query`。

## 4. 历史投影

EntityState与KnowledgeState沿用有效期过滤。伏笔状态由截至目标章节最后一次`plant/reinforce/partial_reveal/reveal`事件推导；弧光节点仅在其实际章或计划有效章不晚于目标章节时进入快照。这样可防止后文结果倒灌到旧章约束。

## 5. Core异常恢复

自动保存失败仍保留Tiptap内存内容。Core恢复监督器位于React入口生命周期层，独立于写作路由，因此重启入口不需要先离开写作页，也不触发失败的Draft flush。恢复顺序为：

```text
检测Core异常
→ 保留编辑器内存状态
→ 作者可先复制正文
→ Main受控重启Core
→ 重新打开上次活动项目
→ 作者重新保存当前正文
```

Renderer不会直接保存救援文件，避免突破文件系统和项目写入边界。

## 6. 取消与超时语义

Renderer的AbortSignal首先表示“停止等待或替换显示结果”。底层IPC若没有真正终止并最终返回，Renderer只能把该结果标记为`stale`，不能宣称操作已取消。真正可取消的长任务继续使用M0任务协议和后续GenerationRun取消协议。

Core未在等待窗口内返回最终结果时，Main必须表达“结果未知”，要求读取权威状态后再决定是否重试；不得把超时等同于事务失败并直接鼓励重复写入。

## 7. Renderer安全边界

写作工作台的选区恢复使用React模块内的临时状态，以`projectId + chapterId`键控，不通过全局DOM查询寻找编辑器。返回项目时在按钮接管焦点前捕获编辑器原生选区；重开章节时先完成Tiptap挂载和选区恢复，再发布`data-draft-workspace`就绪标记，避免外部调用方把尚未恢复的界面误判为可用。粘贴HTML清洗通过受控DOM解析和序列化完成，不读取或注入`innerHTML`。Candidate测试Fixture只在未打包E2E环境注册，生产IPC处理器不暴露该入口。

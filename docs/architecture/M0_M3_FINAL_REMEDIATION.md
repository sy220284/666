# M0—M3最终协调整改

> 状态：四阶段整体复审后的受控整改附件  
> 基线：`main@dcf388560bf9077ec95abb309b03456ee0ef5012`  
> 原则：修复既有Verified能力，不改变M4-01活动任务，不引入未来阶段功能。

## 1. SceneBeat与正文块重绑

`logicalBlockId`只承担正文块跨Draft的稳定身份，不能单独构成跨项目、跨章节自动重绑授权。Schema 19重新建立重绑队列并固定以下约束：

- 队列记录Project、源章节、目标章节和源Draft；
- 新块必须位于目标章节当前活动Draft；
- SceneBeat必须仍属于同一Project和目标章节；
- 普通跨章正文移动不会自动移动规划关系；
- 同章活动Draft替换可以按`logicalBlockId`恢复链接；
- SceneBeat章节变更会清理旧队列，防止历史删除被未来无关插入消费。

无法满足约束的关系保持未绑定状态，由作者在目标章节显式处理，不伪造成功关联。

## 2. EndingSnapshot失效边界

Schema 19撤销Schema 18的全项目宽泛失效，并恢复最小安全边界：

- Final Version变化只使当前章节Snapshot失效；
- 纯文字定稿是否向后传播继续由DerivedInvalidation的变化类型判断；
- EntityState和KnowledgeState从`valid_from_chapter_id`开始失效；
- 伏笔从关联章节开始失效；
- 人物弧光只在命中或跳过节点的有效章节开始失效；
- 卷章排序变化仍保守地使项目Snapshot失效，因为时间比较顺序本身发生变化。

未关联章节的planned伏笔属于作者未来计划，不进入早期历史Snapshot。人物弧光的planned节点同样不会作为已经发生的历史结果写入快照。

## 3. 数据库恢复事务

恢复副本的Project ID重映射在事务内完成。`PRAGMA foreign_key_check`必须在`COMMIT`之前通过；检查失败时事务回滚，原Project ID和所有引用保持不变。提交完成后再恢复`foreign_keys = ON`。

## 4. Renderer取消语义

Renderer Abort表示调用方立即停止等待和停止展示结果。底层IPC可能仍完成，因此：

- Abort后调用方立即收到`stale`；
- 底层迟到成功或失败被消费，不产生未处理Promise；
- 迟到结果不进入React状态；
- 写操作不能被描述为“确定取消”，仍需刷新权威状态确认结果。

## 5. Core恢复生命周期

Core恢复监督器增加：

- 首次健康轮询前崩溃时使用最近项目作为恢复身份；
- 并发重启请求合并为一个Promise；
- dispose后进行中的轮询、重启和剪贴板操作不得再渲染Surface；
- 恢复身份只保存最小`projectId`，不伪装为完整Workspace摘要。

## 6. IPC超时分类

`COMMON_TIMEOUT_005`按操作类别处理：

- `query`：没有重复写风险，可安全重试；
- `mutation`：结果可能已写入，禁止直接重试，必须刷新权威状态。

Candidate预览、撤销预览、ApplyRecord查询、连续性列表、规划列表、状态提案列表和Snapshot读取属于query；采用、撤销、保存、状态变更、Snapshot刷新和派生失效属于mutation。

## 7. 验收矩阵

本轮硬验收包括：

- 带存量数据的Schema 17→18→19真实升级；
- SceneBeat同ID无关块拒绝、受控目标Draft重绑和外键完整性；
- 当前章与后续章节的Snapshot精确失效；
- 未种下伏笔的历史隔离；
- 外键检查失败时Project ID重映射回滚；
- Abort及时返回、replace代次和迟到Promise消费；
- Core首次轮询前崩溃、并发重启和dispose竞态；
- query/mutation超时语义；
- 500个SceneBeat链接块的批量删除与重建性能预算。

N+1查询、`ipc-handlers.ts`拆分、`stable()`工具提取和编辑器序列化优化属于后续结构性性能债，不与本轮数据正确性整改混合。

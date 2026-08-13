# WorldForge V1.0 数据流说明

> 状态：Frozen Baseline with M11-07 Long-form AI Addendum
> 更新日期：2026-08-13

## 1. 编辑与自动保存

```text
用户输入
→ Tiptap事务
→ editor-core生成Block Patch
→ Renderer合并短时编辑
→ draft.applyPatch(baseRevision, expectedHash)
→ Preload strict Schema校验
→ Core项目/锁定/Revision/Hash校验
→ 单写队列
→ SQLite事务
→ Draft Revision +1
→ Renderer更新保存状态
```

只有Core事务返回成功后，Renderer才更新“已保存Revision”。

## 2. AI生成

```text
用户发起T0/T1/改写/融合/校验/状态提取
→ ai.startGeneration
→ 创建持久GenerationRun（业务生命周期权威）
→ 创建TaskSnapshot（运行态/事件投影）
→ 组装ConstraintPackage
→ 记录promptId/promptVersion/constraintHash/snapshotSource
→ Provider Adapter直连用户配置端点
→ MessagePort批量delta
→ Renderer临时展示
→ 完成/取消/断流
→ Core解析、Cleaner和Schema验证
→ 保存complete或partial Candidate / StateProposal
→ GenerationRun与结果引用原子收口为终态
→ Task进入对应展示终态
→ Renderer查询权威结果
```

AI流不直接进入Draft。切换章节只改变Renderer视图，不改变Run归属。

取消与生命周期顺序：

```text
ai.cancelGeneration / task.cancel / Project Close / Move / Core Shutdown
→ GenerationRuntime定位GenerationRun
→ 持久化cancelled与可保存partial边界
→ abort Provider并停止未来delta
→ Task发布terminal投影
→ await真实execution completion
→ ProjectTaskBarrier确认quiescent
→ 才允许释放、移动Project DB或关闭Core
```

`saving_candidate`等不可取消原子阶段不强制中断；生命周期操作等待事务自然收口。Task terminal不能替代GenerationRun终态或execution quiescence。

## 3. Candidate采用

```text
作者选择候选块或SceneBeat
→ candidate.apply
→ 读取Candidate与当前Draft
→ 校验projectId/baseRevision/Hash/锁定
├─ 无冲突：生成Patch → 单事务应用 → Revision+1 → ApplyRecord
└─ 有冲突：返回ConflictSet → 作者逐项选择 → 再提交
```

应用后可通过inverse patch立即撤销，也可通过采用前Checkpoint在重启后恢复。

## 4. 定稿、状态与人物弧光

```text
作者定稿
→ version.create(type=finalized)
→ 不可变Version/VersionBlock事务
→ 可选state_extract GenerationRun
→ StateProposal列表
   ├─ 状态：EntityState / KnowledgeState
   ├─ 结构：TimelineEvent / CharacterRelationship / Foreshadowing / ArcMilestone
   └─ 设定：新Entity / CanonFact
→ 作者接受/编辑接受/拒绝
→ 单事务更新对应权威对象
   ├─ Continuity：EntityState / KnowledgeState / TimelineEvent / CharacterRelationship
   ├─ Narrative Planning：Foreshadowing / ArcMilestone
   └─ Canon：Entity / CanonFact
→ 生成EndingSnapshot
→ 下一章约束包读取
```

pending提案不得修改任何权威对象。来源定稿变化后只可拒绝；弧光与语义一致性校验只读作者已确认对象。

ArcMilestone还有作者直接裁决入口：

```text
作者transitionMilestone(author)
或 StateProposal resolve(state_proposal)
→ unresolvedArcMilestoneHitDependencies
   ├─ Arc前置节点必须hit
   └─ TimelineEvent必须active、有章节锚点且不晚于实际命中章节
→ 同一领域事务推进状态
→ 写入对应confirmationSource
```

两条入口不得各自维护依赖规则。

### 4.1 定稿后的长篇摘要

```text
version.setFinal
→ 定稿事务成功提交
→ best-effort重建章节StoryDigest
→ 聚合当前卷StoryDigest
→ 聚合全书StoryDigest
├─ 成功：fresh + 来源Version列表 + 语义修订
└─ 失败：定稿保持成功，返回稳定诊断，摘要可稍后重建
```

旧章定稿变化由数据库Trigger先将章、卷和全书摘要标为`stale`。约束包只读取`fresh`摘要，且只纳入最近12个前文章节、当前卷和全书摘要；生成和导航均不扫描全书正文。

智能任务分配发生在既有Generation入口内：

```text
生成Intent确定任务类型
→ 读取项目AiTaskRoute
→ 校验已配置连接
→ 校验当前Prompt精确版本的ModelSupportProfile
→ 首选或按序回退
→ 继续进入既有GenerationRun与ConstraintPackage流程
```

## 5. EndingSnapshot读取

```text
组装下一章约束包
→ 查询前章EndingSnapshot
├─ 存在且有效：读取，snapshotSource=snapshot
├─ stale：忽略并直查权威当前表
└─ 缺失：直查EntityState/Knowledge/Foreshadowing/已确认ArcMilestone
          snapshotSource=fallback_live_query
```

快照缺失或stale不阻塞生成，但必须可追溯。

## 6. 旧章返修

```text
恢复或编辑旧章Draft
→ 创建新定稿Version
→ 对比影响类型
├─ 纯文字：不使连续性状态失效
├─ 动态状态变化：标记后续Snapshot stale
├─ 弧光节点变化：标记相关弧光与语义校验待重算
├─ 事件结果变化：标记连续性检查待重算
├─ 时间线变化：标记VAL-001时序校验待重算
└─ 伏笔变化：标记关联回收章节待检查
```

系统只标记和提示，不自动改写后续正文。

## 7. 搜索、索引与替换

### 索引

```text
业务事务提交
→ 写search_index_queue
→ 异步更新FTS5
├─ 成功：清除队列项
└─ 失败：索引标记stale，正文事务不回滚
```

### 搜索

```text
用户查询
→ search.project
→ FTS5召回业务ID
→ Repository读取权威正文/Version/Entity
→ 返回带锚点结果
```

### 批量替换

```text
查询结果
→ previewReplace生成ReplacePlan
→ 作者确认
→ 重新读取Active Structure Authority
   ├─ Chapter未软删除
   ├─ 父Volume未软删除
   └─ 目标Draft仍是Chapter的active Draft且status=active
→ 重新校验Revision/Hash/锁定
→ 创建重大恢复点
→ 单事务应用Patch
→ 写索引队列
```

## 8. 导入

```text
选择文件
→ 隔离临时目录
→ 格式/编码/安全检查
→ 解析为ImportPlan
→ 作者预览分章、合并、拆分和重命名
→ 创建恢复点
→ transfer.importCommit
→ 先按requestId读取command_receipts
├─ 命中且fingerprint一致：直接重放首次结果
├─ 命中但fingerprint不同：拒绝命令身份冲突
└─ 未命中：单事务创建卷/章/Draft/Block/Version
             + 写入command_receipts结果
→ 写索引队列
→ 清理临时文件
```

预览阶段不修改项目数据库。Import业务结果、恢复边界和CommandReceipt必须形成一致提交语义；SQLite已提交而Core在响应前崩溃时，相同请求不得生成第二套ID、内容或Checkpoint。

## 9. 导出

```text
选择Version和格式
→ transfer.exportPreview
→ Core读取VersionBlock
→ 格式渲染
→ 写临时文件
→ 完整性/大小检查
→ 原子重命名
```

导出不直接读取Renderer HTML或未提交编辑状态。

## 10. 备份与恢复

### 备份

```text
触发备份
→ SQLite Online Backup到临时文件
→ integrity_check
→ 计算Hash
→ 写BackupRecord(verified)
→ 原子重命名
→ 执行保留策略
```

### 恢复

```text
选择已验证备份
→ 选择新目录
→ 复制恢复内容
→ 检查Schema/完整性/Hash
→ 注册为新项目
→ 原项目保持不变
```

## 11. 设置与凭据

```text
Renderer提交Provider元数据
→ Core保存到app.sqlite
Renderer提交密钥
→ Main/OS Credential Store保存
→ app.sqlite只保存credentialRef
→ 请求时Core通过受控代理读取
```

密钥不返回Renderer，不进入项目库和日志。

## 12. 长任务、Generation与事件恢复

### 12.1 普通Task

```text
长任务启动
→ 创建taskId和内存TaskSnapshot
→ 发送有序事件
→ Renderer切页或重连
→ task.getSnapshot(taskId)
→ 恢复阶段、序号和已接收字符
```

任务事件不作为权威业务数据；完成后Renderer按ID重新查询数据库。

### 12.2 Generation authority split

```text
GenerationRun（project.sqlite）
  = queued/running/succeeded/failed/cancelled业务生命周期权威

TaskSnapshot（运行内存与事件协议）
  = 阶段、进度、delta序号、取消反馈和重连投影
```

重连可以恢复TaskSnapshot展示，但重启后的业务判断必须读取GenerationRun及持久结果；已经消失的网络流不得伪装为仍在运行。

## 13. 派生数据重建

```text
权威业务表
├─ 重建FTS5
├─ 重算字数/统计
├─ 重建约束缓存
├─ 按章节→卷→全书重建StoryDigest
├─ SemanticRevision Trigger增量推进权威语义修订
└─ Validation读取SemanticRevision + 章节内容digest重算校验与节奏建议
```

重建任务不能反向修改Draft、Version、Canon、EntityState或ArcMilestone。

## 14. Entity永久删除依赖裁决

```text
trash.previewPermanentDelete(entity)
→ PRAGMA foreign_key_list扫描指向entities的真实FK
→ 仅收集RESTRICT/NO ACTION引用
→ 映射稳定作者提示与blocker摘要
→ 作者确认
→ permanentDelete重新使用同一dependency authority
├─ blocker仍存在：拒绝
└─ 无blocker：事务删除；CASCADE从属数据按Schema执行
```

Preview和Delete不得维护两份手写依赖清单；未来新增RESTRICT FK后，无需额外业务枚举即可自动成为阻断来源。

## 15. M10-22故障、恢复与发行流

### 15.1 Core强制恢复

```text
health/RPC超时
→ graceful drain
→ graceful shutdown
→ 超时则terminate Utility Process
→ 确认旧generation exit
→ disconnect RPC + remove listeners
→ spawn新Core
→ handshake + health check
```

### 15.2 恢复克隆

```text
验证备份与目标目录W_OK
→ 复制为临时恢复库
→ 枚举真实Project Schema表
→ ProjectClonePolicy逐表执行remap/drop/regenerate/preserve
→ 未分类表：阻断
→ 重映射projectId与workspace
→ quick_check / foreign_key_check
→ 原子注册新项目
```

`backup_records`、`backup_failures`、命令回执和瞬时计划不随副本继承；`backup_policies`属于项目策略，可随项目重映射。

### 15.3 每日备份lease

```text
原子创建tokenized lease
→ heartbeat续租
→ SQLite online backup + 验证
→ assertOwner fencing
→ 原子提交文件
→ assertOwner fencing
→ 写BackupRecord
→ token一致才释放
```

### 15.4 Release Acceptance

```text
main-verification(current SHA)
+ Quality/Security/Performance/UI
+ 三平台原生package/startup/hash/ASAR/Fuse
+ Windows Authenticode证据（required）
+ macOS Developer ID/notarization/stapling证据（required）
→ 聚合复验三份manifest
→ checksums
→ GitHub Release
```

Task Runtime不在该数据流中。

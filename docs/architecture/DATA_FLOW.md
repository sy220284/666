# WorldForge V1.0 数据流说明

> 状态：Frozen

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
→ 创建GenerationRun
→ 组装ConstraintPackage
→ 记录promptId/promptVersion/constraintHash/snapshotSource
→ Provider Adapter直连用户配置端点
→ MessagePort批量delta
→ Renderer临时展示
→ 完成/取消/断流
→ Core解析、Cleaner和Schema验证
→ 保存complete或partial Candidate / StateProposal
→ Renderer查询权威结果
```

AI流不直接进入Draft。切换章节只改变Renderer视图，不改变Run归属。

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
   ├─ proposal_type=entity_state
   │  └─ 目标：entityId + stateKey + proposedValue
   └─ proposal_type=arc_milestone
      └─ 目标：arcMilestoneId + proposedStatus(hit/skipped)
→ 作者接受/编辑接受/拒绝
→ 单事务更新对应权威对象
   ├─ EntityState
   └─ ArcMilestone.status
→ 生成EndingSnapshot
→ 下一章约束包读取
```

pending提案不得修改EntityState或ArcMilestone。弧光一致性校验只读已确认里程碑。

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
→ 单事务创建卷/章/Draft/Block
→ 写索引队列
→ 清理临时文件
```

预览阶段不修改项目数据库。

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

## 12. 长任务与事件恢复

```text
长任务启动
→ 创建taskId和内存TaskSnapshot
→ 发送有序事件
→ Renderer切页或重连
→ task.getSnapshot(taskId)
→ 恢复阶段、序号和已接收字符
```

任务事件不作为权威业务数据；完成后Renderer按ID重新查询数据库。

## 13. 派生数据重建

```text
权威业务表
├─ 重建FTS5
├─ 重算字数/统计
├─ 重建约束缓存
└─ 重算校验与节奏建议
```

重建任务不能反向修改Draft、Version、Canon、EntityState或ArcMilestone。

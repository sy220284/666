# WorldForge 数据流说明

> 状态：Approved

## 1. 编辑与自动保存

```text
用户输入
→ Tiptap事务
→ editor-core生成Block Patch
→ Renderer合并短时编辑
→ draft.applyPatch(baseRevision, expectedHash)
→ Preload Schema校验
→ Core项目/锁定/Revision校验
→ 单写队列
→ SQLite事务
→ 新Revision
→ Renderer更新保存状态
```

权威数据从Core返回后才更新本地已保存Revision。Renderer崩溃时，只有已提交事务被视为保存成功。

## 2. AI生成

```text
用户发起T0/T1/改写
→ ai.startGeneration
→ Core创建GenerationRun
→ 读取章节、设定、状态与规则
→ 组装ConstraintPackage
→ Provider Adapter直连端点
→ MessagePort批量delta
→ Renderer临时展示
→ 完成/取消/断流
→ Core解析和Schema校验
→ 保存complete或partial Candidate
→ Renderer查询Candidate
```

AI流不直接进入Draft。切换章节只改变Renderer视图，不改变Run所属章节。

## 3. Candidate采用

```text
作者选择候选块
→ candidate.apply
→ 读取Candidate与当前Draft
→ 校验projectId/baseRevision/Hash/锁定
├─ 无冲突：生成Patch → 单事务应用 → Revision+1 → ApplyRecord
└─ 有冲突：返回ConflictSet → 作者逐项选择 → 再提交
```

应用后可通过inverse patch立即撤销，也可通过采用前Checkpoint在重启后恢复。

## 4. 定稿与状态更新

```text
作者定稿
→ version.create(type=finalized)
→ 不可变Version/VersionBlock事务
→ 可选状态提取Run
→ StateProposal列表
→ 作者接受/编辑/拒绝
→ 接受项单事务更新EntityState
→ 生成EndingSnapshot
→ 下一章约束包读取
```

StateProposal处于pending时不修改权威状态。

## 5. 旧章返修

```text
恢复或编辑旧章Draft
→ 创建新定稿Version
→ 对比影响类型
├─ 纯文字：不使状态失效
├─ 动态状态变化：标记相关后续Snapshot stale
├─ 事件结果变化：标记剧情弧/连续性检查待重算
└─ 伏笔变化：标记关联回收章节待检查
```

系统只标记和提示，不自动改写后续正文。

## 6. 搜索与替换

### 搜索

```text
用户查询
→ search.project
→ FTS5召回业务记录ID
→ Repository读取权威正文/设定
→ 返回带锚点结果
```

FTS只负责召回，不返回可直接写回的权威内容。

### 批量替换

```text
查询结果
→ previewReplace生成ReplacePlan
→ 作者确认
→ 重新校验Revision/Hash/锁定
→ 创建重大恢复点
→ 单事务应用
→ 更新FTS
```

## 7. 导入

```text
选择文件
→ 临时隔离目录
→ 格式/编码/安全检查
→ 解析为ImportPlan
→ 作者预览分章、合并、拆分和重命名
→ 创建恢复点
→ import.commit
→ 单事务创建卷/章/Draft/Block
→ 重建索引
→ 清理临时文件
```

预览阶段不修改项目数据库。

## 8. 导出

```text
选择Version和格式
→ export.preview
→ Core读取VersionBlock
→ 格式渲染
→ 写临时文件
→ 完整性/大小检查
→ 原子重命名
```

活动Draft未定稿时需明确选择是否先创建Version；导出不直接读取Renderer HTML。

## 9. 备份与恢复

### 备份

```text
触发备份
→ SQLite Online Backup到临时文件
→ integrity_check
→ 计算Hash
→ 写BackupRecord(verified)
→ 原子重命名
→ 按轨道执行保留策略
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

## 10. 设置与凭据

```text
Renderer提交Provider元数据
→ Core保存到app.sqlite
Renderer提交密钥
→ Main/OS Credential Store保存
→ app.sqlite只保存credentialRef
→ AI请求时Core通过受控代理读取
```

密钥不返回Renderer，不进入项目库和日志。

## 11. 日志

```text
业务事件
→ 结构化安全字段
→ 本地JSONL
```

正文、完整Prompt、Provider原始响应和凭据默认在进入日志层前被排除。

## 12. 派生数据重建

```text
业务表
├─ 重建FTS5
├─ 重算字数/统计
├─ 重建约束缓存
└─ 重建日记/摘要索引
```

任何重建任务只能读取权威数据并写派生表，不能反向修改正文、Canon和状态。

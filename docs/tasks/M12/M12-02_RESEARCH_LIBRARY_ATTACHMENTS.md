# M12-02 项目资产生命周期与研究资料库

> 状态：Planned  
> 里程碑：M12 作者生产力与长期项目增强  
> 优先级：P1（M12 首要）  
> 执行分支：`work`  
> 目标分支：`main`

## 目标

建立项目内研究资料库与受管附件生命周期，使作者可以保存资料笔记、来源说明和本地附件，并将资料与章节、人物、地点、势力、事件、伏笔等稳定对象关联。

本任务更重要的结构目标是：把“项目完整资产”从单一 `project.sqlite` 升级为明确、可验证的 Project Artifact Set，使 Backup / Restore / Move / Clone 不再默认把数据库文件等同于完整项目。

研究资料只服务创作参考，不成为 Canon / Continuity / Planning 的权威故事事实。

## 阶段定位

这是 M12 的首要任务。实施顺序固定为：

```text
Project Artifact Lifecycle
→ Research Domain
→ SearchTools integration
→ Renderer Research UI
→ 显式 AI 参考资料
```

禁止先把附件 UI 做出来，再补 Backup / Restore / Clone；受管附件的完整生命周期必须先成为底层能力。

## 依赖

- M11-07 有效 VERIFIED。
- 不依赖 Project Journal；Journal 与 Research 均建立在 M11 长篇智能底座和既有项目基础设施之上。
- 复用现有项目路径边界、SearchTools/FTS、Atomic Navigation、Backup/Restore、ProjectClonePolicy、Recovery 和错误语义。

## 一、Project Artifact Lifecycle

从本任务开始，项目可恢复资产集合必须显式建模为：

```text
Project Artifact Set
├─ project.sqlite
└─ managed attachments
```

允许采用 manifest、具名 artifact inventory 或等价设计，但必须有单一权威规则回答：

- 哪些文件属于项目。
- 每个受管文件的稳定相对路径。
- 内容 Hash、大小、媒体类型/资产身份。
- Backup / Restore / Clone / Move 是否覆盖完整集合。

不得继续把“数据库备份成功”直接等同于“完整项目备份成功”。

### 受管附件目录

附件采用项目工作区内的受管本地副本，不把任意绝对路径作为业务真源。

要求：

1. 导入附件由 Main/Core 受控复制到项目专用受管目录。
2. 文件名、相对路径、扩展名和 MIME 必须规范化并防路径穿越。
3. 使用 SHA-256 或现有统一 Hash 记录内容身份。
4. 单文件大小、单项目附件总量和允许预览类型必须有明确上限。
5. 业务记录只保存稳定受管相对路径/asset identity，不保存外部源文件绝对路径作为真源。
6. 不自动执行附件中的脚本、宏、外部对象或可执行内容。
7. Renderer 不得直接扫描或读取项目附件目录。
8. 目录结构必须允许未来新增其他项目本地资产，但本任务只为 Research Attachment 建立消费方，不提前建设无消费方的通用素材系统。

### Backup

Backup 必须把数据库与受管附件作为同一项目恢复集合处理，并记录完整性 Manifest，至少包含：

- artifact identity / type
- managed relative path
- content hash
- size bytes
- media type

数据库仍使用现有安全 online backup / verify 语义；附件使用受控复制/流式 Hash。两者只有全部验证通过后，才能把完整项目恢复点报告为成功。

### Restore

Restore 必须在恢复完成前验证数据库与附件集合：

- 数据库完整性失败 → 维持现有失败/只读语义。
- 附件缺失、Hash 不符或路径非法 → 产生稳定可解释结果。
- 禁止附件缺失后仍把“完整项目恢复”报告为成功。
- 恢复仍不得覆盖原项目。

### Move

Project Move 继续以完整工作区为单位搬迁；移动后验证附件相对路径与必要 Hash，不得将旧绝对路径写回业务数据。

### Clone

Project Clone 必须覆盖 Project Artifact Set：

- 新项目使用新 projectId。
- 受管附件复制到新项目工作区并验证 Hash。
- ResearchNote / ResearchAttachment / ResearchLink 按既有 ID remap / preserve 语义处理。
- 派生搜索索引重新生成，不复制为第二真源。
- 新增表必须登记 `PROJECT_CLONE_POLICY`；未知表继续 fail-closed。

## 二、Research Domain

新增具名 Research 领域。

### ResearchNote

至少包含：

- id / project_id
- title
- body
- source_type / source_label / source_uri nullable
- tags
- created_at / updated_at
- archived_at nullable

### ResearchAttachment

至少包含：

- id / project_id
- note_id nullable
- display_name
- media_type
- size_bytes
- content_hash
- managed_relative_path / artifact identity
- created_at

### ResearchLink

将 Note/Attachment 与现有稳定对象关联：

- chapter
- volume
- entity
- timeline_event
- foreshadowing
- arc / milestone
- idea
- 自定义无目标资料

所有关联必须校验 project scope 与目标存在性。

### 生命周期规则

1. 删除 Note 时不得静默删除仍被其他对象引用的 Attachment。
2. Attachment 删除前必须检查 ResearchLink/Note 引用并采用可解释策略。
3. Archive/Restore 不改变关联身份。
4. Clone/Restore 后所有内部引用保持一致。
5. Research 不允许直接修改故事权威域。

## 三、资料编辑与检索

支持：

- Markdown/纯文本研究笔记。
- 标签。
- 来源说明。
- 附件关联。
- 按人物/章节/标签/来源筛选。
- 归档/恢复。
- 从资料跳到对应故事对象，从故事对象查看关联资料。

ResearchNote 文本与允许索引的附件元数据接入**现有 SearchTools / FTS**。当前 SearchSourceType 需要扩展 `research` 或等价具名来源，并保持统一 SearchProjectResult / AuthorNavigationTarget 路径。

禁止新建第二套全文搜索、Research 专用搜索服务或 Renderer 本地扫描索引。

附件正文解析默认不做。若未来需要 PDF/DOCX 内容索引，必须单独定义安全解析白名单和资源上限；本任务不得直接把任意附件内容解析后送入 AI。

## 四、AI 使用边界

资料默认不自动进入 ConstraintPackage。

作者显式选择“作为本次参考资料”时：

1. 通过稳定 Research ID / Attachment ID 加入一次生成请求。
2. Core 校验项目归属、大小、允许类型和可读取边界。
3. 记录来源与裁剪信息。
4. 不把研究资料自动提升为 P0/P1 权威事实。

如作者确认资料内容成为设定，仍必须通过 Canon / Continuity / Planning 的既有作者确认写路径。

## 五、UI

新增“研究资料”工作区或现有数据工具中的稳定入口，至少包含：

- 笔记列表 / 搜索 / 标签。
- 笔记编辑。
- 附件拖入 / 选择导入。
- 安全预览允许类型。
- 关联人物 / 章节 / 事件等对象。
- 资料 → 故事对象精准跳转。
- 故事对象 → 关联资料查看。
- 只读项目浏览但禁止修改。
- 显式选择资料作为某次智能创作参考。

## 非目标

- 不建立第二套 Search / Navigation。
- 不把研究资料自动提升为 Canon。
- 不默认把全部资料塞入 ConstraintPackage。
- 不做任意 PDF/DOCX/HTML 深度解析。
- 不做通用云资料同步、在线收藏夹或网页抓取服务。
- 不引入与 Research 无消费关系的通用资产插件系统。

## 安全与隐私

- 数据完全本地。
- 不保存不必要的外部绝对路径。
- Renderer 不允许直接读取文件系统。
- 附件预览通过受控协议/具名接口。
- 外部链接打开必须经过现有安全边界，不允许附件 HTML 获取本地文件权限。
- AI 请求只有作者显式选择的资料可进入 Provider 输入。
- 危险扩展名、路径穿越、超限文件和 MIME/扩展名异常必须 fail-closed。

## 性能

- 研究笔记分页/虚拟化。
- 附件目录不在 Renderer 常驻扫描。
- SearchTools 只索引允许文本与元数据。
- 500万字项目 + 大量研究笔记时，正文搜索与资料搜索不得相互阻塞。
- Backup / Restore / Clone 的附件复制与验证流式处理，禁止一次性把大型附件集合全部读入内存。
- Hash 计算不得阻塞正文输入主线程或 SQLite 写队列。

## 自动化测试

至少覆盖：

### Artifact Lifecycle

- 数据库 + 附件完整备份。
- 附件缺失 / Hash 损坏 / 非法路径检测。
- Project Move / Clone / Backup / Restore 附件完整性。
- 大量/大体积附件流式验证。
- 新增 Research 表遗漏 ProjectClonePolicy 时 fail-closed。

### Research

- Note CRUD / archive / restore。
- 标签与跨对象关联。
- 跨项目关联拒绝。
- 附件路径穿越、危险文件名、超限文件拒绝。
- 同内容 Hash 与重复导入行为。
- 删除/恢复引用一致性。
- 只读项目。

### Search / AI

- SearchTools `research` 来源索引、重建与删除失效。
- Research 搜索与正文搜索共用统一结果协议。
- 作者显式 AI 参考资料与未显式选择隔离。
- 资料不得自动进入故事权威写路径。

验证矩阵沿用当前正式质量体系；影响 Recovery / Clone / Search / 大规模项目资产路径时触发相应重型风险路由，不恢复无差别全量验证。

## Evidence

保存到：`docs/test-evidence/M12-02/`

必须额外保存：

- Project Artifact Set 定义与 manifest 示例。
- 受管附件 Backup / Restore / Clone / Move 完整性证据。
- 附件损坏/缺失/非法路径失败证据。
- SearchTools 单一搜索权威证明。
- AI 显式选择边界证明。

## 回滚策略

整体回滚 Research UI 与领域能力；附件和笔记 Migration 保持 append-only。

一旦 Project Artifact Set 已经进入正式项目格式，回滚不得让现有受管附件在恢复链中变成不可识别孤儿资产；恢复/克隆代码必须继续识别既有 artifact manifest/version。

## 完成条件

- `P1-RESEARCH` 完整落地。
- `project.sqlite + managed attachments` 形成明确、可验证的 Project Artifact Set。
- Backup / Restore / Move / Clone 对受管附件形成完整生命周期闭环，不再把单数据库成功误报为完整项目成功。
- 研究资料可本地持久化、检索、关联、备份和恢复。
- Research 新表全部进入 ProjectClonePolicy，派生索引按重新生成策略处理。
- Research 进入现有 SearchTools，不产生第二套搜索权威。
- 附件不突破项目路径与 Renderer 安全边界。
- 研究资料默认不成为故事事实或 AI 上下文，只有作者显式选择才参与单次生成。

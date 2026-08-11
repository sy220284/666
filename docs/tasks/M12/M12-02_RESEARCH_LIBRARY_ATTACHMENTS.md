# M12-02 研究资料库与本地附件

> 状态：Planned  
> 里程碑：M12 作者生产力与长期项目增强  
> 优先级：P1  
> 执行分支：`work`  
> 目标分支：`main`

## 目标

承接原 V1.0 P1 `P1-RESEARCH 研究笔记与本地附件`，建立项目内研究资料库，使作者可以保存资料笔记、来源说明和本地附件，并将资料与章节、人物、地点、势力、事件、伏笔等稳定对象关联。资料库只服务创作参考，不成为 Canon/Continuity 权威故事事实。

## 依赖

- M12-01 有效 VERIFIED。
- 复用现有项目路径边界、SearchTools/FTS、Atomic Navigation、Backup/Restore、ProjectClonePolicy 和错误语义。

## 领域模型

新增具名 Research 领域，至少包含：

### ResearchNote

- id / project_id
- title
- body
- source_type / source_label / source_uri nullable
- tags
- created_at / updated_at
- archived_at nullable

### ResearchAttachment

- id / project_id
- note_id nullable
- display_name
- media_type
- size_bytes
- content_hash
- managed_relative_path
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

## 附件存储

附件采用项目工作区内的受管本地副本，不把任意绝对路径作为业务真源。

要求：

1. 导入附件由 Main/Core 受控复制到项目专用附件目录。
2. 文件名、相对路径、扩展名和 MIME 必须规范化并防路径穿越。
3. 使用 SHA-256 或现有统一 Hash 记录内容身份。
4. 单文件大小、单项目附件总量和允许预览类型必须有明确上限。
5. 删除 Note 时不得静默删除仍被其他对象引用的附件。
6. Backup/Restore/Move/Clone 必须覆盖受管附件并校验 Hash。
7. 不自动执行附件中的脚本、宏、外部对象或可执行内容。

## 资料编辑与检索

支持：

- Markdown/纯文本研究笔记。
- 标签。
- 来源说明。
- 附件关联。
- 按人物/章节/标签/来源筛选。
- 归档/恢复。
- 从资料跳到对应故事对象，从故事对象查看关联资料。

ResearchNote 文本与允许索引的附件元数据接入现有 SearchTools/FTS；禁止新建第二套全文搜索。

附件正文解析默认不做。若未来需要 PDF/DOCX 内容索引，必须单独定义安全解析白名单和资源上限，不能在本任务中直接把任意附件内容送入 AI。

## AI 使用边界

资料默认不自动进入 ConstraintPackage。

作者显式选择“作为本次参考资料”时：

1. 通过稳定 Research ID 加入一次生成请求。
2. Core 校验项目归属、大小和允许类型。
3. 记录来源与裁剪信息。
4. 不把研究资料自动提升为 P0/P1 权威事实。

如作者确认资料内容成为设定，仍必须通过 Canon/Continuity/Planning 的既有作者确认写路径。

## UI

新增“研究资料”工作区或现有数据工具中的稳定入口，至少包含：

- 笔记列表/搜索/标签。
- 笔记编辑。
- 附件拖入/选择导入。
- 安全预览允许类型。
- 关联人物/章节/事件等对象。
- 资料 → 故事对象精准跳转。
- 故事对象 → 关联资料查看。
- 只读项目浏览但禁止修改。

## 安全与隐私

- 数据完全本地。
- 不保存不必要的外部绝对路径。
- 不允许 Renderer 直接读取文件系统。
- 附件预览通过受控协议/具名接口。
- 外部链接打开必须经过现有安全边界，不允许附件 HTML 获取本地文件权限。
- AI 请求只有作者显式选择的资料可进入 Provider 输入。

## 性能

- 研究笔记分页/虚拟化。
- 附件目录不在 Renderer 常驻扫描。
- SearchTools 只索引允许文本与元数据。
- 500万字项目 + 大量研究笔记时，正文搜索与资料搜索不得相互阻塞。

## 自动化测试

至少覆盖：

- Note CRUD / archive / restore。
- 标签与跨对象关联。
- 跨项目关联拒绝。
- 附件路径穿越、危险文件名、超限文件拒绝。
- 同内容 Hash 与重复导入行为。
- 删除/恢复引用一致性。
- Project Move / Clone / Backup / Restore 附件完整性。
- SearchTools 资料索引与删除失效。
- 只读项目。
- 作者显式 AI 参考资料与未显式选择隔离。

验证矩阵沿用当前正式质量体系。

## Evidence

保存到：`docs/test-evidence/M12-02/`

## 回滚策略

整体回滚 Research UI 与领域能力；附件和笔记 Migration 保持 append-only。回滚不得影响正文、Canon、Continuity、Planning 和 GenerationRun 权威数据。

## 完成条件

- `P1-RESEARCH` 完整落地。
- 研究资料可本地持久化、检索、关联、备份和恢复。
- 附件不突破项目路径与 Renderer 安全边界。
- 研究资料默认不成为故事事实或 AI 上下文，只有作者显式选择才参与单次生成。

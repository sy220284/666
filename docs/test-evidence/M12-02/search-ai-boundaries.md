# M12-02 SearchTools 与 AI 边界证据

## 单一搜索权威

ResearchNote 文本与允许索引的附件元数据扩展既有 `SearchSourceType` / SearchTools / FTS 写入、查询、重建与失效链。结果继续走统一 `SearchProjectResult` 与 `AuthorNavigationTarget`；Renderer 不扫描附件目录，也没有 Research 专用第二全文搜索服务。

## AI 显式选择

Renderer 只维护作者当前显式勾选的 Research Reference。创建 GenerationRun 时 Core：

1. 校验 Research ID / Attachment ID 属于当前项目；
2. 对选中引用生成确定性 snapshot，并记录 selection hash、来源顺序、内容 hash、included chars / trimmed；
3. Provider 调用前仅在 snapshot 非空时附加“作者显式研究资料”消息；
4. 未显式选择时 `getResearchReferenceMessage()` 返回 `null`，Provider 输入不增加 Research；
5. Research 消息明确声明其不具备 Canon / Continuity / Planning 权威性。

`tests/integration/m12-02-generation-research-reference.test.ts` 覆盖显式选择与未选择隔离。

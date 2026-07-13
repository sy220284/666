# M4-03 TXT、Markdown与DOCX导入导出

> 状态：Planned  
> 优先级：P0  
> 分支：`feat/m4-import-export`

## 目标

安全导入已有作品并从选定Version稳定导出交付文件。

## 依赖

M1、M2完成。

## 关联

- 需求：REQ-034、REQ-035
- 验收：P0-048—P0-050

## 必读文档

- `docs/security/THREAT_MODEL.md`
- `docs/contracts/ERROR_CODES.md`
- `docs/ui/SCREEN_SPECIFICATIONS.md`
- `docs/testing/SECURITY_TEST_CASES.md`

## 实施内容

1. TXT编码候选：UTF-8、UTF-16、GB18030；低置信度人工选择。
2. Markdown基础结构解析。
3. DOCX只提取段落、标题和允许的基础格式。
4. 限制解包总大小、文件数、压缩比和路径；忽略宏、OLE和外部资源。
5. 生成ImportPlan：分章预览、合并、拆分、重命名和取消。
6. 提交前创建恢复点，单事务导入。
7. 从选定Version导出TXT、Markdown和DOCX。
8. 使用临时文件、验证和原子重命名。

## 测试

不同编码、空文档、异常DOCX、ZIP路径穿越、取消、分章调整、目标文件冲突、导出失败和往返一致性。

## 完成条件

预览阶段项目数据库不变化；异常输入不留下临时内容；导出不读取未确认Candidate或Renderer HTML。

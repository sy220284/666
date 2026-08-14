# M12-02 Project Artifact Set

## 权威集合

```text
Project Artifact Set
├─ project.sqlite
└─ managed attachments
   └─ artifacts/research/<stable managed file>
```

Research Attachment 的数据库记录保存稳定 `managed_relative_path`、artifact identity、`content_hash`、`size_bytes`、`media_type`，外部导入文件绝对路径不作为业务真源。

## Backup manifest 示例

```json
{
  "schemaVersion": 1,
  "projectId": "<project-id>",
  "backupId": "<backup-id>",
  "files": [
    {
      "artifactId": "<attachment-id>",
      "artifactType": "research_attachment",
      "relativePath": "artifacts/research/<managed-file>",
      "mediaType": "text/plain",
      "sizeBytes": 1234,
      "sha256": "<64-hex-sha256>"
    }
  ]
}
```

附件 Hash 通过流式读取计算；复制前后均校验大小与 SHA-256。完整恢复点只有数据库和全部受管附件均验证成功后才成立。

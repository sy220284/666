# M12-02 受管附件生命周期证据

- **Backup**：`project-artifact-backup.ts` 从备份数据库读取 Research Attachment inventory，校验 live managed file，复制到 `<backupId>.artifacts`，写入 `<backupId>.artifacts.json`，复制后再次验证大小与 SHA-256。
- **Restore**：恢复前完整校验 manifest identity、相对路径、文件类型、大小与 SHA-256；附件先进入 staging/partial 路径，验证后原子 rename，不允许发布半恢复项目。
- **Move**：以整个 `.worldforge` 工作区为移动单位；M12-02 集成测试写入真实受管附件并验证移动后内容/相对路径仍正确。
- **Clone**：Research 新表进入 `PROJECT_CLONE_POLICY`；克隆时新 projectId 与内部引用按既有 remap/preserve 规则处理，附件复制并校验，派生搜索索引重新生成。
- **Cleanup**：删除恢复点时同步清理 artifact bundle 与 manifest，避免残留孤儿备份。

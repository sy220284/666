# WorldForge 标准错误码

> 状态：Approved  
> 目标：使Renderer能够稳定展示错误、判断是否重试，并避免将内部堆栈和敏感路径直接暴露给用户。

## 1. 格式

```text
<DOMAIN>_<CATEGORY>_<NUMBER>
```

错误对象：

```ts
interface WorldForgeError {
  code: string;
  message: string;
  retryable: boolean;
  userAction?: string;
  details?: Record<string, unknown>;
}
```

`message`面向用户，`details`只允许安全字段。内部堆栈写入受控诊断日志，不通过IPC返回。

## 2. 通用错误

| 错误码 | 含义 | 可重试 | 推荐处理 |
|---|---|---:|---|
| `COMMON_INVALID_INPUT_001` | 输入未通过Schema校验 | 否 | 标记字段或提示操作无效 |
| `COMMON_NOT_FOUND_002` | 目标不存在或已删除 | 否 | 刷新页面并返回安全位置 |
| `COMMON_CONFLICT_003` | 当前状态与操作基线冲突 | 否 | 打开冲突处理或重新加载 |
| `COMMON_CANCELLED_004` | 用户取消任务 | 否 | 结束进度，保留可用结果 |
| `COMMON_TIMEOUT_005` | Core未在等待窗口内返回最终结果，操作可能仍已完成 | 否 | 刷新权威状态，确认结果后再决定是否重试 |
| `COMMON_INTERNAL_999` | 未分类内部错误 | 视情况 | 记录诊断ID，不显示堆栈 |

## 3. 项目与路径

| 错误码 | 含义 |
|---|---|
| `PROJECT_ALREADY_OPEN_001` | 项目已打开 |
| `PROJECT_PATH_MISSING_002` | 工作空间路径不存在 |
| `PROJECT_PATH_OUTSIDE_SCOPE_003` | 路径不在允许范围 |
| `PROJECT_ID_MISMATCH_004` | 命令项目ID与活动项目不一致 |
| `PROJECT_READ_ONLY_005` | 项目处于只读状态 |
| `PROJECT_MOVE_FAILED_006` | 项目迁移失败，原项目未修改 |
| `PROJECT_INCOMPATIBLE_NEWER_007` | 项目Schema高于当前应用支持版本 |

## 4. 数据库与Migration

| 错误码 | 含义 | 推荐处理 |
|---|---|---|
| `DB_OPEN_FAILED_001` | 数据库无法打开 | 提供恢复或只读打开 |
| `DB_BUSY_TIMEOUT_002` | 写入等待超时 | 重试并记录性能指标 |
| `DB_INTEGRITY_FAILED_003` | 完整性检查失败 | 停止写入，进入恢复 |
| `DB_FOREIGN_KEY_FAILED_004` | 外键检查失败 | 阻止提交 |
| `DB_MIGRATION_FAILED_005` | Migration失败 | 恢复迁移前备份 |
| `DB_MIGRATION_CHECKSUM_006` | 已应用Migration校验值不一致 | 只读诊断 |
| `DB_SCHEMA_UNSUPPORTED_007` | Schema版本不受支持 | 提示升级应用或恢复 |
| `DB_WRITE_QUEUE_STOPPED_008` | 写队列已停止 | 重新打开项目 |

## 5. Draft、锁定与版本

| 错误码 | 含义 |
|---|---|
| `DRAFT_REVISION_CONFLICT_001` | baseRevision与当前Revision不一致 |
| `DRAFT_BLOCK_HASH_CONFLICT_002` | 目标块内容已变化 |
| `DRAFT_BLOCK_LOCKED_003` | 操作涉及锁定块；`details.lockConflict`列出被删除、修改或移动的logicalBlockId及整批跳过数量 |
| `DRAFT_PATCH_INVALID_004` | Patch结构或顺序无效 |
| `DRAFT_NO_ACTIVE_005` | 章节没有活动Draft |
| `VERSION_IMMUTABLE_001` | 尝试修改不可变Version |
| `VERSION_CREATE_FAILED_002` | Version创建事务失败 |
| `CANDIDATE_ALREADY_RESOLVED_001` | Candidate已采用或丢弃 |
| `CANDIDATE_BASE_CONFLICT_002` | Candidate基线已过期 |
| `CANDIDATE_PARTIAL_RESTRICTED_003` | 部分候选不能执行该操作 |

## 6. AI与Provider

| 错误码 | 含义 | 可重试 |
|---|---|---:|
| `AI_PROVIDER_NOT_CONFIGURED_001` | Provider未配置 | 否 |
| `AI_CREDENTIAL_MISSING_002` | 系统凭据不可用 | 否 |
| `AI_CONNECTION_FAILED_003` | 无法连接服务 | 是 |
| `AI_AUTH_FAILED_004` | 认证失败 | 否 |
| `AI_RATE_LIMITED_005` | Provider限流 | 是 |
| `AI_REQUEST_TIMEOUT_006` | 模型请求超时 | 是 |
| `AI_CONTEXT_OVERFLOW_007` | 约束包超过上下文 | 否，需裁剪 |
| `AI_OUTPUT_INVALID_008` | 结构化输出解析失败 | 是 |
| `AI_STREAM_INTERRUPTED_009` | 流式连接中断 | 是，可保存部分候选 |
| `AI_MODEL_UNSUPPORTED_010` | 当前任务不支持该模型 | 否或允许风险继续 |
| `AI_RUN_NOT_FOUND_011` | GenerationRun不存在 | 否 |
| `AI_RUN_ALREADY_FINISHED_012` | 已结束任务不能再次取消 | 否 |

## 7. 导入导出

| 错误码 | 含义 |
|---|---|
| `IMPORT_FORMAT_UNSUPPORTED_001` | 格式不支持 |
| `IMPORT_ENCODING_UNCERTAIN_002` | 文本编码无法可靠判断 |
| `IMPORT_ARCHIVE_LIMIT_003` | 文档解包超过安全限制 |
| `IMPORT_CONTENT_EMPTY_004` | 未提取到可用正文 |
| `IMPORT_PLAN_STALE_005` | 预览计划已过期 |
| `IMPORT_COMMIT_FAILED_006` | 导入提交失败且已回滚 |
| `EXPORT_VERSION_REQUIRED_001` | 未选择可导出的Version |
| `EXPORT_TARGET_EXISTS_002` | 目标文件已存在 |
| `EXPORT_WRITE_FAILED_003` | 临时文件或原子重命名失败 |

## 8. 备份与恢复

| 错误码 | 含义 |
|---|---|
| `BACKUP_CREATE_FAILED_001` | 备份创建失败 |
| `BACKUP_VERIFY_FAILED_002` | 备份完整性或Hash失败 |
| `BACKUP_SPACE_LOW_003` | 磁盘空间不足 |
| `BACKUP_LAST_VERIFIED_PROTECTED_004` | 禁止删除最后一份已验证备份 |
| `RESTORE_SOURCE_INVALID_001` | 恢复源无效 |
| `RESTORE_TARGET_CONFLICT_002` | 目标目录冲突 |
| `RESTORE_VERIFY_FAILED_003` | 恢复副本验证失败 |

## 9. 搜索、校验和任务

| 错误码 | 含义 |
|---|---|
| `SEARCH_INDEX_UNAVAILABLE_001` | FTS索引不可用，可重建 |
| `SEARCH_REPLACE_PLAN_STALE_002` | 替换预览已过期 |
| `VALIDATION_INPUT_STALE_001` | 校验对应Version已变化 |
| `TASK_NOT_CANCELLABLE_001` | 当前阶段不可取消 |
| `TASK_EVENT_GAP_002` | 事件序号缺失，需要任务快照 |
| `TASK_FAILED_003` | 通用长任务失败 |

## 10. UI处理规则

- 数据安全类错误：持续显示并提供恢复动作。
- 可重试网络错误：提供重试，不自动无限重试。
- Revision和Hash冲突：打开冲突处理，不显示为普通Toast。
- 锁定冲突：显示安全的冲突块与整批跳过摘要；不得暗示未冲突操作已写入。
- 用户取消：不显示红色错误。
- 内部错误：显示诊断ID和安全说明，不泄露本地路径、SQL和正文。

## 11. 维护规则

新增错误码必须：

1. 在对应Schema中使用枚举或受控字符串。
2. 增加至少一个失败路径测试。
3. 定义Renderer行为和是否可重试。
4. 不复用已发布错误码表达新语义。

# M8-06 已知限制

- M8-06只硬化发布资格与任务治理，不执行真实GitHub Release，也不验证GitHub环境保护规则、人工环境审批或第三方下载体验。
- 提交可达性校验依赖完整Git历史；Release Workflow已在资格检查和发布前复核阶段配置`fetch-depth: 0`。其他调用方若使用浅克隆，发布门会安全失败。
- 独立任务与被吸收历史任务以`TASK_INDEX.md`的“被吸收的需求来源”章节边界区分。章节结构异常时可能导致发布被额外阻断，不会造成错误放行。
- `lastVerifiedTask.commit`与`evidenceHead`只验证为当前发布提交的可达祖先；Squash来源补丁等价与Evidence文件完整性继续由任务治理和Evidence门负责。
- Windows代码签名、macOS签名与公证、系统安装器、自动更新和安装生命周期仍不属于V1.0自用便携交付范围。

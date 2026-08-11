# M12-04 可选本地项目数据库加密

> 状态：Planned  
> 里程碑：M12 作者生产力与长期项目增强  
> 优先级：P2  
> 执行分支：`work`  
> 目标分支：`main`

## 目标

承接原 V1.5“可选实时项目数据库加密”，为有本地静态数据保护需求的作者提供按项目启用的数据库加密，同时保持 WorldForge 的本地优先、单一 `project.sqlite` 权威、备份/恢复和跨平台发布能力。

本功能默认关闭，属于可选安全增强，不改变未加密项目的现有行为。

## 依赖

- M12-03 有效 VERIFIED。
- 复用现有 CredentialBroker / OS Credential Store、ProjectWorkspace、Migration、Backup/Restore、ProjectClonePolicy、Recovery、ReadOnly 和跨平台构建体系。

## 技术原则

1. 禁止自研数据库加密算法。
2. 仅允许经过广泛审计、可在当前 Electron/Node/SQLite 架构中稳定集成的 SQLite 加密后端，例如满足要求的 SQLCipher 兼容实现。
3. 加密密钥不得进入 `project.sqlite`、`app.sqlite` 普通配置、项目目录、日志、诊断包或 Git 仓库。
4. 密钥只存 OS Credential Store，由现有 CredentialBroker 或等价受信 Core/Main 边界读取。
5. Renderer 永远不接触明文密钥。
6. 无法可靠满足三平台构建、Migration、恢复和性能要求时，本任务必须 fail-closed，不允许降级成自研文件加密。

## 项目加密状态

项目 Manifest 或等价非秘密元数据只记录：

- encryption enabled/disabled
- encryption format/version
- credential reference id

不得记录密钥、口令派生结果或可直接恢复密钥的材料。

## 启用加密

必须采用安全迁移流程：

```text
当前项目检查
→ 创建 verified recovery point
→ 生成/取得 OS Credential key
→ 写入独立 encrypted staging database
→ integrity / schema / data verification
→ fsync / atomic swap
→ 重新打开验证
→ 完成
```

要求：

1. 原数据库在新加密副本完整验证前不得删除。
2. 任何阶段失败都必须恢复到明确可打开状态。
3. 同一 requestId 重试必须幂等。
4. 启用操作期间项目进入受控写入状态，禁止并发 Draft/Generation 权威写入穿透迁移边界。

## 解密与密钥轮换

支持：

- 显式关闭项目加密并安全迁移回普通 SQLite。
- 显式轮换项目加密密钥。

两者均必须使用 staging + verify + atomic swap，不允许原地不可恢复修改。

## 项目打开与只读策略

- 加密项目缺少密钥：拒绝普通可写打开，返回稳定可解释错误。
- Credential Store 暂时不可用：不得猜测密钥或创建空数据库。
- 数据库完整性异常：继续遵守现有 read-only / recovery 策略。
- 高版本 encryption format：fail-closed。

## Backup / Restore / Clone / Move

### Backup

数据库备份保持加密状态，备份产物不得自动解密落盘。

### Restore

恢复副本仍为加密项目，并绑定正确 credential reference 策略。恢复不得覆盖原项目。

### Clone

必须明确：

- clone 使用新 projectId。
- 默认生成新的 encryption key/credential ref，禁止两个项目长期共享同一密钥身份。
- 业务 ID remap 与现有 ClonePolicy 保持一致。

### Move

移动项目不得改变加密状态或密钥身份。

## 导入导出

- 正文 TXT/Markdown/DOCX 导出仍按作者显式操作生成正常文档，不把项目加密状态强加到普通导出格式。
- 诊断包、日志和 Evidence 不得包含密钥或数据库明文。
- 如未来增加完整项目包导出，必须另行定义加密项目包格式；本任务不提前建设。

## 附件边界

M12-02 的受管附件默认不因数据库加密自动获得文件级加密。

UI 必须明确说明“项目数据库已加密”的实际覆盖范围，禁止让作者误以为项目目录中的所有附件都被加密。

若未来需要附件加密，应单独建立文件加密设计，不在本任务中隐式扩展。

## 性能

必须对比未加密与加密项目：

- 启动/打开。
- Draft autosave。
- Version。
- SearchTools/FTS。
- StoryKnowledge Projection。
- ConstraintPackage。
- Backup/Restore。
- 300万/500万字 corpus。

性能退化必须有可解释预算；不能以破坏写入安全或关闭同步/完整性保证换取速度。

## 跨平台

Windows、macOS、Linux 必须验证：

- native dependency 打包。
- 安装/升级。
- OS Credential Store。
- 数据库打开/迁移。
- Backup/Restore。
- Release 签名/校验。

任一正式支持平台无法可靠发布时，不得把该平台标记为支持项目加密。

## 自动化测试

至少覆盖：

- 新项目启用加密。
- 现有大项目启用加密。
- 解密。
- 密钥轮换。
- staging 中断与恢复。
- 写队列并发阻断。
- Credential 缺失/拒绝/暂时不可用。
- 错误密钥。
- 数据库损坏。
- Backup/Restore/Clone/Move。
- 300万/500万字性能。
- 三平台构建与 smoke test。
- 日志/诊断包密钥泄漏扫描。

验证矩阵沿用当前正式质量与 Release 体系。

## Evidence

保存到：`docs/test-evidence/M12-04/`

必须额外保存：

- 加密后端选择与许可证/维护性结论。
- 三平台 native build Evidence。
- 启用/解密/轮换 fault chain。
- 明文/密钥泄漏扫描。
- 大项目性能对比。

## 回滚策略

应用代码可以整体回滚，但已加密项目的数据格式必须保持可读取迁移路径。Migration 与 encryption format 只能向前兼容，禁止通过删除历史支持让用户项目失去可恢复性。

## 完成条件

- 可按项目安全启用、关闭和轮换加密。
- 密钥只存在于受信 OS Credential Store 边界。
- 未加密项目行为不受影响。
- Backup/Restore/Clone/Move/Migration 全链路闭环。
- 三平台与 300万/500万字性能通过正式验收。
- 不存在自研密码学、明文密钥落盘或 Renderer 密钥暴露。

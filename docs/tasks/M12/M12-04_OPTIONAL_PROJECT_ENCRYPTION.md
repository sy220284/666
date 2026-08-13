# M12-04 可选本地项目数据库加密

> 状态：Planned  
> 里程碑：M12 作者生产力与长期项目增强  
> 优先级：P2  
> 执行分支：`work`  
> 目标分支：`main`

## 目标

承接原 V1.5“可选实时项目数据库加密”，先完成数据库加密后端的 Phase 0 Go/No-Go 技术验证；只有在当前 Electron/Node/SQLite、三平台构建、恢复和供应链边界内证明可行后，才为有本地静态数据保护需求的作者实现按项目启用的数据库加密。

本功能默认关闭，属于可选安全增强，不改变未加密项目的现有行为。若 Phase 0 结论为 No-Go，本任务允许以完整 Evidence 收口，不得为了“完成功能”强行替换稳定数据库底座或引入自研密码学。

## 依赖

- M12-02 有效 VERIFIED，使 `project.sqlite + managed attachments` 的项目资产边界先稳定。
- 复用现有 ProjectWorkspace、Migration、Backup/Restore、ProjectClonePolicy、Recovery、ReadOnly、写队列和跨平台构建体系。
- 复用现有 OS SafeStorage / Credential Store 安全底座，但项目数据库密钥必须拥有独立领域模型，不得直接伪装成 Provider Credential。

## Phase 0：Go / No-Go 技术门

任何数据库驱动、Migration、项目格式或发布链变更前，必须先完成独立 Spike/Evidence。

### 必验项

1. 当前 `node:sqlite` / `DatabaseSync` 使用面与候选加密后端 API 兼容性。
2. 是否必须替换 SQLite driver、SQLite build 或 native addon；影响面必须穷尽到 Core、Search、Recovery、Migration、测试与 Electron packaging。
3. FTS5、WAL、事务、busy timeout、完整性检查和现有 Migration 语义是否保持。
4. Windows / macOS / Linux native build、Electron ABI、安装升级、签名/公证和发布产物是否稳定。
5. Backup / Restore / Clone / Move / ReadOnly / Recovery 是否仍能保持现有安全语义。
6. SQLCipher 或候选实现的许可证、维护状态、SBOM、License Inventory 与供应链政策是否通过。
7. 未加密/加密项目在启动、Draft autosave、Version、SearchTools/FTS、ConstraintPackage、Backup/Restore 上的性能预算。
8. 故障恢复：错误密钥、密钥缺失、staging 中断、数据库损坏、升级失败是否都能 fail-closed。

### Go 条件

只有全部关键项有可重复 Evidence，且三平台、恢复、安全、供应链和性能没有不可接受退化时，才允许进入正式实现。

### No-Go 条件

任一核心条件无法可靠满足时：

- 不替换现有稳定 SQLite 底座。
- 不以应用层自研文件加密、字段加密或“伪 SQLCipher”绕过结论。
- 保存候选方案、失败点、影响面和未来重评触发条件。
- 任务可按“技术验证完成 / 功能暂不启用”收口。

## 技术原则

1. 禁止自研数据库加密算法。
2. 仅允许经过广泛审计、可在当前 Electron/Node/SQLite 架构中稳定集成的 SQLite 加密后端，例如满足要求的 SQLCipher 兼容实现。
3. 不预设“必须替换 `node:sqlite`”；后端选择由 Phase 0 Evidence 决定。
4. 加密密钥不得进入 `project.sqlite`、`app.sqlite` 普通配置、项目目录、日志、诊断包或 Git 仓库。
5. Renderer 永远不接触明文密钥。
6. 无法可靠满足三平台构建、Migration、恢复和性能要求时必须 fail-closed。

## ProjectKeyStore / SecureSecretStore

当前 Provider Credential 领域只服务模型连接。项目数据库密钥必须使用独立 `ProjectKeyStore` 或通用 `SecureSecretStore` 的项目密钥命名空间。

允许复用：

- OS SafeStorage / Credential Store adapter。
- 安全序列化、错误处理、受信 Main/Core 边界。

禁止复用：

- ProviderId 作为 project key identity。
- Provider Credential record 作为项目密钥记录。
- Renderer 可见的凭据模型。

项目密钥至少按 projectId + encryption format/version 建立稳定受信身份，并支持创建、读取、轮换、删除和恢复策略。

## 项目加密状态

项目 Manifest 或等价非秘密元数据只记录：

- encryption enabled/disabled
- encryption format/version
- credential/key reference id

不得记录密钥、口令派生结果或可直接恢复密钥的材料。

## 启用加密

仅在 Phase 0 = Go 后实施，并采用安全迁移流程：

```text
当前项目检查
→ 创建 verified recovery point
→ ProjectKeyStore 生成/取得 key
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
- OS Credential Store 暂时不可用：不得猜测密钥或创建空数据库。
- 数据库完整性异常：继续遵守现有 read-only / recovery 策略。
- 高版本 encryption format：fail-closed。

## Backup / Restore / Clone / Move

### Backup

数据库备份保持加密状态，备份产物不得自动解密落盘。M12-02 定义的受管附件继续按 Project Artifact Set 一并备份，但附件默认不因数据库加密自动获得文件级加密。

### Restore

恢复副本仍为加密项目，并绑定明确的 ProjectKeyStore 策略。恢复不得覆盖原项目，也不得把缺失密钥的恢复副本误报为可写成功。

### Clone

必须明确：

- clone 使用新 projectId。
- 默认生成新的 encryption key/key ref，禁止两个项目长期共享同一密钥身份。
- 业务 ID remap 与现有 ClonePolicy 保持一致。
- 受管附件沿用 M12-02 的 Clone/Hash 语义，与数据库密钥生命周期分离。

### Move

移动项目不得改变加密状态或密钥身份；ProjectKeyStore identity 不得依赖旧绝对路径。

## 导入导出

- 正文 TXT/Markdown/DOCX 导出仍按作者显式操作生成正常文档，不把项目加密状态强加到普通导出格式。
- 诊断包、日志和 Evidence 不得包含密钥或数据库明文。
- 如未来增加完整项目包导出，必须另行定义加密项目包格式；本任务不提前建设。

## 附件边界

M12-02 的受管附件默认不因数据库加密自动获得文件级加密。

UI 必须明确说明“项目数据库已加密”的实际覆盖范围，禁止让作者误以为项目目录中的所有附件都被加密。

若未来需要附件加密，应单独建立文件加密设计，不在本任务中隐式扩展。

## 性能与风险路由

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

若 M11-07 已建立 `longformScale` 风险子路由，本任务复用该子路由执行 300万/500万字专项；不得把超大 fixture 无条件塞入普通 performance 全套。最终仍聚合到现有 Performance Required Context，不新增平行 Required Gate。

## 跨平台与供应链

Windows、macOS、Linux 必须验证：

- native dependency 打包。
- 安装/升级。
- OS Credential Store / ProjectKeyStore。
- 数据库打开/迁移。
- Backup/Restore。
- Release 签名/校验。
- SBOM / License Inventory / lockfile supply-chain policy。

任一正式支持平台无法可靠发布时，不得把该平台标记为支持项目加密。

## 自动化测试

Phase 0 至少覆盖后端兼容、三平台构建、FTS5/WAL/Migration、许可证/SBOM、故障恢复与基准性能。

仅在 Go 后增加正式功能测试：

- 新项目启用加密。
- 现有大项目启用加密。
- 解密。
- 密钥轮换。
- staging 中断与恢复。
- 写队列并发阻断。
- ProjectKeyStore 缺失/拒绝/暂时不可用。
- 错误密钥。
- 数据库损坏。
- Backup/Restore/Clone/Move。
- 300万/500万字 longformScale 性能。
- 三平台构建与 smoke test。
- 日志/诊断包密钥泄漏扫描。

验证矩阵沿用当前正式质量与 Release 体系，按 Unified Risk Matrix 触发必要重型验证。

## Evidence

保存到：`docs/test-evidence/M12-04/`

Phase 0 必须保存：

- 候选加密后端与 `node:sqlite` 兼容性结论。
- 数据库驱动/SQLite 构建影响面。
- 加密后端许可证、维护性、SBOM 与供应链结论。
- 三平台 native build Evidence。
- FTS5/WAL/Migration/Recovery 兼容结论。
- 未加密/加密性能基准。
- 最终 Go / No-Go 决策及理由。

Go 后还必须保存：

- 启用/解密/轮换 fault chain。
- 明文/密钥泄漏扫描。
- 大项目性能对比。

## 回滚策略

若 Phase 0 No-Go，只回滚 Spike 代码并保留 Evidence，不改变用户项目格式。

若进入正式实现，应用代码可以整体回滚，但已加密项目的数据格式必须保持可读取迁移路径。Migration 与 encryption format 只能向前兼容，禁止通过删除历史支持让用户项目失去可恢复性。

## 完成条件

满足以下二者之一即可完成本任务：

### No-Go 闭环

- Phase 0 全部关键验证完成。
- 明确记录不可接受风险与未来重评条件。
- 未引入半成品数据库格式、未替换稳定底座、未引入自研密码学。

### Go + 功能闭环

- 可按项目安全启用、关闭和轮换加密。
- 项目密钥只存在于独立 ProjectKeyStore / 受信 OS Credential Store 边界。
- 未加密项目行为不受影响。
- Backup/Restore/Clone/Move/Migration 全链路闭环。
- 三平台与 300万/500万字专项性能通过正式验收。
- SBOM / License Inventory / supply-chain policy 全部通过。
- 不存在自研密码学、明文密钥落盘、Provider Credential 污染或 Renderer 密钥暴露。

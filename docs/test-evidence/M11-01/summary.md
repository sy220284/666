# M11-01 验证摘要

## 结论

M11-01 的最终工程实现已冻结在 PR #346 提交 `c16a90ed34685cd8828c5c98eb89cd35cb59e93b`，并完成完整 Draft 验证。

本轮完成中文作者体验与高频结构交互减负，同时接纳已独立治理并集成到 `work` 的永久工具链升级；工具链治理只改变工程验证与离线工具获取能力，不扩大 M11-01 产品功能边界。

## 冻结实现验证

实现提交：`c16a90ed34685cd8828c5c98eb89cd35cb59e93b`

GitHub Actions：

- Quality run `31393481910`: success。
- Security run `31393481445`: success。
- Performance run `31393481556`: success。
- Full Work Validation run `31393481895`: success。
- `quality / release-audit`: success。
- 静态检查：Workspace、边界、Format、Lint、TypeScript 全部成功。
- Unit、Integration、Migration、Coverage 全部成功。
- Electron E2E：33/33 success，运行 14.1 分钟；可视拆章 `structure-recovery` 与写作辅助链均通过，并上传 `desktop-e2e-evidence` Artifact。
- Linux、Windows、macOS package smoke 全部成功。
- Windows 原生 Microsoft Pinyin acceptance 成功。
- Toolchain export 成功，并生成 `worldforge-toolchain-quality-Linux-X64-c16a90ed34685cd8828c5c98eb89cd35cb59e93b` Artifact。

## 产品实现事实

- 作者展示术语统一为“作品核心、场景、AI建议稿、正文段落、人物与世界、AI设定建议、内容检查、修改任务”。
- `ProjectBrief` 用户可见入口收敛为“作品核心”。
- AI 设定建议可信度改为高/中/低；“修改后接受”支持文字、数字、是/否、多行清单等作者输入，不再要求作者编辑 JSON。
- 场景关联、从正文创建场景、拆章、跨章移段、知情来源均改为直接选择正文段落，并继续复用影响预览、锁定检查、`planHash`、恢复点和来源新鲜度保护。
- 原始技术值仍保留在技术详情中，不改变现有 StateProposal、数据库、IPC 和权威数据语义。

## 永久工具链集成验证

离线工具 Artifact 已独立下载复核：

- GitHub Artifact ID：`9064681503`，大小 `155915695` bytes。
- Artifact ZIP SHA256：`a7837c0449c57c9d2982119a28a9defa6637aba124c3517258a23bd8cc11cef9`，与 GitHub digest 一致。
- manifest 绑定冻结提交 `c16a90ed34685cd8828c5c98eb89cd35cb59e93b`。
- Node `24.18.1`、pnpm `11.21.0`、Prettier `3.9.6`、TypeScript `6.0.3`、ESLint `10.8.0`。
- Artifact 内 `SHA256SUMS.txt` 的 `package.json`、`pnpm-lock.yaml`、`manifest.json`、`toolchain-authority.json` 四项实际哈希全部匹配。
- pnpm full metadata cache 共 88 个 registry 包，普通 metadata 同为 88 个，包含 `pnpm.jsonl` 与 `lockfile-verified.jsonl`。
- pnpm 11 默认 24 小时 minimum release age 保持启用；只对 authority 精确锁定的 `pnpm@11.21.0` 记录单版本例外，其余工具包继续执行供应链年龄校验。
- Artifact 已在独立临时目录完成 `--offline --frozen-lockfile` 复验，不使用 `trustLockfile`，不关闭供应链验证。

## 最终状态语义

Runtime Schema 2 静态状态使用 `IMPLEMENTED`。PR #346 合并后，只有来源主线提交上的 `main-verification=success` 与 `task-verification/M11-01=success` 同时成立，M11-01 才形成有效 `VERIFIED`。

Stable 正式发行所需 Windows Authenticode 与 macOS Developer ID / notarization / stapling 仍属于独立发行凭据边界，本任务没有伪造生产签名事实。

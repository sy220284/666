# 仓库代码初步审计报告

作者：自动化审计（由 sy220284/666 仓库检索生成）
日期：2026-07-29

范围与方法
- 审计范围：在 main 分支上对仓库关键清单文件、脚本、包元数据与配置进行人工与自动化抽样审查，并生成本次初步审计报告。重点检查：根 package.json、AGENTS.md、docs/tasks/ACTIVE_TASK.*, scripts/*.mjs、apps/desktop/preload/package.json、packages/*/package.json 等。
- 已检索并参考的文件（示例）：
  - package.json
  - AGENTS.md
  - docs/tasks/ACTIVE_TASK.md / .json
  - scripts/release-tool.mjs
  - scripts/package-desktop.mjs
  - apps/desktop/preload/package.json
  - packages/prompts/package.json
- 注意：通过代码搜索工具返回的结果存在限制（10 条），因此本次审计为初步抽样审计；建议在后续阶段运行全面静态扫描、秘密检测与依赖风险扫描以获得完整结论。

高层结论（摘要）
1. 项目明确为本地优先、单一作者桌面应用（WorldForge），并在 AGENTS.md 中定义了严格的不可变不变量与执行流程，这为安全边界与合规提供了良好基础。
2. License：AGPL-3.0-only — 对外分发/打包时有较强的传染性（copyleft），在发布或与第三方集成前需法律评估。
3. 技术栈与构建：以 TypeScript 为主（仓库语言占比 ~94%），scripts 使用 pnpm（packageManager 指定 pnpm@11.13.0），Node 引擎要求 node >= 24。构建依赖 tsc、esbuild、Electron 等。
4. Release/packaging 脚本包含多项严格校验（例如 release-tool 限制只能在 main、要求 TASK_INDEX 中 RELEASE_TASK 已 Verified、校验版本一致性等），这对发布安全性是正面保障。
5. Electron 运行时管理：scripts 中有 ensureElectronRuntime 与打包脚本，installer 可能在构建时触发二进制下载。需确认这是否符合离线/审计政策并加入校验（见建议）。
6. 初步未发现明显的硬编码凭据，但未做全仓秘密扫描，强烈建议运行专用秘密扫描工具（trufflehog/ghd-scan/Detect Secrets 等）。

发现与风险项（详细）
1) 许可与分发风险
- 状况：根 package.json 明确 license 为 AGPL-3.0-only。
- 风险：AGPL 强制要求修改与衍生作品在网络提供时开源，若未来存在闭源分发或混合许可组件（尤其第三方闭源组件），可能导致合规风险。
- 建议：对外发布前与法律确认；在 docs 中记录许可影响与发布约束（若已有则指向），确保发行流程与 AGENTS 中的受控发布门一致。

2) 构建与运行时依赖管理
- 状况：package.json 指定 node >=24、pnpm@11；apps/desktop/preload/package.json devDependencies 中包含 electron（版本 43.1.1）与 esbuild (0.28.1) 等。
- 风险：
  - 固定且较旧的依赖（例如 esbuild 0.28.x）可能含已修复漏洞或兼容性问题；Electron 二进制若在构建时从网络下载，则构建环境依赖外部网络与源可用性。
  - Electron 下载过程如果不做校验，存在被中间人篡改或供应链风险。
- 建议：
  - 定期运行依赖漏洞扫描（npm audit / snyk / GitHub Dependabot）并修复关键/高危项。
  - 对 Electron 或其他二进制下载加入校验（校验 sha256 / 签名），或在 CI 中使用受控缓存/镜像以避免不受控的外部下载。

3) 脚本与发布约束
- 状况：scripts/release-tool.mjs 和 scripts/package-desktop.mjs 含有严格校验（例如 release-task 必须 Verified、只允许在 main 上发布、禁止跨平台打包等）。
- 风险/优点：这是正面的安全控制，但也要求维护任务索引与 verification evidence 的完整性；若 docs/tasks/ACTIVE_TASK.json 与实际分支/证据不同步，会阻断发布流程。
- 建议：将这些前提（TASK_INDEX、ACTIVE_TASK）纳入 CI 必检项；在合并前强制运行 release-tool 的校验路径以避免主线阻断。

4) 本地优先 / 隐私约束（AGENTS.INV-001）
- 状况：AGENTS.md 明确禁止云存储/云同步等能力，并将 project.sqlite 作为单一真源。
- 风险：代码中若引用外部同步、远程保存、或远程模型下载逻辑，可能违反不变量；目前抽样未发现此类实现，但未做全面静态扫描。
- 建议：执行 repo-wide 搜索以定位 "fetch(" 、"axios"、"openai"、"s3.amazonaws.com"、"gcs"、"sqs" 等模式；对可疑引用逐一评估，必要时在审计报告中标注为违规或待确认实现。

5) 秘密与配置泄露风险
- 状况：未在抽样中发现明显硬编码密钥，但未运行自动秘密扫描。
- 风险：开发者可能无意提交 .env、API_KEY、私钥片段等。
- 建议：立即运行自动秘密扫描工具（例如 trufflehog、gitleaks、GitHub Secret Scanning）；在 CI 中加入秘密检测门。

6) 类型/构建/测试质量
- 状况：仓库配置了详细的 lint/typecheck/test 脚本（见 package.json），并在 ACTIVE_TASK.json 列出了验证命令。
- 风险/优点：严格的质量检查流程有助于减少回归。风险在于本地 dev 环境与 CI 环境需严格一致（Node/Pnpm 版本），否则会产生“在我机器上能跑”的问题。
- 建议：在 README 或 CONTRIBUTING 中写明精确开发环境（node、pnpm）并在 CI 中固定使用相同版本；在 CI 中缓存 pnpm store 并锁定依赖快照。

行动建议（短期优先级）
1. 运行完整的仓库级自动检查：
   - pnpm install --frozen-lockfile
   - pnpm lint
   - pnpm typecheck
   - pnpm test
   - 运行静态秘密扫描（gitleaks/trufflehog）
   - 运行依赖漏洞扫描（npm audit / snyk / Dependabot）
2. 对 Electron 安装/下载流程做防护：
   - 在 CI 中预置 Electron 二进制并校验 sha256，或记录信任的镜像源；
   - 在 release-tool/package-desktop 中加入校验失败的明确错误信息和 remediation steps。
3. 合规性：与法律/作者确认 AGPL 发布约束，记录在 docs/releasing.md（或现有发布文档）中。
4. 建立并强制执行 CI 门：在 PR 模板/工作流中明确要求运行 ACTIVE_TASK 指定的 verification 列表（package.json 的脚本已列出）。

后续建议（中期/长期）
- 做一次全面的代码扫描（静态安全分析 + 依赖软件材料分析）并列出可复现的修复清单。
- 在 CI 中启用 Dependabot 或类似的自动依赖更新/告警，定期处理关键漏洞。
- 将 secrets 扫描纳入 commit hook（pre-commit）与 CI。
- 完成一个风险登记（Risk Register），记录发现、责任人、优先级与计划完成时间。

验证命令（可在本地或 CI 中运行）
- pnpm install --frozen-lockfile
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm test:unit
- pnpm test:integration
- pnpm test:e2e

本次操作说明
- 我已在 main 分支中创建并保存本次审计报告文件：docs/AUDIT_REPORT_2026-07-29.md

如需我继续：
- 我可以执行更深入的自动化扫描（秘密扫描、依赖漏洞扫描、repo-wide 搜索特定关键字），并将结果追加到本报告；
- 或按照您的优先级生成一个可执行的修复任务清单（按高/中/低排序并生成 PR 模板）；
- 如果需要，我可以把报告移动到仓库根目录或另一个您指定的位置。

----
报告结束。

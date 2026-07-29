# 自动化扫描结果（初步）

文件：docs/AUTOMATED_SCAN_RESULTS_2026-07-29.md
作者：自动化审计（由 sy220284/666 仓库检索生成）
日期：2026-07-29

说明与方法学
- 本次“自动化扫描”基于仓库内可用的静态分析资源与代码搜索：
  - 使用仓库内的审计/治理脚本（scripts/scan-secrets.mjs、scripts/ci-policy.mjs、scripts/workflow-structure-policy.mjs 等）代码审阅以理解既有自动化能力与强制策略；
  - 使用代码搜索（静态关键词与模式）在源代码中查找高风险模式（例如：私钥标识、硬编码令牌、高熵字符串、外部网络调用、二进制下载点等）；
  - 扫描结果为抽样/静态判定，受限于代码搜索工具的返回上限和运行环境（无法在此环境直接执行仓库脚本或 CI）。
- 限制：代码搜索结果可能不完整（搜索接口返回条目有限制）；我在报告中多次运行了关键词搜索，但不能替代本地/CI 实际执行的动态扫描（例如 gitleaks、npm audit、CodeQL、semgrep、依赖项实际安装与执行测试）。请在 CI/本地运行下述命令以获得最终、可佐证的发现。

我执行/参考了（仓库内现有资源）
- scripts/scan-secrets.mjs（内部实现了受控的 tracked-file 与 Git 历史扫描与 allowlist）
- tests/unit/scan-secrets.test.ts（单元测试覆盖扫描器）
- scripts/ci-policy.mjs、scripts/workflow-structure-policy.mjs（CI/工作流强制策略）
- scripts/release-tool.mjs、scripts/package-desktop.mjs（发布/打包校验逻辑）
- 多个 scripts/* 与 .github/governance/* 脚本，实施自动化门与政策

立即可复现的建议执行命令（在 CI 或本地运行）
- pnpm install --frozen-lockfile
- pnpm lint
- pnpm typecheck
- pnpm test
- node scripts/scan-secrets.mjs
- node scripts/scan-secrets.mjs --history
- pnpm audit --json || npm audit --json
- semgrep --ci || CodeQL 分析（若开启）

静态模式搜索与发现要点（摘要）
1) Secrets / 凭据
- 发现：仓库包含一个自带的 secrets 扫描器 scripts/scan-secrets.mjs 及其单元测试；.github/governance/secret-scan-allowlist.json 作为 allowlist 入口（CI/策略脚本引用）。
- 评估：存在成熟的秘密扫描流程，这是良好实践，但尚需实际在 CI/PR 中运行以覆盖提交历史（--history）并确认 allowlist 的健康状态。
- 建议：在 CI 的 security job 中强制执行 node scripts/scan-secrets.mjs --history，并把发现结果以 artifact 方式保存供人工复核。

2) 依赖与供应链
- 发现：包管理与版本策略明确（package.json 指定 pnpm、engines: node>=24）；apps/desktop/preload/package.json devDependencies 包含 electron 和 esbuild 等（electron@43.1.1，esbuild@0.28.1）。
- 评估：仓库已经在 release-tool 与 ci-policy 中要求依赖审计（workflow token 检查），但未能在本环境执行实际 audit。Electron 与二进制下载在构建时可能会触发网络下载，存在典型的供应链风险（中间人、镜像污染、未校验二进制）。
- 建议：把 pnpm audit / snyk / dependabot 报告作为 security gate；对 Electron 二进制使用固定校验（sha256 或签名），或在 CI 中使用缓存/受信镜像。

3) 远程调用与“本地优先”不变量
- 发现：代码中存在面向外部 Provider 的抽象（packages/core-service 中的 provider endpoint/adapter）。实现包含：
  - createBoundedProviderFetch（对 fetch 的响应体与 SSE 事件大小进行限流）；
  - Provider URL/endpoint 强制校验（packages/contracts/src/app-data.ts 中对 provider URL 与敏感键的检测）；
  - tests 验证 Provider endpoint 的边界。
- 评估：这些实现显示项目在允许外部 AI 提供方时采取了边界与限制措施（网络边界、SSE/响应体限额、禁止在 provider options 中直接写入 secret 等），这与 AGENTS.md 的本地优先原则共存（允许配置远端模型端点但需用户可配置与审查）。
- 建议：对 repository-wide 搜索 `fetch(`、`axios(`、`openai`、`anthropic`、`s3.amazonaws.com` 等以确认没有未受控的自动上传/同步代码。将 provider 相关调用的操作路径、记录与用户提示作为审计条目。

4) CI / 工作流治理
- 发现：.github/governance 与 scripts 中定义了丰富的策略（required-checks.json、main-protection.json、automerge-base-gate.mjs、workflow 验证脚本等），并有 scripts/workflow-structure-policy.mjs/ci-policy.mjs 来验证工作流结构与必备文件。
- 评估：治理设计良好且严格；风险在于：实际工作流配置必须与治理文件一致，否则会导致失败阻断。release-tool.mjs 检查 TASK_INDEX 中 RELEASE 任务为 Verified 等。
- 建议：在 CI 中把 workflow structure / governance 脚本作为早期失败点（pre-merge），并把 governance 报告作为 artifact 保存。

5) 证据与发布约束
- 发现：packages/testkit 中 evidence 管理对证据内容有凭据检测（assertNoCredentials），release-tool 强制 TASK_INDEX 中 release task 为 Verified。
- 评估：Evidence 管理包含凭据过滤与格式要求，降低泄露风险。但仍需在 Evidence 写入路径上强制 secrets 扫描。
- 建议：在写入 Evidence 的脚本或外围流程中再执行 assertNoCredentials 与脚本级 secrets 扫描。

具体文件中可疑或值得关注的条目（示例）
- apps/desktop/preload/package.json — 包含 electron、esbuild（注意二进制下载与版本）
  https://github.com/sy220284/666/blob/main/apps/desktop/preload/package.json
- scripts/scan-secrets.mjs — 内置秘密扫描器（支持历史扫描与 allowlist）
  https://github.com/sy220284/666/blob/main/scripts/scan-secrets.mjs
- packages/core-service/src/provider-adapter-runtime.ts — 有对远端 Provider 的 fetch 限流
  https://github.com/sy220284/666/blob/main/packages/core-service/src/provider-adapter-runtime.ts
- scripts/release-tool.mjs — 发布 gate 与资产收集及校验
  https://github.com/sy220284/666/blob/main/scripts/release-tool.mjs
- docs/AGENTS.md 与 docs/tasks/ACTIVE_TASK.* — 定义了本地优先、不可变不变量与任务验证流程
  https://github.com/sy220284/666/blob/main/AGENTS.md

总结结论（自动化扫描初步）
- 正面：仓库已有良好治理脚本（secret-scan、ci-policy、workflow-structure checks、release checks）、tests 覆盖关键安全逻辑（secret scan tests、provider endpoint tests、evidence secret filtering 等），显示安全/治理为一等公民。
- 需要补强：必须在 CI/PR 中实际执行以下动态扫描以获得最终结论：history-level secret scan（scripts/scan-secrets.mjs --history）、依赖漏洞审计（pnpm audit / snyk）、CodeQL / semgrep 应用安全扫描、以及对 Electron/二进制下载做校验与缓存策略。

后续（自动化扫描）执行建议
1. 在仓库的 security workflow 中加入或确保以下步骤：
   - node scripts/scan-secrets.mjs --history
   - pnpm install --frozen-lockfile
   - pnpm -w audit --audit-level=moderate 或 snyk test
   - semgrep --config=auto 或 CodeQL 分析
   - 把所有失败或发现作为 artifact 与 PR 注释（供人工复核）
2. 把 Electron 二进制下载校验（sha256 或签名）纳入 packaging 脚本（scripts/package-desktop.mjs / ensureElectronRuntime）或预置在 CI 缓存。
3. 定期（例如每周）运行 Dependabot / 自动依赖扫描与每次 PR 触发的轻量依赖检查。

附录：如何查看更多代码搜索结果
- 代码搜索返回有限条目；要在 GitHub Web UI 中查看更多搜索结果，请访问通用搜索（例如）：
  https://github.com/sy220284/666/search?q=fetch(%20&type=code
  https://github.com/sy220284/666/search?q=BEGIN+PRIVATE+KEY&type=code
  https://github.com/sy220284/666/search?q=OPENAI_API_KEY&type=code

---
此文档为自动化扫描的静态/抽样结果摘要；我可以继续：
- 在 CI 中创建 workflow（或本地脚本）以实际运行 scripts/scan-secrets.mjs --history、pnpm audit、semgrep/CodeQL，并把输出写入 artifacts；
- 把这些扫描输出（JSON/文本）收集并追加到本报告中；
- 或立即根据本结果生成一份待办/修复清单（已在下一文件生成）。

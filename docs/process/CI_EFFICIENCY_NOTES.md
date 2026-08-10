# CI Efficiency Acceptance

本轮只优化执行效率，不降低工程事实门槛。

验收目标：

- 当前 `main-verification` 失败时，后续 Fresh Ready 修复 PR 可以自动进入 healing merge，不再形成恢复死锁。
- 无任务 marker 的纯治理维护 PR 不需要创建 Runtime 或 Evidence；一旦出现产品代码、Runtime 或 Evidence 变化仍 fail-closed。
- 任务实现已在冻结 `implementationCommit` 上完成真实完整 Quality，且后续只有允许的 Evidence/Runtime/任务卡收口文件变化时，Ready Quality 复用冻结实现的完整产品矩阵，只重新执行当前 Head 静态检查、Release Audit 与最终聚合。
- 无法从 GitHub Actions 机器证明冻结实现曾真实执行 Unit、Integration、Migration、Coverage 与 Electron E2E 时，自动回退完整 Quality。
- 普通治理维护不触发产品 E2E/三平台 package；但 `quality.yml`、`quality-core.yml`、Release 或实际 package 实现/依赖发生变化时仍强制三平台 package smoke，避免为了提速跳过编排本身的发行验证。
- Security 永久保留 Ready 全历史 Secret Scan；依赖审计只在 package-manager 输入变化时执行；应用安全只在产品运行时、安全权威或依赖输入变化时执行。
- Performance 永久保留 Required Context，但普通治理/流程文档/非性能测试维护直接快速成功；产品运行时、依赖、性能测试或 `performance.yml` 自身变化才执行真实性能预算与 AI 协议基线。
- Main Verification 保持 post-merge 独立事实，不因任何前置复用或风险路由而降级。
- Work Synchronization 在受控 PATCH/CREATE 成功后允许 GitHub ref 短暂最终一致性窗口，最多短轮询 10 秒确认 `work == main`；真正未同步仍 fail-closed，并留下失败诊断 Artifact。

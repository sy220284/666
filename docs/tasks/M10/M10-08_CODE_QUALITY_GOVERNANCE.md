# M10-08 全量代码规范与结构原则治理

> 状态：Implemented  
> 优先级：P1  
> 执行分支：`work`  
> 目标分支：`main`  
> 主线基线：`21625e1e11e7c50071f0860d791e902637f0531f`

## 目标

修复静态质量门禁对 TSX、覆盖率与非 TypeScript 资产的覆盖盲区，统一编辑器、CLI 与 CI 的规范入口，并将代码结构判断从文件行数切换为职责内聚、依赖方向、状态所有权和公共接口稳定性。

## 启动偏离

任务启动时 `work` 比已验证 `main` 多 7 个 Toolchain Export 临时提交，最终差异仅包含工作流自写 `work` 和 `.github/toolchain-export/` 二进制分片。没有开放 PR，也没有产品代码变化。本任务在保留提交历史的前提下删除分片并恢复只读 Artifact 导出器，禁止强制覆盖未知工作。

## 实施范围

### 1. 全量格式与覆盖率

- Prettier 的 `format` 与 `format:check` 纳入 `ts`、`tsx`、测试、配置、CSS 与工作流文件。
- Coverage 将 Renderer 的 TSX 纳入真实分母。
- Vitest 测试发现范围支持 `.test.tsx`。
- 核心 `.ts` 继续按 Statements、Branches、Functions、Lines 四项执行 75% 聚合硬阈值。
- Renderer TSX 使用机器基线冻结最大未覆盖数量：Statements 2683、Branches 2322、Functions 969、Lines 2402；新增未测 TSX 会失败，真实改善后只能收紧。
- 新增永久策略检查与回归测试，锁定 TSX 不得再次从格式、报告或基线门禁中消失。

### 2. ESLint 配置一致性

- 将 `no-unused-vars` 从命令行字符串迁入 `eslint.config.mjs`。
- CLI、IDE 与 CI 统一读取同一配置。
- 在现有 `typescript-eslint` 能力范围内启用类型感知的 Promise、await 与 switch 穷尽检查；没有使用批量断言、disable 或空分支伪造通过。
- React Hooks 专项插件需要新增开发依赖与锁文件时，必须走独立、可复现的依赖治理，不在本任务手工伪造 lockfile。

### 3. CSS、SQL 与文本一致性

- CSS 保持 Prettier 全量覆盖，并增加不依赖新生产包的高置信静态检查。
- SQL Migration 增加命名顺序、危险无条件写入与文本格式检查；已发布历史回填按冻结截止版本读取，新 Migration 默认执行严格策略。
- 增加 `.editorconfig` 与 `.gitattributes`，统一 UTF-8、LF、末尾换行和跨平台文本行为。

### 4. 高内聚、低耦合结构规则

- 删除文件行数作为合并失败条件。
- 行数、导出数量与依赖数量仅作为观察指标。
- 循环依赖、跨层反向依赖、Feature 私有实现穿透和多写入真源继续阻断。
- 禁止为了压缩行数把单一完整功能机械拆成多个无语义文件。

### 5. 工具链边界

- Toolchain Export 恢复为 `workflow_dispatch`、`contents: read`、Artifact-only。
- 正式分支中的临时工具链分片已删除。
- 永久工作流不得提交工具、二进制产物、业务源码、任务状态或正式文档。

### 6. 文档同步

项目执行入口、结构治理规范、任务索引、任务模板和 Evidence 已同步，明确：

- 文件行数不参与合并资格；
- 拆分依据是职责、状态机、事务边界与依赖关系；
- 大文件允许保留完整业务内聚性；
- 质量门禁必须覆盖实际源文件类型，禁止“命令成功但范围漏检”；
- Coverage 按核心逻辑与 TSX 组合层双轨治理，禁止降低阈值、扩大基线或排除真实代码伪造通过。

## 非目标

- 不修改产品功能、业务协议、数据库 Schema 或 Migration 内容。
- 不新增生产依赖、云能力或额外分支。
- 不按固定行数强制拆分生产代码或测试。
- 不为了提升覆盖率排除真实 TSX 代码。
- 不要求纯 JSX 组合层机械达到与核心业务逻辑相同的单元测试百分比。
- 不手工编辑 `pnpm-lock.yaml` 伪造新开发依赖。

## 验收

1. 任意新增或改动 TSX 均进入 Prettier 检查。
2. Renderer TSX 进入 Coverage 分母，排除项逐项具备替代测试理由。
3. 核心 `.ts` 四项覆盖率均不低于 75%，TSX 最大未覆盖数量不得高于机器基线。
4. `eslint .` 与 `pnpm lint` 的 unused-vars 行为一致。
5. SQL 与 CSS 基础规范检查可在 CI 中独立失败并提供文件定位。
6. 超长但职责单一的文件不会因行数失败；循环和非法依赖仍会失败。
7. `.editorconfig` 与 `.gitattributes` 固化跨平台文本规则。
8. Toolchain Export 不再写 `work`，临时分片从 PR 最终差异删除。
9. 文档、Runtime、TASK_INDEX、测试和 Evidence 与实现处于同一受检 Head。
10. Format、Lint、Typecheck、Unit、Integration、Migration、Coverage、Security、Performance、E2E 与 Build 全部真实通过。

## 实施结果

Ready 实施 Head `437e639055bb852e9e63ecada0455d3a0b8a7954` 已完成全量复验：Task Governance、PR Policy、Evidence、Security、Performance 与 Quality 均通过；Unit 803、Integration 170、Migration 50、Coverage 1122、Electron E2E 33 项全部通过；核心 `.ts` 四项覆盖率保持 75% 以上，Renderer TSX 最大未覆盖数量未超过机器基线；Build 与 Linux、Windows、macOS 包冒烟全部通过。最终 Evidence 已绑定该实施 Head，等待文档收口 Head 的永久检查后受控合并。

## Evidence

保存到：`docs/test-evidence/M10-08/`

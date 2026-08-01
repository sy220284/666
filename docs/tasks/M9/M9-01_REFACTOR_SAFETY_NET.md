# M9-01 WorldForge V1.1 重构安全网

> 状态：Verified  
> 里程碑：M9 V1.1架构治理  
> 对应工作包：AR-01  
> 优先级：P0  
> 正式分支：`work/m9-01-refactor-safety-net`

## 1. 目标

在移动任何生产模块前建立可执行的重构安全网，冻结V1.0现有行为、依赖方向和结构债务基线，使后续Renderer、IPC与Core Service拆分能够逐PR验证、独立回退。

## 2. 必须实施

1. 新增同一工作区相对导入图与循环依赖检测。
2. 新增Renderer Feature依赖规则，冻结现存`writing → planning`例外并阻止新增倒置依赖。
3. 建立非生成源码结构预算；现有巨型文件进入显式债务清单，只允许缩小，不允许无边界增长。
4. 为结构检测器增加纯函数单元测试和真实仓库扫描。
5. 记录源码字符串测试耦合基线，为后续行为测试迁移提供清单。
6. 将结构检查接入现有`check:boundaries`永久门禁，不另建旁路质量体系。

## 3. 不可破坏的不变量

- 不修改产品功能、UI、数据库Schema、历史Migration、IPC Channel、协议版本、正式错误码或公开Bridge方法。
- 不移动Renderer、Main、Preload、Contracts或Core Service生产模块。
- 不改变V1.0发布产物与`v1.0.0-r1`。
- M8-09已验证的数据安全和生命周期修复必须保持有效。
- 当前结构债务只能通过带工作包编号的基线例外存在；禁止新增未登记例外。

## 4. 允许修改范围

- `scripts/`
- `tests/unit/`
- `tests/integration/`
- `tests/security/`
- `tests/e2e/`
- `docs/architecture/`
- `docs/tasks/`
- `package.json`

## 5. 禁止范围

- `apps/desktop/main/src/`
- `apps/desktop/preload/src/`
- `apps/desktop/renderer/src/`
- `packages/contracts/src/`
- `packages/core-service/src/`
- `packages/domain/src/`
- `packages/editor-core/src/`
- `packages/prompts/src/`
- `migrations/`
- 历史Evidence目录

## 6. 验收标准

- 人工构造的循环依赖能够被检测并给出完整路径。
- 新增`writing → planning`导入会失败；当前唯一历史导入通过显式例外保留至AR-02。
- 非基线文件超过结构预算会失败。
- 基线巨型文件超过登记上限会失败；缩小文件不会要求更新基线。
- 结构扫描在当前main源码上通过。
- 结构检测纯函数单测通过。
- 现有Quality、Security、Performance、Evidence、PR Policy与Task Governance门禁保持通过。

## 7. 验证矩阵

```text
pnpm task:validate
pnpm check:workspaces
pnpm check:boundaries
pnpm check:language
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:migration
pnpm test:coverage
pnpm test:security
pnpm test:perf
pnpm build
pnpm test:e2e
pnpm release:check
```

## 8. 实施与验证结果

- 实施提交：`c1fbec99684561cef5e118d03f995ecec40bb56d`。
- 来源PR：#263；最终Head：`b6521bfe49a88f3ccb599b0fa201307d640d61a4`。
- 受控main合并提交：`bf6697c6c3aed8cf4c45e1bcfc269ee3644323bf`。
- Main Verification Run：`30680858858`，结果成功。
- 新增源码结构扫描器，覆盖8个生产源码根目录。
- 当前仓库扫描结果：233个源码文件、647条相对导入边。
- 登记15项结构债务，均绑定AR-02—AR-13后续工作包。
- 核实并冻结3条现存循环依赖；新增未登记循环会被永久门禁阻断。
- 核实并冻结1条历史`writing → planning`依赖；新增同类倒置依赖会失败。
- 非登记TSX默认上限800行，TS默认上限1200行；现存巨型文件采用只减不增的显式上限。
- `check:structure`已接入`check:boundaries`，没有另建旁路质量流程。
- 结构检测纯函数测试、全仓真实扫描、静态检查、单元、集成、Migration、覆盖率、构建、Electron E2E和三平台Package Smoke全部通过。

最终永久门禁运行：

- Task Governance：`30680301795`，成功。
- PR Policy：`30680301803`，成功。
- Evidence：`30680301791`，成功。
- Security：`30680301774`，成功。
- Performance：`30680301773`，成功。
- Quality：`30680301856`，成功。

## 9. 完成结论

- M9-01已建立可执行的源码结构、循环依赖、Feature依赖和文件预算安全网。
- 当前结构债务均显式登记并绑定后续工作包，新增未登记债务由永久门禁阻断。
- PR永久门禁和合并后main验证全部成功。
- M9-01已完成为Verified，AR-02可以在独立任务中启动。

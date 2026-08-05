# WorldForge 代码质量与结构治理规范

> 状态：Active  
> 适用范围：生产代码、测试、脚本、样式、Migration、工作流与治理实现

## 1. 总体原则

代码结构以高内聚、低耦合为判断核心。文件行数、函数数量和测试数量只用于观察，不作为合并资格、任务完成或强制拆分条件。

一个文件可以较长，只要它完整承载同一业务能力，并满足：

- 只有一个明确职责域；
- 状态所有权集中；
- 事务边界一致；
- 错误模型一致；
- 生命周期一致；
- 外部依赖通过稳定接口进入；
- 修改不会频繁波及无关能力。

禁止为了满足视觉长度、统计指标或工具阈值，将单一功能机械拆成无语义的 `utils`、`helpers`、`types`、`handlers` 碎片。

## 2. 文件拆分依据

只有出现下列事实时才应拆分：

1. 同一文件包含两个可独立演进的业务能力；
2. 两部分拥有不同状态机、事务边界、失败语义或生命周期；
3. 某部分已经形成多个调用方共同依赖的稳定接口；
4. 测试目标必须初始化大量无关能力才能运行；
5. 修改一项功能经常导致另一项无关功能变化；
6. 内部共享可变状态产生隐式双向依赖；
7. 同一业务数据出现多个写入所有者或并行真源。

以下情况不得单独触发拆分：

- 文件行数较多；
- 单一事务流程较长；
- 单一 React 页面包含多个紧密关联区域；
- 同一业务链路测试场景较多；
- 私有辅助函数较多；
- 仅为了让文件目录看起来更细。

## 3. 必须阻断的结构问题

以下问题继续作为硬门禁：

- 循环依赖；
- 跨层反向依赖；
- Renderer 访问 Node、SQLite、文件系统、环境变量或凭据；
- Feature 直接访问另一 Feature 的私有实现；
- 深层导入绕过包公共入口；
- Contracts 引入业务实现；
- 生产代码依赖 Testkit；
- 同一权威实体存在多套持久化入口；
- 多个模块直接写入同一内部状态；
- 为绕过边界复制业务逻辑或建立第二套真源。

## 4. 非阻断观察指标

结构检查可以报告：

- 文件行数；
- 导出符号数量；
- 相对依赖数量；
- 被依赖数量；
- 函数、类或测试场景数量。

报告只用于人工审查。任何自动化不得仅凭这些数值判定违规，也不得自动生成拆分任务。

## 5. 格式与文本真源

- Prettier 必须覆盖 TS、TSX、测试、CSS、JSON、YAML、HTML、MJS 与工作流文件。
- `.editorconfig` 规定 UTF-8、LF、末尾换行和基础缩进。
- `.gitattributes` 固定 Git 跨平台行尾；Windows 命令文件保持 CRLF。
- CI、CLI 与编辑器必须读取相同配置，禁止把关键规则只注入某条 Shell 命令。
- 工具成功只证明实际匹配文件通过；永久策略必须锁定文件类型和 Glob，禁止漏检假绿。

## 6. TypeScript 与 ESLint

- 保持 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes` 和未知异常类型。
- `no-unused-vars` 在 ESLint 配置中统一维护。
- 生产 TypeScript 启用类型感知的浮动 Promise、Promise 误用、无效 await 和 switch 穷尽检查。
- 有意忽略 Promise 时必须使用明确的 `void`，且调用链内部具备失败处理或统一错误边界。
- 禁止通过大规模断言、空分支、无理由 disable 或吞错伪造规则通过。
- React Hooks 专项规则只有在依赖与锁文件可复现更新后启用；不得手工伪造依赖状态。

## 7. Coverage

- Renderer 的 TS 与 TSX 均进入真实覆盖率分母，测试发现支持 `.test.ts` 与 `.test.tsx`。
- Coverage 使用双轨门禁，禁止用一个全局百分比混合核心业务逻辑与 JSX 组合层。
- 核心 `.ts` 源码按 Statements、Branches、Functions、Lines 四项聚合计算，每项不得低于 75%。
- Renderer TSX 全量进入报告；其机器基线保存在 `docs/architecture/coverage-baseline.json`，门禁使用最大未覆盖数量，任何新增未测语句、分支、函数或行都会失败。
- TSX 基线只能在真实测试使覆盖数量改善后收紧，禁止为了让 CI 通过扩大未覆盖上限、降低核心阈值或新增大范围排除。
- 纯 DOM/JSX 组合与真实交互由 Electron E2E 验证；可独立执行的状态转换、数据映射、错误分支和业务决策应提取为稳定逻辑并补单元测试。
- 排除项必须说明运行环境限制、替代单元测试、E2E 路径和解除条件。
- 覆盖率通过只证明已配置范围达到门禁；不得用空测试、无意义渲染或断言实现细节机械凑数。

## 8. CSS

CSS 同时接受 Prettier 和高置信静态检查，至少阻断：

- 远程样式或远程资源加载；
- 空声明值；
- 未闭合大括号或字符串；
- CRLF、Tab 和缺少末尾换行。

当前不以属性顺序、选择器长度或 `!important` 数量作为硬门禁，避免样式治理产生无意义改写。

## 9. SQL Migration

Migration 基础检查至少覆盖：

- `NNNN_lower_snake_case.sql` 命名；
- 同目录版本号唯一；
- UTF-8/LF/末尾换行；
- 无条件 `DELETE` 和 `UPDATE` 必须有显式审查注解；
- 已发布 Migration 只读，禁止为满足格式重新改写历史语义。

静态检查不能替代 Migration 测试、事务回滚、外键检查和未来 Schema 兼容验证。

## 10. 工具链与工作流

Toolchain Export 只能：

- 手动触发；
- 精确绑定来源 SHA；
- 使用只读仓库权限；
- 通过 Actions Artifact 输出。

禁止工作流把工具、二进制分片、业务源码、任务状态或正式文档提交回 `work` 或 `main`。

## 11. 验证入口

基础入口：

```bash
pnpm format:check
pnpm lint
pnpm ci:policy
pnpm check:boundaries
pnpm typecheck
pnpm test:coverage
```

完整任务仍需按 Runtime 运行 Unit、Integration、Migration、Security、Performance、E2E 和 Build。未经真实执行，不得声明通过。

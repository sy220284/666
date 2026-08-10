# WorldForge 当前ChatGPT工作空间工具链、存储与调用权威清单

> 状态：Approved（仓库基线已升级；持久化快照待重新导出）  
> 权威范围：当前ChatGPT Linux持久化工作空间（`/mnt/data`）  
> 适用仓库：`sy220284/666`  
> 文档日期：2026-08-10  
> 环境架构：Linux x86_64、Debian 13、无GPU

## 1. 权威范围

本文是666仓库在当前ChatGPT持久化工作空间中使用离线工具链、完整workspace依赖、恢复脚本和验证脚本的权威操作文档。

工具清单与永久工作流的机器真源为 [`CURRENT_WORKSPACE_TOOLCHAIN.json`](CURRENT_WORKSPACE_TOOLCHAIN.json)。本文负责说明存储与使用方法，JSON负责声明Profile、工具包、验证命令、Artifact结构和工作流关联。发生版本冲突时，按以下顺序裁决：

```text
仓库当前 package.json、pnpm-lock.yaml、CURRENT_WORKSPACE_TOOLCHAIN.json与永久工作流
> 本文记录的工作空间资产
> 系统预装同名工具
```

禁止用本文中的离线快照改写仓库锁文件，禁止为迁就旧快照降低Node、pnpm、TypeScript、ESLint或测试版本。

## 2. 存储位置

| 资产 | 持久化位置 | 用途 |
|---|---|---|
| 完整工具链 | `/mnt/data/666-toolchain` | Node、npm、pnpm、Prettier、ESLint、TypeScript |
| workspace依赖 | `/mnt/data/666-workspace-dependencies` | 11个workspace的`node_modules`、Electron、Vitest、Playwright、esbuild、pnpm离线store |
| 工具锁定清单 | `/mnt/data/666-configs/toolchain.lock.json` | 工具版本、来源运行、校验信息 |
| 依赖锁定清单 | `/mnt/data/666-configs/workspace-dependencies.lock.json` | 依赖基线、锁文件Hash、验证信息 |
| 激活脚本 | `/mnt/data/activate-666-tools.sh` | 切换PATH与环境变量 |
| 依赖恢复脚本 | `/mnt/data/restore-666-workspace-dependencies.sh` | 将已验证依赖挂载到真实仓库 |
| Playwright冒烟 | `/mnt/data/run-666-playwright-chromium-smoke.sh` | 使用系统Chromium验证浏览器自动化 |
| 统一验证脚本 | `/mnt/data/verify-project-tools.sh` | 验证666与777两套工具环境 |
| 缓存清理脚本 | `/mnt/data/clean-project-tool-caches.sh` | 清理可重建测试缓存，不删除离线依赖 |

压缩Artifact已清理。上述解压目录是当前唯一保留的工作空间副本。

## 3. 仓库权威目标版本

| 工具 | 版本 | 实际入口 |
|---|---:|---|
| Node.js | 24.18.1 | `/mnt/data/666-toolchain/runtime/node/bin/node` |
| npm | 11.16.0 | `/mnt/data/666-toolchain/runtime/node/bin/npm` |
| pnpm | 11.21.0 | 激活后执行`pnpm` |
| Prettier | 3.9.6 | 激活后执行`prettier` |
| ESLint | 10.8.0 | 激活后执行`eslint` |
| TypeScript | 6.0.3 | 激活后执行`tsc` |
| typescript-eslint | 8.65.0 | workspace依赖 |
| Electron | 43.2.0 | 激活后执行`electron` |
| Vitest | 4.1.10 | 激活后执行`vitest` |
| Playwright | 1.62.0 | 激活后执行`playwright` |
| esbuild | 0.28.1 | 激活后执行`esbuild` |
| Electron Packager | 20.0.4 | 激活后执行`electron-packager` |
| ASAR | 4.2.1 | 激活后执行`asar` |

仓库当前要求Node `>=24.0.0 <25.0.0`、pnpm `>=11.21.0 <12.0.0`，并在`package.json`中锁定pnpm 11.21.0。当前工作空间版本满足该约束。

## 3.1 2026-08-10 工具链治理升级

仓库权威基线升级为 Node.js 24.18.1 LTS、pnpm 11.21.0、Electron 43.2.0、Playwright 1.62.0、ESLint 10.8.0、Prettier 3.9.6、typescript-eslint 8.65.0。`@types/node` 固定到 Node 24 类型线 24.13.3；TypeScript 保持 6.0.3，继续处于 typescript-eslint 当前支持范围内。

项目级 pnpm 配置统一迁入 `pnpm-workspace.yaml`：`engineStrict`、`preferFrozenLockfile`、`strictPeerDependencies` 由 workspace 文件声明。此次治理迁移先按已核验稳定版本重建锁文件，随后启用 `minimumReleaseAge: 1440`；从下一次依赖解析开始，默认延迟采用发布时间不足 24 小时的新包。紧急安全升级如需绕过，只允许精确版本的一次性例外。原仅承载这三项设置的 `.npmrc` 删除。

GitHub Actions 固定到 checkout v6.0.2、pnpm/action-setup v6.0.9、setup-node v6.4.0 的完整提交 SHA。永久 workflow 不再重复声明 pnpm 版本，由根 `package.json#packageManager` 提供；Node CI 运行时固定为 24.18.1。当前仍保留 pnpm/action-setup，暂不迁移到 pnpm/setup，以避免 pnpm 11 在 Intel macOS 独立二进制上的兼容边界影响现有跨平台打包矩阵。

新增 `pnpm toolchain:check` 并接入 `pnpm ci:policy`，持续检查 packageManager、Node 运行时、工具链权威清单、pnpm workspace 安全设置、重复依赖版本及 workflow 版本来源，防止后续再次漂移。

### 持久化工作空间状态

本节版本表描述升级后的**仓库权威目标基线**。`/mnt/data/666-toolchain` 与 `/mnt/data/666-workspace-dependencies` 中此前导出的 2026-08-05 快照在新的 `pnpm-lock.yaml` 生成后视为 **STALE**，不得继续恢复到升级后的仓库。必须从新锁文件重新导出工具链 Artifact、校验 Hash、完成离线复验后，才能替换持久化工作空间资产；旧快照只用于历史追溯。

## 4. 激活方式

每个新Shell先执行：

```bash
source /mnt/data/activate-666-tools.sh
```

激活后会设置：

```text
WF666_TOOLCHAIN=/mnt/data/666-toolchain
WF666_DEPENDENCIES=/mnt/data/666-workspace-dependencies
PNPM_STORE_DIR=/mnt/data/666-workspace-dependencies/worldforge-pnpm-store
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
```

激活脚本会移除777工具路径和变量，避免两个项目的Node、Python、Rust或pnpm互相污染。

基础检查：

```bash
node --version
npm --version
pnpm --version
prettier --version
eslint --version
tsc --version
```

## 5. 将依赖挂载到666仓库

当前`/mnt/data`没有666完整源码副本。先将真实仓库克隆或挂载到工作空间，例如：

```text
/mnt/data/projects/666
```

然后执行：

```bash
/mnt/data/restore-666-workspace-dependencies.sh /mnt/data/projects/666
source /mnt/data/activate-666-tools.sh
cd /mnt/data/projects/666
```

恢复脚本必须检查目标仓库锁文件、拒绝不一致快照，并在恢复后确认没有断裂符号链接。成功标志：

```text
WORLD_FORGE_DEPENDENCIES_RESTORED
```

现有离线依赖快照来源基线为：

```text
21625e1e11e7c50071f0860d791e902637f0531f
```

当前仓库Head可能晚于该基线。出现锁文件不匹配时必须从当前永久工具工作流重新导出，禁止强制覆盖。

## 6. 常用调用

```bash
source /mnt/data/activate-666-tools.sh
cd /mnt/data/projects/666

pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:migration
pnpm test:coverage
pnpm test:security
pnpm test:perf
pnpm test:e2e
pnpm build
pnpm release:check
```

仅验证工具链：

```bash
/mnt/data/verify-project-tools.sh basic
```

执行浏览器真实冒烟：

```bash
/mnt/data/verify-project-tools.sh full
```

## 7. 浏览器与桌面边界

Playwright官方浏览器包未保留。当前工作空间固定使用系统Chromium：

```text
/usr/bin/chromium
```

Node代码中需要显式指定：

```javascript
chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
```

Electron在无图形桌面的环境中需要无头模式、Xvfb或仓库现有E2E启动器。不能因普通窗口无法直接显示而判定Electron依赖损坏。

## 8. 已验证状态

当前工作空间历史快照已实际验证：

- pnpm离线重建217个包，下载数为0；
- 断裂符号链接为0；
- Prettier、ESLint、TypeScript、Vitest、esbuild可执行；
- Playwright使用系统Chromium启动成功；
- Electron通过无头显示启动；
- ASAR打包与解包成功；
- Electron Fuses读取成功；
- Electron Packager打包成功。

统一成功标志：

```text
PLAYWRIGHT_SYSTEM_CHROMIUM_OK
PROJECT_TOOLS_OK mode=full
```

这些结论只适用于对应锁文件Hash。新Artifact必须单独验证，不能继承旧快照结论。

## 9. 更新和维护规则

1. 工具版本和导出配置只从仓库锁文件、`package.json`、`docs/process/CURRENT_WORKSPACE_TOOLCHAIN.json`和永久工作流确定。
2. 工具或依赖变更后，必须重新导出、校验、解压并更新两个工作空间JSON锁定清单和本文。
3. 禁止手工修改离线`node_modules`来掩盖锁文件不一致。
4. 禁止提交`/mnt/data`工具目录、二进制、缓存或软链接到仓库。
5. 重新获取工具必须走GitHub Actions Artifact，不能依赖已删除的历史压缩包。
6. 清理缓存只能执行：

```bash
/mnt/data/clean-project-tool-caches.sh
```

7. 完成任何工具环境调整后必须执行：

```bash
/mnt/data/verify-project-tools.sh full
```

## 10. 永久工具工作流关联

仓库内的权威关系固定为：

| 职责 | 权威路径 |
|---|---|
| 机器可读工具清单 | `docs/process/CURRENT_WORKSPACE_TOOLCHAIN.json` |
| PR调用入口 | `.github/workflows/quality.yml` |
| 永久可复用导出工作流 | `.github/workflows/toolchain-export.yml` |
| Artifact生成与离线复验 | `.github/governance/toolchain-bundle.mjs` |
| 工作空间使用说明 | `docs/process/CURRENT_WORKSPACE_TOOLCHAIN.md` |

`CURRENT_WORKSPACE_TOOLCHAIN.json`声明Profile、工具包、验证命令、Artifact必备路径、命名模板、保留期与可信调用分支。导出器直接读取该清单，工作流和脚本不得再维护独立工具集合。

永久导出支持两种入口：

1. `workflow_dispatch`：按完整提交SHA、Profile和Runner人工导出；
2. `workflow_call`：由现有 `.github/workflows/quality.yml` 在同仓库 `work → main` PR检测到工具链相关路径变化时调用。

PR调用必须同时满足：

```text
来源仓库等于当前仓库
+ Head分支等于work
+ 工具清单、锁文件、生成器、导出工作流、Quality调用入口或本文发生变化
```

外部Fork和其他分支不会获得工具打包能力。Artifact名称固定为：

```text
worldforge-toolchain-{profile}-{os}-{arch}-{sourceSha}
```

每个Artifact必须包含：

```text
store/
cache/
node_modules/
node_modules/.bin/
node_modules/.pnpm/
manifest.json
toolchain-authority.json
SHA256SUMS.txt
```

`store/`保存精确锁定的包内容，`cache/`保存 pnpm 11 离线解析与 lockfile 供应链复验所需的 registry metadata / verification cache。锁文件生成、fetch、首次离线安装和独立临时目录二次复验都必须显式绑定 Artifact 自带的同一 `cacheDir`；fresh verify 继续使用 `--offline --frozen-lockfile --ignore-scripts`，不得通过 synthetic `pnpm-workspace.yaml` 或 `trustLockfile: true` 绕过 `minimumReleaseAge` 等供应链检查。

`actions/upload-artifact`必须启用`include-hidden-files: true`，否则pnpm链接层与命令入口会被排除。`manifest.json`必须记录源提交、源Tree、根锁文件Hash、生成 lockfile Hash、工具版本，以及机器清单路径和Hash。下载后先校验`SHA256SUMS.txt`与`manifest.json`，再验证`store/`、`cache/`、`.bin`和`.pnpm`存在并执行工具版本命令；禁止仅凭Artifact名称覆盖现有工具。

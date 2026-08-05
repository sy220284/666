# WorldForge 当前ChatGPT工作空间工具链、存储与调用权威清单

> 状态：Approved  
> 权威范围：当前ChatGPT Linux持久化工作空间（`/mnt/data`）  
> 适用仓库：`sy220284/666`  
> 文档日期：2026-08-05  
> 环境架构：Linux x86_64、Debian 13、无GPU

## 1. 权威范围

本文是666仓库在当前ChatGPT持久化工作空间中使用离线工具链、完整workspace依赖、恢复脚本和验证脚本的权威操作文档。

本文只约束当前工作空间的工具资产和调用方式，不改变产品运行目录、正式安装目录、CI Runner配置或其他开发者机器的本地路径。发生版本冲突时，按以下顺序裁决：

```text
仓库当前 package.json、pnpm-lock.yaml 与永久工作流
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

## 3. 工具版本

| 工具 | 版本 | 实际入口 |
|---|---:|---|
| Node.js | 24.18.0 | `/mnt/data/666-toolchain/runtime/node/bin/node` |
| npm | 11.16.0 | `/mnt/data/666-toolchain/runtime/node/bin/npm` |
| pnpm | 11.13.1 | 激活后执行`pnpm` |
| Prettier | 3.9.5 | 激活后执行`prettier` |
| ESLint | 10.7.0 | 激活后执行`eslint` |
| TypeScript | 6.0.3 | 激活后执行`tsc` |
| typescript-eslint | 8.64.0 | workspace依赖 |
| Electron | 43.1.1 | 激活后执行`electron` |
| Vitest | 4.1.10 | 激活后执行`vitest` |
| Playwright | 1.61.1 | 激活后执行`playwright` |
| esbuild | 0.28.1 | 激活后执行`esbuild` |
| Electron Packager | 20.0.4 | 激活后执行`electron-packager` |
| ASAR | 4.2.1 | 激活后执行`asar` |

仓库当前要求Node `>=24.0.0`、pnpm `>=11.0.0`，并在`package.json`中锁定pnpm 11.13.1。当前工作空间版本满足该约束。

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

恢复脚本会：

1. 检查目标目录存在；
2. 检查目标仓库具有`pnpm-lock.yaml`；
3. 对比目标锁文件与离线依赖快照；
4. 锁文件不一致时立即拒绝恢复；
5. 将各workspace的`node_modules`链接到持久化依赖目录；
6. 检查恢复后没有断裂符号链接。

成功标志：

```text
WORLD_FORGE_DEPENDENCIES_RESTORED
```

离线依赖快照来源基线为：

```text
21625e1e11e7c50071f0860d791e902637f0531f
```

当前仓库Head可能晚于该基线。恢复脚本的锁文件拒绝机制必须保留；出现不匹配时应重新从当前GitHub Actions工作流导出，禁止强行覆盖。

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

或单独执行：

```bash
/mnt/data/run-666-playwright-chromium-smoke.sh
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
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
```

Electron在无图形桌面的环境中需要无头模式、Xvfb或仓库现有E2E启动器。不能因普通窗口无法直接显示而判定Electron依赖损坏。

## 8. 验证状态

当前已实际验证：

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

## 9. 更新和维护规则

1. 工具版本只从仓库锁文件、`package.json`和永久`Toolchain Export`工作流确定。
2. 工具或依赖变更后，必须重新导出、校验、解压并更新两个JSON锁定清单和本文。
3. 禁止手工修改离线`node_modules`来掩盖锁文件不一致。
4. 禁止提交`/mnt/data`工具目录、二进制、缓存或软链接到仓库。
5. 压缩包删除后不可依赖原Artifact恢复；重新获取必须走GitHub Actions。
6. 清理缓存只能执行：

```bash
/mnt/data/clean-project-tool-caches.sh
```

7. 完成任何工具环境调整后必须执行：

```bash
/mnt/data/verify-project-tools.sh full
```

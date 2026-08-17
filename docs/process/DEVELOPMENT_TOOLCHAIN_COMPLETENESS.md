# 666 完整开发工具链权威

> 状态：Active（随 `governance` 合入 `main` 后成为主干权威）  
> 机器真源：[`CURRENT_WORKSPACE_TOOLCHAIN.json`](CURRENT_WORKSPACE_TOOLCHAIN.json)  
> 自动维护：`.github/workflows/toolchain-maintenance.yml`

## 1. 完整性的定义

666 的“完整开发工具链”由三层共同组成，不要求把整个操作系统镜像塞进一个制品：

1. **可移植质量工具链**：Node、pnpm、格式化、静态检查、类型检查、测试、覆盖率、浏览器测试命令和构建辅助工具；
2. **完整工作区恢复包**：源码、全部 workspace 依赖、pnpm store、Node 运行时、可恢复 pnpm、Electron/打包依赖、Playwright Chromium、独立代码审计工具；
3. **宿主平台能力契约**：Linux、Windows、macOS 上无法合理随项目制品搬运的编译器、系统 SDK、签名/公证命令和显示环境能力，由永久 Host Probe 实际验证。

只有三层都满足权威清单和恢复自检，才允许把环境标记为“完整”。

## 2. 可移植质量工具链

`quality` Profile 由 `CURRENT_WORKSPACE_TOOLCHAIN.json` 直接声明，包含：

- ESLint、`@eslint/js`、`eslint-plugin-react-hooks`、`typescript-eslint`
- Prettier
- TypeScript
- Vitest 与 V8 覆盖率插件
- Playwright 测试命令
- esbuild
- YAML 解析工具
- pnpm

导出器会生成独立锁文件、pnpm store、元数据缓存和 `node_modules`，随后执行离线冻结安装与版本命令复验。

## 3. 独立代码审计工具

补充审计工具不写入业务 `pnpm-lock.yaml`，而由永久工作区导出流程按机器权威生成独立锁：

| 工具 | 精确版本 | 用途 |
|---|---:|---|
| Knip | 6.32.2 | 未使用文件、导出、依赖、工作区引用与死代码审计 |
| jscpd | 5.0.12 | 重复代码、复制粘贴与跨文件代码克隆审计 |
| SonarJS | 4.2.0 | 认知复杂度、代码异味、潜在缺陷与补充安全规则审计 |

它们存放在完整恢复包的：

```text
worldforge-audit-tools/
```

该目录同时保存 pnpm 11.21.0、与仓库版本对齐的 ESLint/typescript-eslint、独立 `pnpm-lock.yaml`、store/cache、`sonarjs.config.mjs` 与可执行入口。生成阶段必须先联网安装，再删除 `node_modules` 并执行一次 `--offline --frozen-lockfile` 重建，证明恢复包不依赖临时网络。

恢复后可直接执行专项审计，例如：

```bash
AUDIT_DIR=./worldforge-audit-tools
"$AUDIT_DIR/node_modules/.bin/knip"
"$AUDIT_DIR/node_modules/.bin/jscpd" apps packages scripts
"$AUDIT_DIR/node_modules/.bin/eslint" --config "$AUDIT_DIR/sonarjs.config.mjs" apps packages scripts
```

SonarJS 配置显式启用 `sonarjs/cognitive-complexity`，因此复杂度/代码异味能力不再依赖普通 ESLint 配置是否偶然覆盖。

## 4. 浏览器与桌面开发载荷

完整恢复包固定携带与项目锁文件匹配的 Playwright Chromium，目录为：

```text
worldforge-playwright-browsers/
```

上传前必须在独立解包目录中使用该 Chromium 真正启动浏览器并退出。不得再把“系统恰好有 Chromium”当作完整工具链的一部分。

Electron、Electron Packager、ASAR、Fuses、Windows Sign、macOS Sign/Notarize 等项目级 npm 工具继续由根 `pnpm-lock.yaml` 与完整 workspace `node_modules` 提供精确版本。

## 5. pnpm 与 Node 恢复

完整恢复包包含 Node 24.18.1 运行时，并在 `worldforge-audit-tools/node_modules/.bin` 中保存可由该 Node 直接执行的 pnpm 11.21.0。

独立恢复检查必须验证：

```text
node --version = v24.18.1
pnpm --version = 11.21.0
```

因此恢复后的环境不能依赖宿主机预装 pnpm。

## 6. 宿主平台能力

宿主能力由：

```text
.github/workflows/toolchain-host-probe.yml
```

进行三平台真实探针。

### Linux

固定 Runner：`ubuntu-24.04`

必须具备 Git、Bash、tar、zstd、Python 3、GCC/G++、make、pkg-config、fontconfig；发行/E2E 使用的 `xvfb` 与 `fonts-noto-cjk` 必须能由该 Runner 的系统包源提供。

### Windows

固定 Runner：`windows-latest`

必须具备 Git、PowerShell 7、Windows PowerShell，以及 Windows SDK 中的 `signtool.exe`。Developer Mode 属于 Windows 原生构建/E2E 能力边界。

### macOS

固定 Runner：`macos-latest`

必须具备 Git、Bash、Xcode 命令行工具、`xcrun`、`codesign`、`security` 与 `notarytool`。

签名证书、Apple API 私钥、Windows 证书等机密不是“工具”，不得进入任何快照。

## 7. 自动维护

`.github/workflows/toolchain-maintenance.yml` 在以下情况刷新完整链路：

- 工具链、锁文件、恢复工作流或完整性规则进入 `main`；
- 每周一、周四 `03:17 UTC`；
- 人工触发。

维护流程同时：

1. 校验工具链与完整性机器规则；
2. 刷新 `quality` 工具链；
3. 刷新完整工作区恢复包；
4. 运行 Linux / Windows / macOS Host Probe。

Artifact 保留 14 天。

## 8. 锁文件边界

根 `pnpm-lock.yaml` 只管理 WorldForge 项目依赖；Knip、jscpd 与 SonarJS 作为独立工具链载荷拥有自己的生成锁，不得为了增加开发审计工具而污染业务依赖图。

任何根依赖升级仍必须按仓库原有冻结安装与锁文件审计流程处理。工具链快照不能反向改写业务锁文件。

## 9. 完成判据

完整开发工具链必须同时满足：

- `node scripts/toolchain-policy.mjs` 通过；
- `node scripts/toolchain-completeness-policy.mjs` 通过；
- `quality` Artifact 完成离线复验；
- Workspace Bootstrap 完成独立解包；
- 恢复后的 Node、pnpm、Vitest、esbuild、Playwright、Knip、jscpd 与 SonarJS 审计配置可执行；
- 恢复后的 Playwright Chromium 真启动成功；
- 断裂符号链接为 0；
- 三平台 Host Probe 通过。

任何一项失败，都不能把该快照或环境称为“完整开发工具链”。

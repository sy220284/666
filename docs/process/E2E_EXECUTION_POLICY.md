# E2E 执行政策

## 目标

桌面端验证按开发阶段分层，日常提交保持短反馈，完整三平台验证集中在发布权威阶段；完整套件使用独立 Runner 横向分片，单个 Runner 内维持 Playwright 单 worker，避免多个 Electron 实例争抢图形、文件系统和数据库资源。

## 执行层级

### Draft / 日常开发

- 默认沿用 Quality 风险路由与 Draft 轻量模式。
- 普通 Draft 不常态执行完整桌面 E2E。
- `<!-- full-validation-draft -->` 仅作为明确的人工完整复验开关，不应作为日常 PR 的长期默认标记。

### Ready / 合并验证

- 由现有风险路由决定是否启用完整产品验证、可靠性、Windows 真拼音、三平台体验和打包 smoke。
- Linux 完整 Electron E2E 启用时拆成 3 个 shard；每个 shard 使用独立 Ubuntu Runner，Playwright 配置继续保持 `workers: 1`。
- `desktop-e2e` 聚合任务只有在三个 shard 全部成功后才成功，继续作为冻结实现 Quality 复用的权威证据。
- Linux 平台体验从完整 E2E 分片中隔离为独立 lane，避免在三个 shard 内重复执行。

### Release / 发布验证

- Release SHA 必须通过 Linux、Windows、macOS 三端完整核心 E2E。
- 每个平台拆成 3 个 shard，总计 9 个并行核心 E2E Runner。
- Windows 额外执行真实 Microsoft Pinyin 验收。
- Release Quality 继续执行产品测试、覆盖率、安全和性能，但关闭重复的 Linux Electron E2E；三端完整桌面验证直接由永久 `release.yml` 内的发布 E2E 矩阵承担，避免新增工作流绕过永久自动化清单。
- 打包流程继续执行三平台真实包构建与 packaged startup smoke。
- `release-status-ready`、发布任务和最终状态都依赖三平台 E2E 权威，任何一个平台或 Windows 真拼音失败均禁止发布。

## 截图证据

`platform-experience.spec.ts` 在 Linux、Windows、macOS 上对每个支持分辨率保存真实界面 PNG，并在平台 JSON 证据中记录截图相对路径。截图用于人工验收和问题定位，不作为跨操作系统二进制哈希相等门禁。

当前平台体验矩阵：

- 2560×1440
- 2560×1600
- 3440×1440
- 3840×2160

截图目录：

```text
test-results/platform-experience/screenshots/
├─ linux/
├─ windows/
└─ macos/
```

## 性能原则

- 横向扩展优先于提高单 Runner worker 数量。
- Stateful、恢复、视觉等测试仍可由 Playwright 分片分配到独立 Runner，但同一 Runner 内不并发启动多个 Electron worker。
- 当单平台最慢 shard 明显高于另外两个 shard 时，再基于历史耗时调整分片策略；不以增加单机 worker 作为第一选择。

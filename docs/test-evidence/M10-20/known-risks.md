# M10-20 已知风险与回退边界

- Provider 地址故障转移以 socket 连接建立作为“非幂等请求可能已送达”的安全边界；连接建立后的 POST/PUT/PATCH/DELETE 等非可重放请求失败时直接 fail-closed，不自动切换第二地址。
- GET/HEAD/OPTIONS 保持可重放地址故障转移；若未来 Provider 引入带副作用的 GET，必须在协议层单独收紧，不能依赖当前通用方法白名单。
- Foundation manifest 由 workspace 自动发现和 `policy.buildable` 单一真源派生；若新增 workspace，必须同步 workspace architecture registry，否则 `check:workspaces` 会阻断。
- 历史 Schema 1 Evidence 的兼容绑定仅适用于 Runtime Schema 2 且存在受控来源 PR 的 squash orphan commit；不得扩大为跳过 Evidence source commit/祖先校验的通用豁免。
- M9-01 Evidence 是对已有受控主线提交与永久工作流的补录，不重写原任务产品范围。
- Renderer TSX Coverage 基线仅按本任务真实新增行为测试后的测量值收紧，禁止以提高 maxUncovered 或扩大排除恢复旧覆盖债。
- 依赖锁更新只处理开发/质量工具链漏洞；若 audit 再次发现 high/critical，任务不得进入合并。

回退时整体回退 M10-20 的 Provider 连接阶段规则、Foundation 动态入口、Evidence Scanner 兼容、M9-01 补录、Renderer 测试/覆盖基线及依赖锁；不得回退 M10-19 已验证产品治理。

# M12-03 命令与快捷键边界

权威回归：`tests/unit/m12-03-author-productivity.test.ts`，由最终 Product 运行 `32152968200` 覆盖并通过。

验证点：

1. `COMMAND_CATALOG` 继续是按钮、命令面板、默认/自定义快捷键共享的单一命令身份来源；命令 ID 无重复。
2. `system.commandPalette` 保持默认 `Mod+K`，Windows 以 Ctrl、macOS 以 Command 归一为 `Mod`。
3. 输入法 composition 期间快捷键归一返回空，不抢占候选与确认流程。
4. 快捷键冲突由现有目录检测；未知命令 ID 的覆盖值被拒绝。
5. `[role="dialog"]` 模态框拥有键盘焦点时，全局快捷键不接管事件。
6. `rebindable: false` 的命令即使磁盘中存在覆盖值，也继续使用受保护默认快捷键。
7. 生成类命令保持只读不可执行边界；未引入第二套 CommandCatalog、回调命令总线或任意脚本执行能力。
8. 设置持久化接受合法打字机/Theme B/安全短印文配置，拒绝带 HTML 标记的短印文输入。

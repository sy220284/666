# M12-03 打字机模式与真实中文输入验收

最终实现提交：`eecf8113b5ccf7d604b9a2988b7ddd7236e57c39`

最终 Quality：`32152968200`，Windows 体验 Job 成功。

原生输入法产物：
- Artifact：`9330674179`（`m8-07-windows-native-ime`）
- Digest：`sha256:0a155b593cd87a5ebe8fcc47ca4853cfe3881e95ce06e7f69ec172fa9d9e300a`
- 测试：`tests/e2e/m8-07-windows-ime.spec.ts`
- 用例：`Windows真实Microsoft拼音在打字机模式完成候选、确认、切换、撤销、自动保存、切章、沉浸与恢复`
- 结果：1/1 通过，53.0 秒。

产物中的 `microsoft-pinyin-profile.json` 识别真实 Windows TSF `Microsoft Pinyin` 配置；`native-ime-actions.jsonl` 记录了实际输入法激活与动作序列，包括：
- 候选输入 `zhongwen`
- 回车确认 `shurufa`
- Shift 中英切换
- ASCII `ABC`
- 再次切换
- 第二次候选输入 `ceshi`

产物同时包含两张真实 Microsoft Pinyin 候选窗口截图。验收流程在打字机模式开启状态下继续执行撤销/重做、自动保存、切换章节、沉浸模式和重启恢复，证明打字机视觉锚点没有破坏编辑器输入法生命周期与持久化链路。

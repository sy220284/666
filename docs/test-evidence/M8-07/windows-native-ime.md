# Windows真实Microsoft拼音验收

受检提交：`cd097424586af9ae42735953aee092feeb068859`

环境为GitHub托管Windows Server 2025。系统注册表确认Microsoft Pinyin输入配置存在，TSF会话激活成功，返回值为`0x00000000`，窗口输入语言为`0x0804`。

真实操作链覆盖：中文候选确认、中英文切换、英文输入、再次中文候选确认、撤销重做、自动保存、切章返回、沉浸模式、关闭应用与重新打开恢复。最终正文为“中文输入法ABC测试”。

专项Playwright用例1/1通过。

证据：

- `run:30615390359/windows-native-ime`
- `artifact:8787191898/microsoft-pinyin-profile.json`
- `artifact:8787191898/native-ime-actions.jsonl`
- `artifact:8787191898/microsoft-pinyin-second-candidate.png`
- `artifact:8787191898/windows-ime-e2e.log`

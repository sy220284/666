# M12-03 Theme B 护眼 / 高对比 / 短印文验收

## 无障碍

最终 Quality `32152968200` 的 E2E 第 1 片 21/21 通过，其中
`tests/e2e/accessibility.spec.ts` 用例
`Phase 3 accessibility scan covers home, modal focus, writing and Theme B variants`
会真实切换 Theme B 的 `eye-care` 与 `high-contrast`，保存短印文 `落笔生花`，分别对设置页和写作页执行无障碍扫描。

单元回归同时验证：
- 合法短印文可持久化；
- `<img src=x>` 等带 HTML 标记内容被设置契约拒绝。

## 像素视觉回归

新增两张 Linux 2560×1440 基线在登记前经过两次独立 Actions 校准：

稳定来源：
- Head：`3d9ab7bf43ae2335cf91e10f25d75c2d23b40d71`
- Quality：`32151140271`
- Artifact：`9330078620`
- Digest：`sha256:625179f4d50e0d7e2f72448f066d51d95e2ce0d1ba496a56e56557e243dc7875`

独立见证：
- Head：`fb6008179cc38d3065719eca408e0c5fb0e8c278`
- Quality：`32151880183`
- Artifact：`9330365265`
- Digest：`sha256:55265f6a1bc0b9e7fbace07ee808c4482c2ca6c2168201a29a163dfdfdf2ef0c`

两轮得到完全相同的 PNG：
- `theme-b-eye-care-2560x1440.png` → `111e8bdb083d6c032d15ed5214a09007b1139d171e80aaf46743d6ba0bf504ca`
- `theme-b-high-contrast-2560x1440.png` → `5ff2d14633dac2dffea6d01a146d67ffcf44d0f3d67f67ab27b1f533748d1e2b`

旧四张 Theme A/B 明暗基线在两次校准中也保持不变。最终视觉清单扩为六张；实现冻结提交 `eecf8113...` 的 E2E 第 3 片再次执行六主题像素比对并 11/11 通过：
- Artifact：`9330779750`
- Digest：`sha256:768b08212563dd94e46b93ff10a9f16610384acc83ea1f2df733d5813253a97f`

因此本任务没有另建主题系统；Theme B 新变体继续受现有设置持久化、无障碍和视觉基线治理。

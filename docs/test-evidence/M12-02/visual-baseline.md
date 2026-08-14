# M12-02 视觉基线证据

M12-02 Research 入口带来左侧说明文案的预期 reflow。闭包核验进一步发现旧的三张主题基线记录了 Settings 返回/顶栏合成过程中的稳定中间帧，而非最终绘制态。视觉采样已改为：规范化滚动/焦点/指针状态，等待双 `requestAnimationFrame`，并要求连续两张 PNG 字节完全一致后才接受。

两份独立 GitHub Actions 见证收敛到同一最终帧：

- source: `d2a6abe07d032db7260300924d14dc5c804ea46a` / Quality `31818830760` / artifact `9226678057` / `sha256:ca6454b6dd00b126eda4d07417e6edef0249147f5a6c6d337e4a42902064078b`
- stability witness: `76990f503f8d0a5194e08e5c43dcd2f23e3cd1dd` / Quality `31841828379` / artifact `9234964206` / `sha256:4adab323c3f83d6d7e02f3e6fdf67fddb7de2b7825b162fdcd5b35c046a530bc`

四主题 SHA-256：

- `theme-a-light-1280x800.png`: `49a78490e24ecd98d734c4a1263e08d7ea47e0fe992417e3f759f8fbd71491e7`
- `theme-a-dark-1280x800.png`: `01b9ee8bf53bb0ad2c941e53ffb47f95836f0352c3dd63278e768152e342de78`
- `theme-b-light-1280x800.png`: `a1bea42416911316fc703108887bcc4903dadfd9f81882dcc1f40c6850cda8ce`
- `theme-b-dark-1280x800.png`: `eb69c25d18f7bc4f129f687fd54493744b5f35d1642800ebabd3fb134d4ae774`

`theme-a-light` 保持原基线；其余三张通过临时 Artifact-only GitHub Actions 工作流按 SHA 和 PNG 尺寸校验后原子替换，临时工作流在基线提交中自删除。最终实现提交 `1370043776250a15ce531be4c87bff77d502d465` 的正式 Quality run `31844118433` 再次完整通过 Electron E2E 与 Linux platform experience。

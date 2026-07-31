# 三平台发布工件

## 结论

版本`1.0.0`已在GitHub原生Windows、macOS和Linux Runner完成构建、资产校验及成品启动冒烟。Linux首次启动受Ubuntu 24.04 AppArmor用户命名空间限制，以仓库永久门禁相同的显式CI沙箱回退重跑后通过。

| 平台 | Run | Artifact | 大小 | SHA-256 | 结果 |
| --- | ---: | ---: | ---: | --- | --- |
| macOS | 30623725133 | 8790527645 | 122409745 | `b23377c65900e13689a18da34eb5e4dd6d163e22bbca4363215693792e2a6652` | PASS |
| Windows | 30623725133 | 8790649171 | 147976944 | `ca0e1f7ef66bfc6ccdea7412fbd981ea7891eb569b7a8a200fa33e43cbb5ac8b` | PASS |
| Linux | 30624246649 | 8790691885 | 128606196 | `7b6bd7777afa28f508a7adef1e6c3546c0696690058bb10c1ea9e0997eef633b` | PASS |

工件均包含`artifact-manifest.json`，并通过`verify-package-assets.mjs`及`smoke-packaged-desktop.mjs`。

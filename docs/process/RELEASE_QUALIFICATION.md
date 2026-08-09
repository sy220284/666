# WorldForge 发布资格判定规范

> 状态：Active  
> 适用范围：V1.0三平台GitHub Release手工发布。
> 更新日期：2026-08-09

## 1. 唯一发布权威

正式发布只由`ReleaseAcceptance`判定，权威输入为：

```text
当前main提交
├─ main-verification=success
├─ Release Quality / Security / Performance / UI Acceptance
├─ 三平台原生构建、启动冒烟与package-manifest.json
└─ 发行信任证据
   ├─ Windows Authenticode SHA-256 + timestamp + 原生验证
   └─ macOS Developer ID + hardened runtime + notarization + stapling + Gatekeeper验证
```

`TASK_AUTHORIZATION.json`、`TASK_INDEX.md`、`docs/tasks/runtime/*.json`和历史`task-verification/*`只用于项目管理与审计，不参与Release资格计算。发布工具不得通过读取或“有效Verified”推导这些记录来放行或阻断产品发布。

## 2. Source Authority

- 请求版本必须是严格SemVer，且与`package.json`一致。
- Release只能从`main`手工触发。
- 当前发布SHA必须拥有`main-verification=success`；状态必须绑定当前SHA，不得沿用旧提交。
- `release-acceptance.mjs`只读取当前提交状态，不解析历史Task Runtime。

## 3. Product Quality

每次Release必须执行：

- 完整Quality；
- dependency audit、全历史secret scan和应用安全测试；
- Performance；
- UI Acceptance；
- Linux、Windows、macOS原生Runner构建与启动冒烟。

任一矩阵失败时，`publish`不可运行。

## 4. Artifact Integrity

每个平台的`package-manifest.json`使用Schema 2并记录真实事实：

- 版本、平台、架构、工件名、字节数与SHA-256；
- ASAR及header Hash；
- Electron Fuses；
- `releaseKind`和`distributionTrustMode`；
- `signed`、`notarized`、`stapled`；
- 由原生工具成功返回后生成的`distributionTrustEvidence`。

平台Job生成后立即验证一次。发布Job下载三平台工件后再次验证：必须恰有Linux、Windows、macOS各一个manifest，Hash和字节数仍一致，随后才生成`SHA256SUMS.txt`。

manifest布尔值不能单独证明发行信任；缺少匹配的原生验证证据时按失败处理。

## 5. Distribution Trust

| 发布类型     | 默认策略                               | 可否未签名           |
| ------------ | -------------------------------------- | -------------------- |
| `stable`     | `required`                             | 不可配置放宽         |
| `prerelease` | 由`require_distribution_trust`显式选择 | 允许显式内部测试例外 |
| `draft`      | 默认`allow-unsigned`                   | 允许作者自用候选     |

`stable`必须同时满足：

- Windows便携包中的可签名二进制由`@electron/windows-sign`执行SHA-256 Authenticode签名；主程序经`Get-AuthenticodeSignature`确认`Valid`且存在时间戳证书。
- macOS `.app`使用Developer ID Application签名和hardened runtime；`codesign --strict`通过。
- Apple notarization完成并staple；`stapler validate`和`spctl --assess`通过。
- Linux继续以Hash、ASAR、Fuse、原生构建和启动冒烟作为当前发行信任边界，不伪造签名状态。

`prerelease`若选择`required`，执行与stable相同的信任门。缺少或只配置部分凭据一律fail closed。

## 6. Actions凭据

受信任构建使用下列Repository Actions Secrets：

```text
WINDOWS_CERTIFICATE_BASE64
WINDOWS_CERTIFICATE_PASSWORD
MACOS_CERTIFICATE_BASE64
MACOS_CERTIFICATE_PASSWORD
MACOS_SIGN_IDENTITY
APPLE_API_KEY_BASE64
APPLE_API_KEY_ID
APPLE_API_ISSUER
```

证书与API key只物化到Runner临时目录；macOS证书导入临时Keychain；打包后执行清理。凭据正文不得进入manifest、日志或上传工件。

## 7. 发布序列

```text
workflow_dispatch
→ Source Authority + 凭据完整性预检
→ Quality / Security / Performance / UI Acceptance
→ 三平台原生构建和startup smoke
→ 平台签名/公证及原生验证（策略要求时）
→ 平台manifest与工件Hash验证
→ 发布Job重新执行Source Authority
→ 聚合复验三平台manifest与发行信任
→ SHA256SUMS
→ 创建不可覆盖的GitHub Release
```

## 8. 维护规则

1. 新任务登记、状态变更或历史Runtime归档不得改变Release结果。
2. 签名、公证或manifest结构变化必须同步纯函数单测、三平台工作流和本规范。
3. 不得将“已配置Secret”“manifest写入true”当作原生签名验证的替代品。
4. 不得恢复旧Task Runtime Release Gate或新增第二套发布资格真源。

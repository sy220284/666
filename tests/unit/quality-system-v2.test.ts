import { describe, expect, it } from 'vitest';

import { riskPlan } from '../../scripts/ci-risk-policy.mjs';
import { validateActiveDocumentation } from '../../scripts/documentation-consistency.mjs';
import { validateGovernanceAuthorities } from '../../scripts/governance-self-check.mjs';
import { validateLicenseMetadata } from '../../scripts/license-policy.mjs';

describe('统一风险矩阵', () => {
  it('Renderer变化触发产品、性能、安全、UI和Windows IME风险', () => {
    expect(riskPlan(['apps/desktop/renderer/src/App.tsx'])).toMatchObject({
      fullSuite: true,
      dependencyAudit: false,
      applicationSecurity: true,
      performance: true,
      uiAcceptance: true,
      windowsIme: true,
    });
  });

  it('治理文档维护保持轻量但进入Meta-Governance', () => {
    expect(riskPlan(['docs/process/CI_WORKFLOW_ARCHITECTURE.md'])).toMatchObject({
      fullSuite: false,
      dependencyAudit: false,
      applicationSecurity: false,
      performance: false,
      governanceMeta: true,
    });
  });

  it('依赖元数据变化触发完整质量、供应链、打包和工具链验证', () => {
    expect(riskPlan(['package.json'])).toMatchObject({
      fullSuite: true,
      packageSmoke: true,
      toolchainExport: true,
      dependencyAudit: true,
      applicationSecurity: true,
      performance: true,
      governanceMeta: true,
    });
  });
});

describe('许可证权威', () => {
  it('MIT LICENSE与package SPDX一致时通过', () => {
    expect(
      validateLicenseMetadata({
        packageJson: { license: 'MIT' },
        licenseSource: 'MIT License\n\nCopyright (c) 2026',
      }),
    ).toEqual([]);
  });

  it('重新引入AGPL元数据时阻断', () => {
    expect(
      validateLicenseMetadata({
        packageJson: { license: 'AGPL-3.0-only' },
        licenseSource: 'MIT License\n',
      }),
    ).toContain('package.json license must be MIT, found AGPL-3.0-only');
  });
});

describe('Active文档一致性', () => {
  const current = {
    execution:
      'main/work/governance pr-policy quality / quality security performance Release不读取任务Runtime作为产品发布权威 ACTIVE_TASK.json 已经退役',
    ci: '稳定`main` + 产品`work` + 治理`governance` pr-policy quality / quality security performance Integration Branch Synchronization',
    release:
      'ReleaseAcceptance main-verification=success UI Acceptance Windows Authenticode macOS Developer ID 不得恢复旧Task Runtime Release Gate',
    readme: 'License: MIT License',
  };

  it('当前三分支、四Context与Release权威文档通过', () => {
    expect(validateActiveDocumentation(current)).toEqual([]);
  });

  it('两分支旧文档会被识别', () => {
    expect(
      validateActiveDocumentation({
        ...current,
        ci: `${current.ci}\n固定分支仅允许\`main\`、\`work\`。`,
      }),
    ).toContain('CI documentation still declares the retired two-branch inventory');
  });
});

describe('Meta-Governance权威链', () => {
  const sources = {
    quality: 'name: quality / quality\nquality / release-audit\nquality / package-smoke',
    security: 'name: security',
    performance: 'name: performance',
    release:
      'node scripts/ui-acceptance-gate.mjs\npnpm release:gate\ntest "$GITHUB_REF_NAME" = main',
    mainVerification:
      'name: main-verification\nname: synchronize-integrations\nmain/work/governance branch inventory',
    riskPolicy: "CI_RISK_MATRIX.json export function riskPlan 'dependency-audit' 'windows-ime'",
    riskMatrix: JSON.stringify({
      schemaVersion: 1,
      routes: Object.fromEntries(
        [
          'dependencyAudit',
          'applicationSecurity',
          'performance',
          'packageSmoke',
          'toolchainExport',
          'uiAcceptance',
          'windowsIme',
          'governanceMeta',
        ].map((route) => [route, { any: [] }]),
      ),
    }),
  };

  it('关键权威链全部存在时通过', () => {
    expect(validateGovernanceAuthorities(sources)).toEqual([]);
  });

  it('Release丢失UI gate时阻断', () => {
    expect(
      validateGovernanceAuthorities({
        ...sources,
        release: 'pnpm release:gate\ntest "$GITHUB_REF_NAME" = main',
      }),
    ).toContain('Release is missing authority marker: node scripts/ui-acceptance-gate.mjs');
  });
});

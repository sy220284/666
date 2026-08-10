import fs from 'node:fs';

const protectedWorkflows = [
  'automerge.yml',
  'branch-hygiene.yml',
  'evidence.yml',
  'main-verification.yml',
  'performance.yml',
  'post-merge-verification.yml',
  'pr-policy.yml',
  'quality-core.yml',
  'quality.yml',
  'repository-governance.yml',
  'security.yml',
  'task-governance.yml',
  'work-synchronization.yml',
];

const preferred = {
  checkout: 'de0fac2e4500dabe0009e67214ff5f5447ce83dd',
  setupNode: '48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
  pnpm: '0ebf47130e4866e96fce0953f49152a61190b271',
};
const legacy = {
  checkout: 'd23441a48e516b6c34aea4fa41551a30e30af803',
  setupNode: '249970729cb0ef3589644e2896645e5dc5ba9c38',
  pnpm: 'b906affcce14559ad1aafd4ab0e942779e9f58b1',
};

const replacements = [
  [
    `actions/checkout@${preferred.checkout} # v6.0.2`,
    `actions/checkout@${legacy.checkout} # v6`,
  ],
  [
    `actions/setup-node@${preferred.setupNode} # v6.4.0`,
    `actions/setup-node@${legacy.setupNode} # v6`,
  ],
  [
    `pnpm/action-setup@${preferred.pnpm} # v6.0.9`,
    `pnpm/action-setup@${legacy.pnpm} # v4`,
  ],
];

for (const name of protectedWorkflows) {
  const file = `.github/workflows/${name}`;
  let source = fs.readFileSync(file, 'utf8');
  for (const [from, to] of replacements) source = source.replaceAll(from, to);
  fs.writeFileSync(file, source);
}

const pinBlock = (variable) => `const ${variable} = new Map([
  [
    'actions/checkout',
    {
      preferred: '${preferred.checkout}',
      allowed: new Set(['${legacy.checkout}', '${preferred.checkout}']),
    },
  ],
  [
    'actions/setup-node',
    {
      preferred: '${preferred.setupNode}',
      allowed: new Set(['${legacy.setupNode}', '${preferred.setupNode}']),
    },
  ],
  [
    'actions/upload-artifact',
    {
      preferred: '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
      allowed: new Set(['043fb46d1a93c77aae656e7c1c64a875d1fc6a0a']),
    },
  ],
  [
    'actions/download-artifact',
    {
      preferred: '3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
      allowed: new Set(['3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c']),
    },
  ],
  [
    'pnpm/action-setup',
    {
      preferred: '${preferred.pnpm}',
      allowed: new Set(['${legacy.pnpm}', '${preferred.pnpm}']),
    },
  ],
]);`;

{
  const file = 'scripts/ci-policy.mjs';
  let source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf('const pins = new Map([');
  const end = source.indexOf('\n\nfunction requireText', start);
  if (start < 0 || end < 0) throw new Error('Unable to locate ci-policy pin block');
  source = source.slice(0, start) + pinBlock('pins') + source.slice(end);

  const oldValidation = `    if (!pins.has(action)) errors.push(\`${'${label}'}: ${'${action}'} is not allowlisted\`);
    else if (pins.get(action) !== ref)
      errors.push(\`${'${label}'}: ${'${action}'} must use immutable SHA ${'${pins.get(action)}'}\`);`;
  const newValidation = `    if (!pins.has(action)) errors.push(\`${'${label}'}: ${'${action}'} is not allowlisted\`);
    else {
      const policy = pins.get(action);
      if (!policy.allowed.has(ref))
        errors.push(\`${'${label}'}: ${'${action}'} must use governed immutable SHA ${'${policy.preferred}'}\`);
    }`;
  if (!source.includes(oldValidation) && !source.includes('policy.allowed.has(ref)')) {
    throw new Error('Unable to locate ci-policy action validation');
  }
  source = source.replace(oldValidation, newValidation);
  fs.writeFileSync(file, source);
}

{
  const file = 'scripts/workflow-structure-policy.mjs';
  let source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf('const actionPins = new Map([');
  const end = source.indexOf('\n\nconst fullValidationDraftMarker', start);
  if (start < 0 || end < 0) throw new Error('Unable to locate workflow-structure pin block');
  source = source.slice(0, start) + pinBlock('actionPins') + source.slice(end);

  const oldValidation = `  const expected = actionPins.get(action);
  if (!expected) {
    errors.push(\`${'${file}'}: external action ${'${action}'} is not allowlisted\`);
    return;
  }
  if (reference !== expected) {
    errors.push(\`${'${file}'}: ${'${action}'} must use immutable SHA ${'${expected}'}\`);
  }`;
  const newValidation = `  const policy = actionPins.get(action);
  if (!policy) {
    errors.push(\`${'${file}'}: external action ${'${action}'} is not allowlisted\`);
    return;
  }
  if (!policy.allowed.has(reference)) {
    errors.push(\`${'${file}'}: ${'${action}'} must use immutable SHA ${'${policy.preferred}'}\`);
  }`;
  if (!source.includes(oldValidation) && !source.includes('policy.allowed.has(reference)')) {
    throw new Error('Unable to locate workflow-structure action validation');
  }
  source = source.replace(oldValidation, newValidation);
  fs.writeFileSync(file, source);
}

{
  const file = 'docs/process/TOOLCHAIN_UPGRADE_2026-08-10.md';
  let source = fs.readFileSync(file, 'utf8');
  if (!source.includes('## 主线可信策略迁移')) {
    const marker = '## 结论\n';
    if (!source.includes(marker)) throw new Error('Unable to locate upgrade conclusion');
    source = source.replace(
      marker,
      `## 主线可信策略迁移\n\n独立治理分支已使用新 Actions pins 完成验证。由于 main 上的可信 PR Policy 使用 main 自身的 ci-policy 校验候选，而旧策略仅接受升级前的 Action SHA，主线落仓采用两阶段迁移。第一阶段仅让受可信策略直接检查的永久 workflow 暂时保留升级前的 Action 实现 SHA；Node 继续固定 24.18.1，pnpm 继续由 packageManager 提供 11.21.0，Electron 与依赖锁文件均不回退。候选策略只允许升级前 SHA 与已验证新 SHA 两组精确值。待该过渡策略进入 main 后，第二阶段将这些 workflow 全部切换到已验证新 SHA，并删除旧 SHA 白名单。\n\n${marker}`,
    );
    fs.writeFileSync(file, source);
  }
}

console.log('Trusted action pin transition prepared for 13 protected workflows.');

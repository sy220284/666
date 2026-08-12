import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const defaultPolicyPath = path.join(root, 'docs', 'process', 'SUPPLY_CHAIN_INVENTORY_POLICY.json');

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function commandName(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function run(command, args, options = {}) {
  const { cwd = root, ...spawnOptions } = options;
  const result = spawnSync(commandName(command), args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...spawnOptions,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with exit code ${result.status}:\n${result.stderr || result.stdout}`,
    );
  }
  return String(result.stdout ?? '').trim();
}

export function validateSupplyChainPolicy(policy) {
  const errors = [];
  if (!isRecord(policy) || policy.schemaVersion !== 1) {
    errors.push('Supply-chain inventory policy must use schemaVersion 1');
    return errors;
  }
  if (policy.status !== 'enforced') errors.push('Supply-chain inventory policy must be enforced');
  if (policy.sbom?.format !== 'cyclonedx') errors.push('SBOM format must be cyclonedx');
  if (policy.sbom?.specVersion !== '1.7') errors.push('SBOM specVersion must be 1.7');
  if (policy.sbom?.componentType !== 'application') {
    errors.push('SBOM root component type must be application');
  }
  if (policy.sbom?.includeDevelopmentDependencies !== true) {
    errors.push('SBOM must preserve the full workspace dependency inventory');
  }
  if (policy.licenses?.sourceCommand !== 'pnpm licenses list --json') {
    errors.push('License inventory must use pnpm licenses list --json');
  }
  if (policy.licenses?.includeDevelopmentDependencies !== true) {
    errors.push('License inventory must preserve the full workspace dependency inventory');
  }
  for (const [label, output] of [
    ['SBOM', policy.sbom?.output],
    ['License inventory', policy.licenses?.output],
    ['Supply-chain summary', policy.summaryOutput],
  ]) {
    if (typeof output !== 'string' || !output.startsWith('test-results/security/supply-chain/')) {
      errors.push(`${label} output must stay under test-results/security/supply-chain`);
    }
  }
  if (!Array.isArray(policy.licenses?.rejectedGroups)) {
    errors.push('License inventory policy must define rejectedGroups');
  }
  return errors;
}

export function validateCycloneDxSbom(sbom, packageJson, policy) {
  const errors = [];
  if (!isRecord(sbom)) return ['SBOM must be a JSON object'];
  if (sbom.bomFormat !== 'CycloneDX') errors.push('SBOM bomFormat must be CycloneDX');
  if (sbom.specVersion !== policy.sbom.specVersion) {
    errors.push(`SBOM specVersion must be ${policy.sbom.specVersion}`);
  }
  if (sbom.metadata?.component?.type !== policy.sbom.componentType) {
    errors.push(`SBOM root component type must be ${policy.sbom.componentType}`);
  }
  if (sbom.metadata?.component?.name !== packageJson.name) {
    errors.push(`SBOM root component name must be ${packageJson.name}`);
  }
  if (sbom.metadata?.component?.version !== packageJson.version) {
    errors.push(`SBOM root component version must be ${packageJson.version}`);
  }
  if (!Array.isArray(sbom.components) || sbom.components.length === 0) {
    errors.push('SBOM must contain dependency components');
  }
  if (!Array.isArray(sbom.dependencies) || sbom.dependencies.length === 0) {
    errors.push('SBOM must contain a dependency graph');
  }
  const refs = new Set();
  for (const component of sbom.components ?? []) {
    const ref = component?.['bom-ref'];
    if (typeof ref !== 'string' || ref.length === 0) {
      errors.push('Every SBOM component must have a bom-ref');
      continue;
    }
    if (refs.has(ref)) errors.push(`SBOM contains duplicate component bom-ref: ${ref}`);
    refs.add(ref);
    if (typeof component?.name !== 'string' || component.name.length === 0) {
      errors.push(`SBOM component ${ref} is missing name`);
    }
    if (typeof component?.version !== 'string' || component.version.length === 0) {
      errors.push(`SBOM component ${ref} is missing version`);
    }
  }
  const rootRef = sbom.metadata?.component?.['bom-ref'];
  if (
    typeof rootRef !== 'string' ||
    !sbom.dependencies?.some((entry) => entry?.ref === rootRef && Array.isArray(entry.dependsOn))
  ) {
    errors.push('SBOM dependency graph must contain the root component');
  }
  return errors;
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, stableObject(value[key])]),
  );
}

export function canonicalSbomDocument(sbom) {
  const canonical = globalThis.structuredClone(sbom);
  delete canonical.serialNumber;
  if (isRecord(canonical.metadata)) delete canonical.metadata.timestamp;
  if (Array.isArray(canonical.components)) {
    canonical.components.sort((left, right) =>
      String(left?.['bom-ref'] ?? '').localeCompare(String(right?.['bom-ref'] ?? '')),
    );
  }
  if (Array.isArray(canonical.dependencies)) {
    canonical.dependencies = canonical.dependencies
      .map((entry) => ({
        ...entry,
        dependsOn: Array.isArray(entry?.dependsOn) ? [...entry.dependsOn].sort() : entry?.dependsOn,
      }))
      .sort((left, right) => String(left?.ref ?? '').localeCompare(String(right?.ref ?? '')));
  }
  return stableObject(canonical);
}

export function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function canonicalSbomSha256(sbom) {
  return sha256Text(`${JSON.stringify(canonicalSbomDocument(sbom))}\n`);
}

export function normalizeLicenseInventory(raw, policy) {
  if (!isRecord(raw)) throw new Error('pnpm license inventory must be a JSON object');
  const rejected = new Set(
    policy.licenses.rejectedGroups.map((value) => String(value).trim().toLowerCase()),
  );
  const errors = [];
  const licenses = [];
  for (const license of Object.keys(raw).sort((left, right) => left.localeCompare(right))) {
    const entries = raw[license];
    if (rejected.has(license.trim().toLowerCase())) {
      errors.push(`Rejected or unknown license group: ${license || '<empty>'}`);
    }
    if (!Array.isArray(entries)) {
      errors.push(`License group ${license || '<empty>'} must contain an array`);
      continue;
    }
    const packages = entries
      .map((entry) => {
        if (!isRecord(entry)) {
          errors.push(`License group ${license || '<empty>'} contains a non-object package`);
          return null;
        }
        const versions = Array.isArray(entry.versions) ? entry.versions.map(String) : [];
        if (typeof entry.name !== 'string' || entry.name.length === 0) {
          errors.push(`License group ${license || '<empty>'} contains a package without a name`);
        }
        if (versions.length === 0) {
          errors.push(`License package ${entry.name ?? '<unknown>'} has no versions`);
        }
        if (entry.license !== license) {
          errors.push(
            `License package ${entry.name ?? '<unknown>'} does not match group ${license}`,
          );
        }
        return {
          name: String(entry.name ?? ''),
          versions,
          license,
          ...(typeof entry.registryName === 'string' ? { registryName: entry.registryName } : {}),
          ...(typeof entry.author === 'string' ? { author: entry.author } : {}),
          ...(typeof entry.homepage === 'string' ? { homepage: entry.homepage } : {}),
        };
      })
      .filter(Boolean)
      .sort((left, right) =>
        `${left.name}\u0000${left.registryName ?? ''}`.localeCompare(
          `${right.name}\u0000${right.registryName ?? ''}`,
        ),
      );
    licenses.push({ license, packages });
  }
  const packageEntries = licenses.reduce((total, group) => total + group.packages.length, 0);
  const packageVersions = licenses.reduce(
    (total, group) =>
      total + group.packages.reduce((subtotal, item) => subtotal + item.versions.length, 0),
    0,
  );
  if (packageEntries === 0) {
    errors.push('License inventory must contain at least one dependency package');
  }
  return {
    document: {
      schemaVersion: 1,
      source: policy.licenses.sourceCommand,
      licenseGroups: licenses.length,
      packageEntries,
      packageVersions,
      licenses,
    },
    errors,
  };
}

async function loadJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function runSupplyChainInventory(
  repositoryRoot = root,
  policyPath = defaultPolicyPath,
) {
  const policy = await loadJson(policyPath);
  const policyErrors = validateSupplyChainPolicy(policy);
  if (policyErrors.length > 0) throw new Error(policyErrors.join('\n'));
  const packageJson = await loadJson(path.join(repositoryRoot, 'package.json'));
  const sbomPath = path.join(repositoryRoot, policy.sbom.output);
  const licensePath = path.join(repositoryRoot, policy.licenses.output);
  const summaryPath = path.join(repositoryRoot, policy.summaryOutput);
  await mkdir(path.dirname(sbomPath), { recursive: true });

  run(
    'pnpm',
    [
      'sbom',
      '--sbom-format',
      policy.sbom.format,
      '--sbom-spec-version',
      policy.sbom.specVersion,
      '--sbom-type',
      policy.sbom.componentType,
      '--out',
      policy.sbom.output,
    ],
    { cwd: repositoryRoot },
  );
  const sbomSource = await readFile(sbomPath, 'utf8');
  const sbom = JSON.parse(sbomSource);
  const sbomErrors = validateCycloneDxSbom(sbom, packageJson, policy);

  const rawLicenses = JSON.parse(
    run('pnpm', ['licenses', 'list', '--json'], { cwd: repositoryRoot }),
  );
  const normalizedLicenses = normalizeLicenseInventory(rawLicenses, policy);
  await writeJson(licensePath, normalizedLicenses.document);
  const licenseSource = await readFile(licensePath, 'utf8');

  const sourceCommit = run('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot });
  const pnpmVersion = run('pnpm', ['--version'], { cwd: repositoryRoot });
  const errors = [...sbomErrors, ...normalizedLicenses.errors];
  const summary = {
    schemaVersion: 1,
    status: errors.length === 0 ? 'passed' : 'failed',
    sourceCommit,
    toolchain: { node: process.version, pnpm: pnpmVersion },
    sbom: {
      format: sbom.bomFormat,
      specVersion: sbom.specVersion,
      componentCount: sbom.components?.length ?? 0,
      fileSha256: sha256Text(sbomSource),
      canonicalSha256: canonicalSbomSha256(sbom),
    },
    licenses: {
      licenseGroups: normalizedLicenses.document.licenseGroups,
      packageEntries: normalizedLicenses.document.packageEntries,
      packageVersions: normalizedLicenses.document.packageVersions,
      sha256: sha256Text(licenseSource),
    },
    errors,
  };
  await writeJson(summaryPath, summary);
  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log(
    `Supply-chain inventory passed: ${summary.sbom.componentCount} SBOM components, ${summary.licenses.packageVersions} package versions across ${summary.licenses.licenseGroups} license groups.`,
  );
  return summary;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSupplyChainInventory().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

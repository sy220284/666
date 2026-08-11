/* global console, process */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const authorizationPath = path.join(root, 'docs/tasks/TASK_AUTHORIZATION.json');

export function validateSingleWorkState(authorization) {
  const errors = [];
  if (authorization?.schemaVersion !== 2) errors.push('TASK_AUTHORIZATION schemaVersion must be 2');
  if (authorization?.mode !== 'single-work-pr') errors.push('TASK_AUTHORIZATION mode must be single-work-pr');
  if (authorization?.baseBranch !== 'main') errors.push('baseBranch must be main');
  if (authorization?.workBranch !== 'work') errors.push('workBranch must be work');
  if (authorization?.governanceBranch !== 'governance') {
    errors.push('governanceBranch must be governance');
  }
  if (authorization?.allowDirectMainCommits !== false) errors.push('Direct main commits must be disabled');
  if (authorization?.allowAdditionalBranches !== false) errors.push('Undeclared branches must be disabled');
  if (authorization?.maxOpenWorkPullRequests !== 1) {
    errors.push('Exactly one open work PR must be allowed');
  }
  if (authorization?.maxOpenGovernancePullRequests !== 1) {
    errors.push('Exactly one open governance PR must be allowed');
  }
  if (authorization?.mainWriteMode !== 'serialized') errors.push('mainWriteMode must be serialized');
  if (authorization?.mergeMethod !== 'squash') errors.push('mergeMethod must be squash');
  if (authorization?.verificationClosure !== 'main-status') {
    errors.push('verificationClosure must be main-status');
  }
  if (authorization?.workSynchronization !== 'verified-reset') {
    errors.push('workSynchronization must be verified-reset');
  }
  if (authorization?.governanceSynchronization !== 'verified-reset') {
    errors.push('governanceSynchronization must be verified-reset');
  }
  return errors;
}

async function loadAuthorization() {
  return JSON.parse(await readFile(authorizationPath, 'utf8'));
}

async function validate() {
  const authorization = await loadAuthorization();
  const errors = validateSingleWorkState(authorization);
  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log('Task authorization is valid for work and governance integration lanes.');
  return authorization;
}

async function status() {
  const authorization = await validate();
  console.log(
    JSON.stringify(
      {
        mode: authorization.mode,
        baseBranch: authorization.baseBranch,
        workBranch: authorization.workBranch,
        governanceBranch: authorization.governanceBranch,
        verificationClosure: authorization.verificationClosure,
        workSynchronization: authorization.workSynchronization,
        governanceSynchronization: authorization.governanceSynchronization,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const command = process.argv[2] ?? 'validate';
  if (command === 'validate' || command === 'preflight' || command === 'branch-check') {
    await validate();
  } else if (command === 'status') {
    await status();
  } else {
    throw new Error(
      `${command} is not supported. Product tasks use work; repository governance uses governance; both merge only through main PR gates.`,
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

import { afterEach, beforeEach } from 'vitest';

import { enterCommandIdentity } from '../../packages/core-service/src/command-identity-context.js';

const baselineArgv = [...process.argv];
const baselineEnvironment = { ...process.env };
const baselineResourcesPath = Object.getOwnPropertyDescriptor(process, 'resourcesPath');
const baselineParentPort = Object.getOwnPropertyDescriptor(process, 'parentPort');
const baselineMessageChannel = Object.getOwnPropertyDescriptor(globalThis, 'MessageChannel');
const baselineDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const baselineWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const baselineNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
let testCommandSequence = 0;

function restoreProperty(target: object, key: PropertyKey, descriptor?: PropertyDescriptor): void {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
    return;
  }
  Reflect.deleteProperty(target, key);
}

beforeEach(() => {
  testCommandSequence += 1;
  enterCommandIdentity('vitest.test', { sequence: testCommandSequence });
});

afterEach(() => {
  process.argv = [...baselineArgv];
  for (const key of Object.keys(process.env)) {
    if (!(key in baselineEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, baselineEnvironment);
  restoreProperty(process, 'resourcesPath', baselineResourcesPath);
  restoreProperty(process, 'parentPort', baselineParentPort);
  restoreProperty(globalThis, 'MessageChannel', baselineMessageChannel);
  restoreProperty(globalThis, 'document', baselineDocument);
  restoreProperty(globalThis, 'window', baselineWindow);
  restoreProperty(globalThis, 'navigator', baselineNavigator);
});

import { afterEach } from 'vitest';

const baselineArgv = [...process.argv];
const baselineEnvironment = { ...process.env };
const baselineResourcesPath = Object.getOwnPropertyDescriptor(process, 'resourcesPath');
const baselineParentPort = Object.getOwnPropertyDescriptor(process, 'parentPort');
const baselineMessageChannel = Object.getOwnPropertyDescriptor(globalThis, 'MessageChannel');

function restoreProperty(target: object, key: PropertyKey, descriptor?: PropertyDescriptor): void {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
    return;
  }
  Reflect.deleteProperty(target, key);
}

afterEach(() => {
  process.argv = [...baselineArgv];
  for (const key of Object.keys(process.env)) {
    if (!(key in baselineEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, baselineEnvironment);
  restoreProperty(process, 'resourcesPath', baselineResourcesPath);
  restoreProperty(process, 'parentPort', baselineParentPort);
  restoreProperty(globalThis, 'MessageChannel', baselineMessageChannel);
});

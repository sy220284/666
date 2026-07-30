import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const outputRoot = process.argv[2];
if (!outputRoot) throw new Error('Output directory is required.');

async function transform(file, transforms) {
  let source = await readFile(file, 'utf8');
  for (const { from, to, count = 1 } of transforms) {
    const occurrences = source.split(from).length - 1;
    if (occurrences !== count) {
      throw new Error(`${file}: expected ${count} occurrences, found ${occurrences}`);
    }
    source = source.split(from).join(to);
  }
  const destination = path.join(outputRoot, file);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, source);
}

await transform('tests/e2e/electron-shell.spec.ts', [
  { from: "'已注册到最近项目'", to: "'已注册到最近作品'" },
]);
await transform('tests/e2e/unreadable-project-recovery.spec.ts', [
  { from: "'已注册到最近项目'", to: "'已注册到最近作品'" },
]);
await transform('apps/desktop/renderer/src/features/settings/settings-page.tsx', [
  { from: '          返回首页', to: '          返回上一页' },
]);
await transform('apps/desktop/renderer/src/app/app-shell-m3.tsx', [
  {
    from: '  const settingsTrigger = useRef<HTMLButtonElement>(null);\n',
    to: "  const settingsTrigger = useRef<HTMLButtonElement>(null);\n  const settingsReturnRoute = useRef<RendererRouteId>('home');\n",
  },
  {
    from: "      setNavOpen(false);\n      void transitionToRoute(resolution.route).then((changed) => {\n",
    to: "      setNavOpen(false);\n      if (resolution.route === 'settings' && route !== 'settings') {\n        settingsReturnRoute.current = route;\n      }\n      void transitionToRoute(resolution.route).then((changed) => {\n",
  },
  {
    from: "              onClose={() => {\n                navigate('home');\n                window.requestAnimationFrame(() => settingsTrigger.current?.focus());\n              }}\n",
    to: "              onClose={() => {\n                const target = restoreAppShellRoute(settingsReturnRoute.current, {\n                  activeProjectId: activeProject?.projectId ?? null,\n                  disclosureMode,\n                });\n                void transitionToRoute(target).then((changed) => {\n                  if (changed) window.requestAnimationFrame(() => settingsTrigger.current?.focus());\n                });\n              }}\n",
  },
]);

console.log('Prepared settings return route and recovery terminology fixes.');

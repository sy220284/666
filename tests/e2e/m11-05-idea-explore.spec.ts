import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

const temporaryDirectories: string[] = [];
const root = process.cwd();

interface ProviderFixture {
  readonly server: Server;
  readonly baseUrl: string;
  readonly streamStarted: Promise<void>;
  readonly releaseStream: () => void;
  readonly streamRequestCount: () => number;
}

async function launch(userDataPath: string, createParent: string): Promise<ElectronApplication> {
  const args: string[] = [];
  if (process.getuid?.() === 0) args.push('--no-sandbox');
  args.push(path.join(root, 'apps/desktop/main'));
  return electron.launch({
    args,
    env: {
      ...process.env,
      WORLDFORGE_E2E: '1',
      WORLDFORGE_E2E_USER_DATA: userDataPath,
      WORLDFORGE_E2E_CREATE_PARENT: createParent,
    },
  });
}

async function closeGracefully(application: ElectronApplication): Promise<void> {
  const closed = application.waitForEvent('close');
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  await closed;
}

async function startProvider(holdStream = false): Promise<ProviderFixture> {
  const ideas = {
    ideas: [
      {
        title: '钟楼后的第二个黎明',
        summary: '城里每天有两次日出，只有主角记得第一次发生过什么。',
        content: '第二次黎明会抹去全城一小时记忆，主角需要利用这段时间寻找失踪者。',
      },
      {
        title: '会撒谎的城门',
        summary: '城门每天记录一份与现实不同的出入名单。',
        content: '主角发现名单提前一天写好了自己的名字，并标注了一个从未见过的同行者。',
      },
      {
        title: '倒流一刻钟的雨',
        summary: '每场暴雨都会让城中某个街区倒流一刻钟。',
        content: '主角利用倒流追查旧案，却发现每次倒流都会改变另一个人的记忆。',
      },
      {
        title: '无人认领的第五座桥',
        summary: '地图上只有四座桥，夜里却会出现第五座。',
        content: '第五座桥只通向被城市遗忘的人，主角在那里见到了本应已经死去的旧友。',
      },
    ],
  };
  let releaseStream = (): void => undefined;
  const streamGate = holdStream
    ? new Promise<void>((resolve) => {
        releaseStream = resolve;
      })
    : Promise.resolve();
  let resolveStreamStarted!: () => void;
  const streamStarted = new Promise<void>((resolve) => {
    resolveStreamStarted = resolve;
  });
  let streamRequests = 0;

  const server = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/v1/models') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'writer-model' }] }));
      return;
    }
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404).end();
      return;
    }

    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      const payload = JSON.parse(body) as { readonly stream?: boolean };
      if (payload.stream === false) {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ok: true }) } }] }),
        );
        return;
      }

      streamRequests += 1;
      resolveStreamStarted();
      void streamGate.then(() => {
        response.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        });
        response.write(
          `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(ideas) } }] })}\n\n`,
        );
        response.write(
          `data: ${JSON.stringify({
            choices: [{ delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 24, completion_tokens: 96 },
          })}\n\n`,
        );
        response.write('data: [DONE]\n\n');
        response.end();
      });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('MOCK_PROVIDER_ADDRESS_MISSING');
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    streamStarted,
    releaseStream,
    streamRequestCount: () => streamRequests,
  };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function configureProvider(page: Page, baseUrl: string): Promise<void> {
  await page.locator('[data-open-settings]').click();
  await page.locator('[data-settings-navigation="providers"]').click();
  await page.locator('details.provider-advanced-settings > summary').click();
  await page.locator('[data-provider-id]').fill('idea-e2e');
  await page.locator('[data-provider-name]').fill('灵感E2E模型');
  await page.locator('[data-provider-model]').fill('writer-model');
  await page.locator('[data-provider-base-url]').fill(baseUrl);
  await page.locator('[data-provider-save]').click();
  await expect(page.locator('[data-provider-card="idea-e2e"]')).toBeVisible();
}

async function createProject(page: Page, name: string): Promise<void> {
  await page.locator('.react-brand').click();
  await page.locator('[data-create-project]').click();
  await page.locator('[data-project-name]').fill(name);
  await page.locator('[data-confirm-create-project]').click();
  await expect(page.locator('[data-writing-workbench]')).toBeVisible();
}

async function openIdeaPanel(page: Page) {
  await page.locator('[data-open-planning]').click();
  const panel = page.locator('[data-idea-capsule]');
  await expect(panel).toBeVisible();
  return panel;
}

test.afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

test('作者从界面发起探索后，AI结果会真正进入灵感胶囊', async () => {
  test.setTimeout(90_000);
  const provider = await startProvider();
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-m11-05-explore-'));
  temporaryDirectories.push(userDataPath);
  const createParent = path.join(userDataPath, 'works');
  await mkdir(createParent, { recursive: true });
  const application = await launch(userDataPath, createParent);

  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await configureProvider(page, provider.baseUrl);
    await createProject(page, '灵感完整链路验收');

    const panel = await openIdeaPanel(page);
    await panel.locator('[data-idea-instruction]').fill('给我四个围绕城市记忆异常展开的情节灵感。');
    await panel.locator('[data-explore-ideas]').click();

    await expect(panel.locator('[data-idea-status]')).toContainText('灵感探索完成', {
      timeout: 30_000,
    });
    await expect(panel.locator('[data-idea-list]')).toContainText('钟楼后的第二个黎明');
    await expect(panel.locator('[data-idea-list] article')).toHaveCount(4);
  } finally {
    provider.releaseStream();
    await closeGracefully(application);
    await closeServer(provider.server);
  }
});

test('AI探索运行中离开页面再返回，重复点击不会再次调用模型', async () => {
  test.setTimeout(90_000);
  const provider = await startProvider(true);
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-m11-05-remount-'));
  temporaryDirectories.push(userDataPath);
  const createParent = path.join(userDataPath, 'works');
  await mkdir(createParent, { recursive: true });
  const application = await launch(userDataPath, createParent);

  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await configureProvider(page, provider.baseUrl);
    await createProject(page, '灵感跨页面重复启动验收');

    let panel = await openIdeaPanel(page);
    await panel.locator('[data-idea-instruction]').fill('探索一组不会重复启动的城市异象灵感。');
    await panel.locator('[data-explore-ideas]').click();
    await provider.streamStarted;
    expect(provider.streamRequestCount()).toBe(1);

    await page.locator('.react-brand').click();
    panel = await openIdeaPanel(page);
    await panel.locator('[data-idea-instruction]').fill('探索一组不会重复启动的城市异象灵感。');
    await panel.locator('[data-explore-ideas]').click();

    provider.releaseStream();
    await expect(panel.locator('[data-idea-status]')).toContainText('灵感探索完成', {
      timeout: 30_000,
    });
    expect(provider.streamRequestCount()).toBe(1);
    await expect(panel.locator('[data-idea-list] article')).toHaveCount(4);
  } finally {
    provider.releaseStream();
    await closeGracefully(application);
    await closeServer(provider.server);
  }
});

import { Readable } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const attachmentId = '22222222-2222-4222-8222-222222222222';

function stats(options: { size?: number; dev?: number; ino?: number } = {}) {
  return {
    isFile: () => true,
    isSymbolicLink: () => false,
    size: options.size ?? 4,
    dev: options.dev ?? 1,
    ino: options.ino ?? 1,
  };
}

function codedError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

function databaseReturningAttachment() {
  return {
    prepare: vi.fn(() => ({
      get: vi.fn(() => ({ managedRelativePath: 'artifacts/research/source.txt' })),
    })),
  };
}

function workspaceForImport() {
  return {
    readProject: vi.fn(),
    writeProject: vi.fn(),
    resolveProjectPath: vi.fn(async () => '/tmp/worldforge-managed/source.txt'),
  };
}

function workspaceForDelete(writeFailure: Error) {
  return {
    readProject: vi.fn((_projectId: string, operation: (database: unknown) => unknown) =>
      operation(databaseReturningAttachment()),
    ),
    writeProject: vi.fn(async () => {
      throw writeFailure;
    }),
    resolveProjectPath: vi.fn(async () => '/tmp/worldforge-managed/source.txt'),
  };
}

async function loadWithFilesystem(options: {
  readonly lstat?: ReturnType<typeof vi.fn>;
  readonly open?: ReturnType<typeof vi.fn>;
  readonly stat?: ReturnType<typeof vi.fn>;
  readonly rename?: ReturnType<typeof vi.fn>;
  readonly mkdir?: ReturnType<typeof vi.fn>;
  readonly rm?: ReturnType<typeof vi.fn>;
  readonly pipeline?: ReturnType<typeof vi.fn>;
  readonly createWriteStream?: ReturnType<typeof vi.fn>;
  readonly createReadStream?: ReturnType<typeof vi.fn>;
  readonly pathOverrides?: Record<string, unknown>;
}) {
  vi.resetModules();
  const lstat = options.lstat ?? vi.fn(async () => stats());
  const open = options.open ?? vi.fn();
  const stat = options.stat ?? vi.fn(async () => stats());
  const rename = options.rename ?? vi.fn(async () => undefined);
  const mkdir = options.mkdir ?? vi.fn(async () => undefined);
  const rm = options.rm ?? vi.fn(async () => undefined);
  const pipeline = options.pipeline ?? vi.fn(async () => undefined);
  const createWriteStream = options.createWriteStream ?? vi.fn(() => ({}));
  const createReadStream = options.createReadStream ?? vi.fn(() => ({}));

  if (options.pathOverrides) {
    vi.doMock('node:path', async (importOriginal) => {
      const actual = (await importOriginal()) as Record<string, unknown> & {
        default?: Record<string, unknown>;
      };
      return {
        ...actual,
        default: { ...(actual.default ?? actual), ...options.pathOverrides },
      };
    });
  }

  vi.doMock('node:fs/promises', () => ({
    lstat,
    mkdir,
    open,
    readdir: vi.fn(async () => []),
    rename,
    rm,
    stat,
  }));
  vi.doMock('node:stream/promises', () => ({ pipeline }));
  vi.doMock('node:fs', () => ({
    createReadStream,
    createWriteStream,
  }));

  const module = await import('../../packages/core-service/src/research-service.js');
  return {
    ...module,
    mocks: { lstat, open, stat, rename, mkdir, rm, pipeline, createWriteStream },
  };
}

afterEach(() => {
  vi.doUnmock('node:fs/promises');
  vi.doUnmock('node:stream/promises');
  vi.doUnmock('node:fs');
  vi.doUnmock('node:path');
  vi.resetModules();
});

describe('ResearchService filesystem failure coverage', () => {
  it('keeps the secondary extension guard fail-closed when extension resolution changes', async () => {
    const extname = vi.fn().mockReturnValueOnce('.txt').mockReturnValueOnce('.exe');
    const { ResearchService } = await loadWithFilesystem({ pathOverrides: { extname } });
    const service = new ResearchService(
      contractInput<ProjectWorkspaceService>(workspaceForImport()),
    );

    await expect(
      service.importAttachment(
        '99999999-9999-4999-8999-999999999999',
        { projectId, noteId: null },
        '/tmp/source.txt',
      ),
    ).rejects.toMatchObject({ code: 'RESEARCH_INVALID' });
    expect(extname).toHaveBeenCalledTimes(2);
  });

  it('uses the defensive attachment display name when basename resolution is empty', async () => {
    const handle = {
      stat: vi.fn(async () => stats({ size: 4 })),
      close: vi.fn(async () => undefined),
      createReadStream: vi.fn(() => Readable.from(['data'])),
    };
    const workspace = workspaceForImport();
    workspace.writeProject.mockRejectedValueOnce(new Error('stop after display name'));
    const { ResearchService } = await loadWithFilesystem({
      lstat: vi.fn(async () => stats({ size: 4 })),
      open: vi.fn(async () => handle),
      stat: vi.fn(async () => stats({ size: 4 })),
      createReadStream: vi.fn(() => Readable.from(['data'])),
      pathOverrides: { basename: vi.fn(() => '') },
    });
    const service = new ResearchService(contractInput<ProjectWorkspaceService>(workspace));

    await expect(
      service.importAttachment(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        { projectId, noteId: null },
        '/tmp/source.txt',
      ),
    ).rejects.toMatchObject({ code: 'RESEARCH_ATTACHMENT_FAILED' });
    expect(workspace.writeProject).toHaveBeenCalled();
  });

  it('wraps a regular file that disappears or becomes unreadable before open', async () => {
    const open = vi.fn(async () => {
      throw codedError('EACCES');
    });
    const { ResearchService } = await loadWithFilesystem({ open });
    const service = new ResearchService(
      contractInput<ProjectWorkspaceService>(workspaceForImport()),
    );

    await expect(
      service.importAttachment(
        '33333333-3333-4333-8333-333333333333',
        { projectId, noteId: null },
        '/tmp/source.txt',
      ),
    ).rejects.toMatchObject({ code: 'RESEARCH_ATTACHMENT_FAILED' });
  });

  it('rejects a source whose opened file identity changed after the initial check', async () => {
    const handle = {
      stat: vi.fn(async () => stats({ ino: 2 })),
      close: vi.fn(async () => undefined),
      createReadStream: vi.fn(() => ({})),
    };
    const { ResearchService } = await loadWithFilesystem({
      lstat: vi.fn(async () => stats()),
      open: vi.fn(async () => handle),
    });
    const service = new ResearchService(
      contractInput<ProjectWorkspaceService>(workspaceForImport()),
    );

    await expect(
      service.importAttachment(
        '44444444-4444-4444-8444-444444444444',
        { projectId, noteId: null },
        '/tmp/source.txt',
      ),
    ).rejects.toMatchObject({ code: 'RESEARCH_INVALID' });
    expect(handle.close).toHaveBeenCalled();
  });

  it('rejects an incomplete copied file before hashing or database publication', async () => {
    const handle = {
      stat: vi.fn(async () => stats({ size: 4 })),
      close: vi.fn(async () => undefined),
      createReadStream: vi.fn(() => ({})),
    };
    const { ResearchService, mocks } = await loadWithFilesystem({
      lstat: vi.fn(async () => stats({ size: 4 })),
      open: vi.fn(async () => handle),
      stat: vi.fn(async () => stats({ size: 3 })),
    });
    const workspace = workspaceForImport();
    const service = new ResearchService(contractInput<ProjectWorkspaceService>(workspace));

    await expect(
      service.importAttachment(
        '55555555-5555-4555-8555-555555555555',
        { projectId, noteId: null },
        '/tmp/source.txt',
      ),
    ).rejects.toMatchObject({ code: 'RESEARCH_ATTACHMENT_FAILED' });
    expect(mocks.pipeline).toHaveBeenCalled();
    expect(workspace.writeProject).not.toHaveBeenCalled();
  });

  it('surfaces non-missing staged-file inspection errors during deletion replay', async () => {
    const rename = vi.fn(async () => {
      throw codedError('ENOENT');
    });
    const lstat = vi.fn(async () => {
      throw codedError('EACCES');
    });
    const { ResearchService } = await loadWithFilesystem({ rename, lstat });
    const service = new ResearchService(
      contractInput<ProjectWorkspaceService>(workspaceForDelete(new Error('unused'))),
    );

    await expect(
      service.deleteAttachment('66666666-6666-4666-8666-666666666666', {
        projectId,
        attachmentId,
      }),
    ).rejects.toMatchObject({ code: 'EACCES' });
  });

  it('rethrows a non-missing rename failure before touching the database', async () => {
    const rename = vi.fn(async () => {
      throw codedError('EACCES');
    });
    const { ResearchService } = await loadWithFilesystem({ rename });
    const workspace = workspaceForDelete(new Error('unused'));
    const service = new ResearchService(contractInput<ProjectWorkspaceService>(workspace));

    await expect(
      service.deleteAttachment('77777777-7777-4777-8777-777777777777', {
        projectId,
        attachmentId,
      }),
    ).rejects.toMatchObject({ code: 'EACCES' });
    expect(workspace.writeProject).not.toHaveBeenCalled();
  });

  it('maps a failed filesystem compensation after a database failure to attachment failure', async () => {
    const rename = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(codedError('EACCES'));
    const { ResearchService } = await loadWithFilesystem({ rename });
    const service = new ResearchService(
      contractInput<ProjectWorkspaceService>(workspaceForDelete(new Error('database failed'))),
    );

    await expect(
      service.deleteAttachment('88888888-8888-4888-8888-888888888888', {
        projectId,
        attachmentId,
      }),
    ).rejects.toMatchObject({ code: 'RESEARCH_ATTACHMENT_FAILED' });
    expect(rename).toHaveBeenCalledTimes(2);
  });
});

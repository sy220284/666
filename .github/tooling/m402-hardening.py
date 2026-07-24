from pathlib import Path
import json
import subprocess

TARGET_BRANCH = 'work/m4-02-constraint-package'
EXPECTED_HEAD = '7f9e3c810f781b75574eb1e922b3a19d0b18c75f'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if text.count(old) != 1:
        raise SystemExit(f'{label}: expected one replacement target, found {text.count(old)}')
    return text.replace(old, new, 1)


contracts_path = Path('packages/contracts/src/constraint-package.ts')
contracts = contracts_path.read_text()
contracts = replace_once(
    contracts,
    "  'foreshadowing',\n  'canon_fact',",
    "  'foreshadowing',\n  'entity',\n  'canon_fact',",
    'entity source type',
)
contracts_path.write_text(contracts)


domain_path = Path('packages/domain/src/constraint-package.ts')
domain = domain_path.read_text()
old_estimator = """export function estimateConstraintTokens(value: string): number {
  let cjk = 0;
  let other = 0;
  for (const character of value) {
    if (/\\p{Script=Han}|\\p{Script=Hiragana}|\\p{Script=Katakana}|\\p{Script=Hangul}/u.test(character)) {
      cjk += 1;
    } else if (!/\\s/u.test(character)) {
      other += 1;
    }
  }
  return Math.max(1, cjk + Math.ceil(other / 4) + 8);
}
"""
new_estimator = """function isCjkCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0x20000 && codePoint <= 0x323af) ||
    (codePoint >= 0x3040 && codePoint <= 0x30ff) ||
    (codePoint >= 0x31f0 && codePoint <= 0x31ff) ||
    (codePoint >= 0x1100 && codePoint <= 0x11ff) ||
    (codePoint >= 0x3130 && codePoint <= 0x318f) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7af)
  );
}

function isWhitespaceCodePoint(codePoint: number): boolean {
  return (
    codePoint <= 0x20 ||
    (codePoint >= 0x7f && codePoint <= 0xa0) ||
    codePoint === 0x1680 ||
    (codePoint >= 0x2000 && codePoint <= 0x200a) ||
    codePoint === 0x2028 ||
    codePoint === 0x2029 ||
    codePoint === 0x202f ||
    codePoint === 0x205f ||
    codePoint === 0x3000 ||
    codePoint === 0xfeff
  );
}

export function estimateConstraintTokens(value: string): number {
  let cjk = 0;
  let other = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (isCjkCodePoint(codePoint)) cjk += 1;
    else if (!isWhitespaceCodePoint(codePoint)) other += 1;
  }
  return Math.max(1, cjk + Math.ceil(other / 4) + 8);
}
"""
domain = replace_once(domain, old_estimator, new_estimator, 'token estimator')
domain_path.write_text(domain)


core_path = Path('packages/core-service/src/constraint-package.ts')
core = core_path.read_text()
core = replace_once(
    core,
    """  readonly project: Record<string, unknown>;
  readonly chapter: ChapterRow;
  readonly brief: Record<string, unknown> | null;
""",
    """  readonly project: Record<string, unknown>;
  readonly chapter: ChapterRow;
  readonly eligibleChapterIds: readonly string[];
  readonly brief: Record<string, unknown> | null;
""",
    'eligible chapter context field',
)
core = replace_once(
    core,
    """  const rawChapter = chapters.find((row) => row.id === chapterId);
  if (!rawChapter) {
""",
    """  const chapterIndex = chapters.findIndex((row) => row.id === chapterId);
  const rawChapter = chapters[chapterIndex];
  if (chapterIndex < 0 || !rawChapter) {
""",
    'chapter position lookup',
)
core = replace_once(
    core,
    """    project,
    chapter,
    brief: brief ?? null,
""",
    """    project,
    chapter,
    eligibleChapterIds: chapters
      .slice(0, chapterIndex + 1)
      .map((row) => text(row.id, 'chapter.id')),
    brief: brief ?? null,
""",
    'eligible chapter return',
)
old_dedupe = """function deduplicateSources(sources: readonly ConstraintSource[]): ConstraintSource[] {
  const byId = new Map<string, ConstraintSource>();
  for (const source of sources) {
    const existing = byId.get(source.id);
    if (!existing || source.relevance > existing.relevance) byId.set(source.id, source);
  }
  return [...byId.values()];
}
"""
new_dedupe = """function deduplicateSources(sources: readonly ConstraintSource[]): ConstraintSource[] {
  const byId = new Map<string, ConstraintSource>();
  for (const source of sources) {
    const existing = byId.get(source.id);
    if (!existing || source.relevance > existing.relevance) byId.set(source.id, source);
  }
  const values = [...byId.values()];
  const authoritativeHashes = new Set(
    values
      .filter((source) => source.sourceType !== 'supplemental_search')
      .map((source) => source.contentHash),
  );
  const supplementalHashes = new Set<string>();
  return values.filter((source) => {
    if (source.sourceType !== 'supplemental_search') return true;
    if (authoritativeHashes.has(source.contentHash) || supplementalHashes.has(source.contentHash)) {
      return false;
    }
    supplementalHashes.add(source.contentHash);
    return true;
  });
}
"""
core = replace_once(core, old_dedupe, new_dedupe, 'source deduplication')
core = replace_once(
    core,
    """    relevance,
    temporalStatus: 'current',
""",
    """    relevance,
    temporalStatus: item.sourceType === 'version' ? 'historical' : 'current',
""",
    'supplemental temporal status',
)
core = replace_once(
    core,
    """    const snapshotChapterId = context.chapter.previousChapterId ?? input.chapterId;
    const snapshotResult = this.#stateProposal.readSnapshot({
      projectId: input.projectId,
      chapterId: snapshotChapterId,
    });
""",
    """    const snapshotChapterId = context.chapter.previousChapterId ?? input.chapterId;
    const snapshotResult = context.chapter.previousChapterId
      ? this.#stateProposal.readSnapshot({
          projectId: input.projectId,
          chapterId: context.chapter.previousChapterId,
        })
      : {
          snapshotSource: 'fallback_live_query' as const,
          snapshot: null,
          content: {
            entityStates: [],
            knowledgeStates: [],
            foreshadowings: [],
            arcMilestones: [],
          },
        };
""",
    'first chapter snapshot boundary',
)
core = replace_once(
    core,
    """        sourceType: 'canon_fact',
        sourceId: entityId,
        entityId,
        semanticKey: `entity:${entityId}:profile`,
""",
    """        sourceType: 'entity',
        sourceId: entityId,
        entityId,
        semanticKey: `entity:${entityId}:profile`,
""",
    'entity source traceability',
)
core = replace_once(
    core,
    """      result.items.forEach((item, index) =>
        sources.push(supplementalSource(item, Math.max(0.2, 0.7 - index * 0.02))),
      );
""",
    """      const eligibleChapterIds = new Set(context.eligibleChapterIds);
      result.items
        .filter((item) => item.chapterId === null || eligibleChapterIds.has(item.chapterId))
        .forEach((item, index) =>
          sources.push(supplementalSource(item, Math.max(0.2, 0.7 - index * 0.02))),
        );
""",
    'supplemental temporal filtering',
)
core_path.write_text(core)


integration_path = Path('tests/integration/constraint-package.test.ts')
integration = integration_path.read_text()
integration = replace_once(
    integration,
    """import { ConstraintPackageService } from '../../packages/core-service/src/constraint-package.js';
""",
    """import {
  ConstraintPackageService,
  ConstraintPackageServiceError,
} from '../../packages/core-service/src/constraint-package.js';
""",
    'integration error import',
)
new_tests = r'''

  it('does not consume the current chapter ending snapshot as pre-chapter continuity', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '首章时序项目', channel: '长篇' },
        harness.parent,
      );
      const first = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      const entityId = randomUUID();
      const versionId = randomUUID();
      await harness.workspace.writeProject(randomUUID(), project.projectId, (connection) => {
        connection
          .prepare(
            `INSERT INTO versions(
               id, chapter_id, source_draft_id, source_revision, title, description,
               label, word_count, content_hash, created_at
             ) VALUES(?, ?, ?, 0, ?, '', NULL, 0, ?, ?)`
          )
          .run(versionId, first.id, first.activeDraftId, '首章定稿', 'b'.repeat(64), now);
        connection.prepare('UPDATE chapters SET final_version_id = ? WHERE id = ?').run(versionId, first.id);
        connection
          .prepare(
            `INSERT INTO ending_snapshots(
               id, project_id, chapter_id, source_version_id, status,
               content_json, stale_reasons_json, created_at, stale_at
             ) VALUES(?, ?, ?, ?, 'valid', ?, '[]', ?, NULL)`
          )
          .run(
            randomUUID(),
            project.projectId,
            first.id,
            versionId,
            JSON.stringify({
              entityStates: [
                { entityId, stateKey: 'location', value: '首章结尾', sourceVersionId: versionId },
              ],
              knowledgeStates: [],
              foreshadowings: [],
              arcMilestones: [],
            }),
            now,
          );
      });

      const result = harness.constraints.build({
        projectId: project.projectId,
        chapterId: first.id,
        taskType: 'chapter',
        maxInputTokens: 4_096,
        safetyMarginTokens: 256,
        maxSupplementalResults: 0,
      });
      expect(result.snapshotSource).toBe('fallback_live_query');
      expect(result.sections.P2.some((source) => source.sourceType === 'ending_snapshot')).toBe(false);
      expect(result.sections.P2.some((source) => source.content.includes('首章结尾'))).toBe(false);
    } finally {
      await closeHarness(harness);
    }
  });

  it('filters future supplemental hits, marks versions historical, and removes exact duplicate recall', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '检索时序项目', channel: '长篇' },
        harness.parent,
      );
      const initial = harness.structure.list(project.projectId);
      const volume = initial.volumes[0]!;
      const first = volume.chapters[0]!;
      const withSecond = await harness.structure.createChapter(randomUUID(), {
        projectId: project.projectId,
        volumeId: volume.id,
        title: '当前章',
        placement: { kind: 'end' },
      });
      const second = withSecond.volumes[0]!.chapters[1]!;
      const withThird = await harness.structure.createChapter(randomUUID(), {
        projectId: project.projectId,
        volumeId: volume.id,
        title: '未来章',
        placement: { kind: 'end' },
      });
      const third = withThird.volumes[0]!.chapters[2]!;
      const versionId = randomUUID();
      const versionBlockId = randomUUID();
      await harness.workspace.writeProject(randomUUID(), project.projectId, (connection) => {
        connection.prepare('UPDATE draft_blocks SET text = ? WHERE draft_id = ?').run('灯火旧线索', first.activeDraftId);
        connection.prepare('UPDATE draft_blocks SET text = ? WHERE draft_id = ?').run('灯火当前稿', second.activeDraftId);
        connection.prepare('UPDATE draft_blocks SET text = ? WHERE draft_id = ?').run('灯火未来泄漏', third.activeDraftId);
        connection
          .prepare(
            `INSERT INTO versions(
               id, chapter_id, source_draft_id, source_revision, title, description,
               label, word_count, content_hash, created_at
             ) VALUES(?, ?, ?, 0, ?, '', NULL, 5, ?, ?)`
          )
          .run(versionId, first.id, first.activeDraftId, '灯火旧版本', 'c'.repeat(64), now);
        connection
          .prepare(
            `INSERT INTO version_blocks(
               version_id, logical_block_id, order_key, block_type, text,
               attributes_json, source, locked, content_hash
             ) VALUES(?, ?, 1024, 'paragraph', ?, '{}', 'manual', 0, ?)`
          )
          .run(versionId, versionBlockId, '灯火旧版本正文', 'd'.repeat(64));
      });
      await harness.search.rebuild(randomUUID(), project.projectId);

      const result = harness.constraints.build({
        projectId: project.projectId,
        chapterId: second.id,
        taskType: 'chapter',
        query: '灯',
        maxInputTokens: 8_192,
        safetyMarginTokens: 512,
        maxSupplementalResults: 20,
      });
      const supplemental = result.sections.P4.filter(
        (source) => source.sourceType === 'supplemental_search',
      );
      expect(supplemental.some((source) => source.chapterId === third.id)).toBe(false);
      expect(
        supplemental.some(
          (source) => source.sourceVersionId === versionId && source.temporalStatus === 'historical',
        ),
      ).toBe(true);
      const currentDraft = result.sections.P4.find(
        (source) => source.sourceType === 'current_draft' && source.chapterId === second.id,
      );
      expect(currentDraft).toBeDefined();
      expect(supplemental.some((source) => source.contentHash === currentDraft!.contentHash)).toBe(
        false,
      );
    } finally {
      await closeHarness(harness);
    }
  });

  it('reports a service-level budget error when mandatory constraints exceed the usable window', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '预算项目', channel: '长篇' },
        harness.parent,
      );
      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      await harness.workspace.writeProject(randomUUID(), project.projectId, (connection) => {
        connection
          .prepare(
            `INSERT INTO project_briefs(
               id, project_id, concept, reading_promise, protagonist_goal,
               core_conflict, ending_intent, required_json, forbidden_json, updated_at
             ) VALUES(?, ?, '', '', '', '', '', ?, '[]', ?)`
          )
          .run(randomUUID(), project.projectId, JSON.stringify(['必须保留'.repeat(150)]), now);
      });
      expect(() =>
        harness.constraints.build({
          projectId: project.projectId,
          chapterId: chapter.id,
          taskType: 'chapter',
          maxInputTokens: 512,
          safetyMarginTokens: 0,
          maxSupplementalResults: 0,
        }),
      ).toThrowError(ConstraintPackageServiceError);
      try {
        harness.constraints.build({
          projectId: project.projectId,
          chapterId: chapter.id,
          taskType: 'chapter',
          maxInputTokens: 512,
          safetyMarginTokens: 0,
          maxSupplementalResults: 0,
        });
      } catch (error) {
        expect(error).toMatchObject({ code: 'CONSTRAINT_PACKAGE_BUDGET_EXCEEDED' });
      }
    } finally {
      await closeHarness(harness);
    }
  });
'''
closing = "  });\n});\n"
if not integration.endswith(closing):
    raise SystemExit('integration test closing marker not found')
integration = integration[:-len(closing)] + "  });" + new_tests + "\n});\n"
integration_path.write_text(integration)


performance = r'''import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ConstraintPackageService } from '../../packages/core-service/src/constraint-package.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-24T12:00:00.000Z') };

function percentile95(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]!;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M4-02 constraint package performance', () => {
  it('assembles and trims a 1.5 million character draft within the local budget', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-constraint-performance-'));
    temporaryDirectories.push(root);
    const parent = path.join(root, 'projects');
    await mkdir(parent, { recursive: true });
    const appRuntime = await openAppRuntime({
      databasePath: path.join(root, 'app.sqlite'),
      migrationsDirectory: 'migrations/app',
      recoveryDirectory: path.join(root, 'app-recovery'),
      appVersion: '0.1.0',
      clock,
    });
    const workspace = new ProjectWorkspaceService({
      projectMigrationsDirectory: 'migrations/project',
      projectMigrationRecoveryDirectory: path.join(root, 'project-migration-recovery'),
      appVersion: '0.1.0',
      recentProjects: appRuntime.recentProjects,
      clock,
    });
    try {
      const project = await workspace.create(
        randomUUID(),
        { name: '约束包性能项目', channel: '长篇' },
        parent,
      );
      const chapter = new ProjectStructureService(workspace, { clock }).list(project.projectId)
        .volumes[0]!.chapters[0]!;
      const blockText = '玄烛城雨夜追索。'.repeat(10_000).slice(0, 100_000);
      await workspace.writeProject(randomUUID(), project.projectId, (connection) => {
        connection.prepare('DELETE FROM draft_blocks WHERE draft_id = ?').run(chapter.activeDraftId);
        const insert = connection.prepare(
          `INSERT INTO draft_blocks(
             id, draft_id, logical_block_id, order_key, block_type, text,
             attributes_json, source, locked, content_hash, revision
           ) VALUES(?, ?, ?, ?, 'paragraph', ?, '{}', 'manual', 0, NULL, 0)`,
        );
        for (let index = 0; index < 15; index += 1) {
          insert.run(
            randomUUID(),
            chapter.activeDraftId,
            randomUUID(),
            (index + 1) * 1024,
            blockText,
          );
        }
      });
      const service = new ConstraintPackageService(workspace);
      const input = {
        projectId: project.projectId,
        chapterId: chapter.id,
        taskType: 'chapter' as const,
        maxInputTokens: 262_144,
        safetyMarginTokens: 4_096,
        maxSupplementalResults: 0,
      };
      service.build(input);
      const durations: number[] = [];
      let last;
      for (let index = 0; index < 5; index += 1) {
        const started = performance.now();
        last = service.build(input);
        durations.push(performance.now() - started);
      }
      const p95 = percentile95(durations);
      console.info(JSON.stringify({ fixtureCharacters: 1_500_000, buildP95Ms: p95 }));
      expect(p95).toBeLessThan(1_000);
      expect(last!.estimatedTokens).toBeLessThanOrEqual(last!.budget.usableTokens);
      expect(last!.trimLog.length).toBeGreaterThan(0);
    } finally {
      await workspace.shutdown();
      await appRuntime.close();
    }
  }, 30_000);
});
'''
Path('tests/performance/constraint-package-performance.test.ts').write_text(performance)


active_path = Path('docs/tasks/ACTIVE_TASK.json')
active = json.loads(active_path.read_text())
allowed = active['activeTask']['allowedPaths']
if 'tests/performance/' not in allowed:
    allowed.insert(allowed.index('evals/'), 'tests/performance/')
active_path.write_text(json.dumps(active, ensure_ascii=False, indent=2) + '\n')

active_md_path = Path('docs/tasks/ACTIVE_TASK.md')
active_md = active_md_path.read_text()
active_md = replace_once(
    active_md,
    '  - tests/integration/\n  - evals/',
    '  - tests/integration/\n  - tests/performance/\n  - evals/',
    'active task performance mirror',
)
active_md_path.write_text(active_md)

summary_path = Path('docs/test-evidence/M4-02/summary.md')
summary = summary_path.read_text()
summary += '''\n## 复核加固\n\n- 首章不读取本章尾快照，阻断章末状态倒灌到章前约束。\n- 公共检索补充按章节顺序过滤未来章，Version明确标记为historical。\n- Entity资料使用独立来源类型；精确重复的补充召回不再重复占用Token。\n- 增加短中文搜索、首章时序、未来章隔离、服务超限与150万字符性能回归。\n'''
summary_path.write_text(summary)

commands_path = Path('docs/test-evidence/M4-02/commands.txt')
commands = commands_path.read_text()
if 'tests/performance/constraint-package-performance.test.ts' not in commands:
    commands += 'pnpm exec vitest run tests/performance/constraint-package-performance.test.ts\n'
commands_path.write_text(commands)

known_path = Path('docs/test-evidence/M4-02/known-risks.md')
known = known_path.read_text()
known += '\n- 当前性能基线覆盖150万字符确定性组装与裁剪；Provider特定Tokenizer和模型窗口映射留待M4-03/M4-05。\n'
known_path.write_text(known)

files = [
    'packages/contracts/src/constraint-package.ts',
    'packages/domain/src/constraint-package.ts',
    'packages/core-service/src/constraint-package.ts',
    'tests/integration/constraint-package.test.ts',
    'tests/performance/constraint-package-performance.test.ts',
    'docs/tasks/ACTIVE_TASK.json',
    'docs/tasks/ACTIVE_TASK.md',
    'docs/test-evidence/M4-02/summary.md',
    'docs/test-evidence/M4-02/known-risks.md',
]
subprocess.run(['pnpm', 'exec', 'prettier', '--write', *files], check=True)
subprocess.run(['pnpm', 'test:prepare'], check=True)
subprocess.run(
    [
        'pnpm',
        'exec',
        'vitest',
        'run',
        'tests/unit/constraint-package-domain.test.ts',
        'tests/integration/constraint-package.test.ts',
        'tests/performance/constraint-package-performance.test.ts',
    ],
    check=True,
)
subprocess.run(['pnpm', 'typecheck'], check=True)
subprocess.run(['pnpm', 'lint'], check=True)
subprocess.run(['pnpm', 'test:eval'], check=True)
subprocess.run(['node', 'scripts/taskctl.mjs', 'validate'], check=True)
subprocess.run(['git', 'diff', '--check'], check=True)
subprocess.run(['git', 'add', '--all'], check=True)
subprocess.run(['git', 'commit', '-m', '修复：加固M4-02时序过滤与性能边界'], check=True)
subprocess.run(['git', 'push', 'origin', f'HEAD:{TARGET_BRANCH}'], check=True)

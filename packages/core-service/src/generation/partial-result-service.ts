import { candidateTypeForPartial, insertProseCandidate } from './candidate-persistence.js';
import {
  assertActive,
  type GenerationPartialDecision,
  type GenerationRunIdentity,
  type GenerationRunServiceContext,
  GenerationRunServiceError,
  get,
  type PartialBufferRow,
  readRun,
  sha256,
} from './run-repository.js';
import { type GenerationRun } from '@worldforge/contracts';

export function recordPartial(
  context: GenerationRunServiceContext,
  requestId: string,
  input: GenerationRunIdentity & {
    readonly text: string;
  },
): Promise<GenerationRun> {
  const identity: GenerationRunIdentity = {
    projectId: input.projectId,
    runId: input.runId,
  };
  if (!input.text) return Promise.resolve(get(context, identity));
  return context.workspace.writeProject(requestId, input.projectId, (database) => {
    const run = readRun(database, identity);
    assertActive(run);
    const now = context.clock.now().toISOString();
    database
      .prepare(
        `INSERT INTO generation_partial_buffers(
             run_id, text, content_hash, received_characters, created_at, updated_at
           ) VALUES(?, ?, ?, ?, ?, ?)
           ON CONFLICT(run_id) DO UPDATE SET
             text = excluded.text,
             content_hash = excluded.content_hash,
             received_characters = excluded.received_characters,
             updated_at = excluded.updated_at`,
      )
      .run(input.runId, input.text, sha256(input.text), input.text.length, now, now);
    database
      .prepare(`UPDATE generation_runs SET partial_status = 'available' WHERE id = ?`)
      .run(input.runId);
    return readRun(database, identity);
  });
}

export function savePartial(
  context: GenerationRunServiceContext,
  requestId: string,
  input: GenerationRunIdentity,
): Promise<GenerationPartialDecision> {
  return context.workspace.writeProject(requestId, input.projectId, (database) => {
    const run = readRun(database, input);
    if (run.partialStatus !== 'available') {
      throw new GenerationRunServiceError(
        run.partialStatus === 'saved' || run.partialStatus === 'discarded'
          ? 'GENERATION_PARTIAL_DECIDED'
          : 'GENERATION_PARTIAL_UNAVAILABLE',
        'No undecided partial output is available.',
      );
    }
    const buffer = database
      .prepare(`SELECT text FROM generation_partial_buffers WHERE run_id = ?`)
      .get(input.runId) as PartialBufferRow | undefined;
    if (!buffer) {
      throw new GenerationRunServiceError(
        'GENERATION_PARTIAL_UNAVAILABLE',
        'The partial output buffer is missing.',
      );
    }
    const paragraphs = buffer.text
      .trim()
      .split(/\n\s*\n/u)
      .map((text) => text.trim())
      .filter(Boolean);
    if (paragraphs.length === 0) {
      throw new GenerationRunServiceError(
        'GENERATION_CANDIDATE_INVALID',
        'The partial output contains no prose.',
      );
    }
    const now = context.clock.now().toISOString();
    const candidate = insertProseCandidate(
      database,
      run,
      {
        title: '未完成的生成结果',
        candidateType: candidateTypeForPartial(run.runType),
        completeness: 'partial',
        blocks: paragraphs.map((text) => ({
          blockType: 'paragraph' as const,
          text,
          attributes: {},
        })),
      },
      context.idFactory,
      now,
    );
    database
      .prepare(
        `INSERT INTO generation_result_refs(
             run_id, result_type, result_id, candidate_kind, created_at
           ) VALUES(?, 'candidate', ?, 'prose', ?)`,
      )
      .run(run.runId, candidate.candidateId, now);
    database
      .prepare(`UPDATE generation_runs SET partial_status = 'saved' WHERE id = ?`)
      .run(run.runId);
    database.prepare(`DELETE FROM generation_partial_buffers WHERE run_id = ?`).run(run.runId);
    return { run: readRun(database, input), candidate };
  });
}

export function discardPartial(
  context: GenerationRunServiceContext,
  requestId: string,
  input: GenerationRunIdentity,
): Promise<GenerationPartialDecision> {
  return context.workspace.writeProject(requestId, input.projectId, (database) => {
    const run = readRun(database, input);
    if (run.partialStatus !== 'available') {
      throw new GenerationRunServiceError(
        run.partialStatus === 'saved' || run.partialStatus === 'discarded'
          ? 'GENERATION_PARTIAL_DECIDED'
          : 'GENERATION_PARTIAL_UNAVAILABLE',
        'No undecided partial output is available.',
      );
    }
    database.prepare(`DELETE FROM generation_partial_buffers WHERE run_id = ?`).run(run.runId);
    database
      .prepare(`UPDATE generation_runs SET partial_status = 'discarded' WHERE id = ?`)
      .run(run.runId);
    return { run: readRun(database, input), candidate: null };
  });
}
